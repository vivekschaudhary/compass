import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from compass.orchestrator import handoff as h
from compass.orchestrator import survey as s
from compass.orchestrator import survey_contract as c

FIXTURES = Path(__file__).parent / "fixtures"


def _load(name):
    return json.loads((FIXTURES / name).read_text())


def _result_stdout(text, usage=None):
    return json.dumps({"type": "result", "is_error": False, "result": text,
                       "usage": usage or {"input_tokens": 100, "output_tokens": 50}})


class FakeRunner:
    """Stands in for the claude CLI: records what it was asked, answers with canned stdout."""
    def __init__(self, stdout="", returncode=0, stderr="", raises=None):
        self.stdout, self.returncode, self.stderr, self.raises = stdout, returncode, stderr, raises
        self.argv = self.input = self.cwd = None

    def __call__(self, argv, input=None, cwd=None):
        self.argv, self.input, self.cwd = argv, input, cwd
        if self.raises:
            raise self.raises
        return subprocess.CompletedProcess(argv, self.returncode, self.stdout, self.stderr)


class ContractTests(unittest.TestCase):
    def test_request_fixture_parses(self):
        r = c.parse_request(_load("survey_request.json"))
        self.assertEqual(r.repos[0].key, "api")
        self.assertEqual(r.caller.kind, "ts")

    def test_no_repos_refused(self):
        d = _load("survey_request.json")
        d["repos"] = []
        with self.assertRaisesRegex(c.ContractError, "repos"):
            c.parse_request(d)

    def test_duplicate_repo_key_refused(self):
        d = _load("survey_request.json")
        d["repos"] = d["repos"] * 2
        with self.assertRaisesRegex(c.ContractError, "twice"):
            c.parse_request(d)

    def test_blank_focus_refused(self):
        d = _load("survey_request.json")
        d["focus"] = " "
        with self.assertRaisesRegex(c.ContractError, "focus"):
            c.parse_request(d)

    def test_wrong_version_refused(self):
        d = _load("survey_request.json")
        d["version"] = 2
        with self.assertRaisesRegex(c.ContractError, "version"):
            c.parse_request(d)

    def test_context_absent_is_empty_but_wrong_type_refused(self):
        d = _load("survey_request.json")
        del d["context"]
        self.assertEqual(c.parse_request(d).context, "")
        d["context"] = 3
        with self.assertRaisesRegex(c.ContractError, "context must be a string"):
            c.parse_request(d)

    def test_surveyed_fixture_matches_wire_shape(self):
        r = c.SurveyResult(status="surveyed", sections=(c.Section("Sign-in", "Handled in `src/auth.ts:10`."),),
                           files_cited=("src/auth.ts",), refusal=None, log_ref="l",
                           usage={"input_tokens": 100, "output_tokens": 50})
        self.assertEqual(c.result_to_dict(r), _load("survey_result_surveyed.json"))

    def test_surveyed_with_no_sections_or_no_files_refused(self):
        with self.assertRaisesRegex(c.ContractError, "section"):
            c.result_to_dict(c.SurveyResult("surveyed", (), ("a",), None, "l"))
        with self.assertRaisesRegex(c.ContractError, "cited file"):
            c.result_to_dict(c.SurveyResult("surveyed", (c.Section("h", "b"),), (), None, "l"))

    def test_a_failure_without_a_reason_refused(self):
        for status in ("survey_failed", "refused"):
            with self.assertRaisesRegex(c.ContractError, "requires a reason"):
                c.result_to_dict(c.SurveyResult(status, (), (), None, "l"))


class RunSurveyTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.repo = Path(self.tmp.name) / "api"
        (self.repo / "src").mkdir(parents=True)
        (self.repo / "src" / "auth.ts").write_text("export const x = 1\n")
        env = mock.patch.dict(os.environ, {"COMPASS_HANDOFF_DIR": str(Path(self.tmp.name) / "handoff")})
        env.start()
        self.addCleanup(env.stop)

    def _req(self, **over):
        d = _load("survey_request.json")
        d["repos"] = [{"key": "api", "local_path": str(self.repo)}]
        d.update(over)
        return c.parse_request(d)

    def test_read_only_tools_are_named_and_nothing_wider(self):
        runner = FakeRunner(_result_stdout("## Auth\n\nSee `src/auth.ts:1`."))
        s.run_survey(self._req(), runner=runner)
        a = runner.argv
        self.assertEqual(a[a.index("--tools") + 1], "Read,Glob,Grep")
        self.assertEqual(a[a.index("--allowedTools") + 1], "Read,Glob,Grep")
        self.assertNotIn("bypassPermissions", a)
        self.assertEqual(a[a.index("--setting-sources") + 1], "")
        self.assertEqual(runner.cwd, str(self.repo))

    def test_prompt_carries_the_focus_the_context_and_the_repo_path(self):
        runner = FakeRunner(_result_stdout("## A\n\n`src/auth.ts`"))
        s.run_survey(self._req(), runner=runner)
        self.assertIn("Apple sign-in", runner.input)
        self.assertIn("Epic ACC-E1", runner.input)
        self.assertIn(str(self.repo), runner.input)

    def test_a_verified_survey_is_surveyed_with_sections_and_files(self):
        runner = FakeRunner(_result_stdout("## Auth\n\nSign-in lives in `src/auth.ts:1`.\n\n## Data\n\nNot found in `src/`."))
        r = s.run_survey(self._req(), runner=runner)
        self.assertEqual(r.status, "surveyed")
        self.assertEqual([x.heading for x in r.sections], ["Auth", "Data"])
        self.assertEqual(r.files_cited, ("src/auth.ts", "src"))
        self.assertIn("`src/auth.ts:1`", r.sections[0].body)
        self.assertEqual(r.usage, {"input_tokens": 100, "output_tokens": 50})

    def test_a_cited_file_that_does_not_exist_fails_the_survey(self):
        runner = FakeRunner(_result_stdout("## Auth\n\n`src/auth.ts` and `src/oauth/apple.ts`."))
        r = s.run_survey(self._req(), runner=runner)
        self.assertEqual(r.status, "survey_failed")
        self.assertIn("src/oauth/apple.ts", r.refusal)
        self.assertEqual(r.sections, ())

    def test_a_path_that_escapes_the_checkout_does_not_count(self):
        (Path(self.tmp.name) / "secret.txt").write_text("x")
        runner = FakeRunner(_result_stdout("## A\n\n`../secret.txt`"))
        self.assertEqual(s.run_survey(self._req(), runner=runner).status, "survey_failed")

    def test_findings_that_cite_nothing_fail(self):
        runner = FakeRunner(_result_stdout("## Auth\n\nIt uses sessions."))
        r = s.run_survey(self._req(), runner=runner)
        self.assertEqual(r.status, "survey_failed")
        self.assertIn("cite no file", r.refusal)

    def test_refuse_sentinel_is_a_refusal(self):
        r = s.run_survey(self._req(), runner=FakeRunner(_result_stdout("REFUSE: cannot read the repo")))
        self.assertEqual((r.status, r.refusal), ("refused", "cannot read the repo"))

    def test_no_checkout_on_disk_is_refused_without_spawning(self):
        runner = FakeRunner(_result_stdout("x"))
        req = self._req(repos=[{"key": "api", "local_path": "/nonexistent/path"}])
        r = s.run_survey(req, runner=runner)
        self.assertEqual(r.status, "refused")
        self.assertIsNone(runner.argv)

    def test_nonzero_exit_empty_output_and_runner_exception_all_fail_loudly(self):
        for runner in (FakeRunner("", returncode=1, stderr="not logged in"),
                       FakeRunner(_result_stdout("   ")),
                       FakeRunner("not json"),
                       FakeRunner(raises=RuntimeError("no output for 300s"))):
            r = s.run_survey(self._req(), runner=runner)
            self.assertEqual(r.status, "survey_failed", runner.stdout)
            self.assertTrue(r.refusal)

    def test_things_that_are_not_file_claims_are_not_looked_up(self):
        body = ("## A\n\nRoute `/api/auth/login`, hook `useSession`, run `npm run build`, "
                "type `React.Component`, and the real file `src/auth.ts:1`.")
        r = s.run_survey(self._req(), runner=FakeRunner(_result_stdout(body)))
        self.assertEqual(r.status, "surveyed")
        self.assertEqual(r.files_cited, ("src/auth.ts",))

    def test_a_line_range_citation_is_verified_by_its_path(self):
        r = s.run_survey(self._req(), runner=FakeRunner(_result_stdout("## A\n\nSee `src/auth.ts:1-3`.")))
        self.assertEqual(r.files_cited, ("src/auth.ts",))

    def test_text_before_the_first_heading_is_kept_as_overview(self):
        runner = FakeRunner(_result_stdout("Intro `src/auth.ts`\n\n## A\n\nbody"))
        r = s.run_survey(self._req(), runner=runner)
        self.assertEqual([x.heading for x in r.sections], ["Overview", "A"])


class HandoffVerbTests(unittest.TestCase):
    def test_survey_is_a_known_verb(self):
        self.assertIn("survey", h.VERBS)

    def test_an_invalid_request_comes_back_as_invalid_input(self):
        out = h.dispatch("survey", {"version": 1})
        self.assertFalse(out["ok"])
        self.assertEqual(out["error"]["code"], "invalid_input")


if __name__ == "__main__":
    unittest.main()

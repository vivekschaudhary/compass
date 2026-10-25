"""spec_source: framework content from the DB, never the disk.

Three things matter and each has a test: the tier rules (pinned by the shared vector file), a
missing row HALTS rather than defaulting, and a failed read is not mistaken for an absent row.
"""
import json
import sys
import unittest
import urllib.error
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from compass.orchestrator import spec_source as S

VECTORS = json.loads((Path(__file__).parent / "fixtures" / "spec_resolution_vectors.json").read_text())


class TestVectors(unittest.TestCase):
    def test_spec_tiers(self):
        for c in VECTORS["spec"]:
            with self.subTest(c["name"]):
                self.assertEqual(S.pick_spec(c["rows"], c["engagement"], c["path"]), c["expect"])

    def test_template_tiers(self):
        for c in VECTORS["template"]:
            with self.subTest(c["name"]):
                got = S.pick_template(c["rows"], c["engagement"], c["org"], c["template"])
                if c["expect"] is None:
                    self.assertIsNone(got)
                else:
                    self.assertEqual({k: got[k] for k in c["expect"]}, c["expect"])

    def test_role_tiers(self):
        for c in VECTORS["role"]:
            with self.subTest(c["name"]):
                got = S.pick_role(c["rows"], c["engagement"], c["code"])
                self.assertEqual(got["agent"] if got else None, c["expect_agent"])


    def test_workflow_tiers(self):
        for c in VECTORS["workflow"]:
            with self.subTest(c["name"]):
                got = S.pick_workflow(c["rows"], c["engagement"], c["code"])
                self.assertEqual(got["id"] if got else None, c["expect_id"])


class TestInMemory(unittest.TestCase):
    def test_resolves_through_the_same_rules(self):
        src = S.InMemorySpecSource(
            specs=[{"path": "agents/a.md", "org_id": "default", "engagement_id": None, "content": "A"}],
            engagement_id="e1")
        self.assertEqual(src.spec("agents/a.md"), "A")

    def test_missing_halts_with_the_path_and_the_fix(self):
        with self.assertRaises(S.SpecMissing) as cm:
            S.InMemorySpecSource().spec("agents/none.md")
        self.assertIn("agents/none.md", str(cm.exception))
        self.assertIn("seed-specs", str(cm.exception))

    def test_lists_a_prefix(self):
        src = S.InMemorySpecSource(specs=[
            {"path": "agents/b.md", "org_id": "default", "content": "x"},
            {"path": "agents/a.md", "org_id": "default", "content": "x"},
            {"path": "stacks/s.md", "org_id": "default", "content": "x"}])
        self.assertEqual(src.spec_paths("agents/"), ["agents/a.md", "agents/b.md"])

    def test_refuses_paths_that_are_not_framework_files(self):
        src = S.InMemorySpecSource()
        for bad in ["", "/etc/passwd", "agents/../../etc/passwd", " agents/a.md", "a\0b"]:
            with self.subTest(bad), self.assertRaises(S.SpecMissing):
                src.spec(bad)


class Recorder:
    """A transport that records the URL and answers from a script."""
    def __init__(self, *replies):
        self.replies, self.calls = list(replies), []

    def __call__(self, method, url, headers, body):
        self.calls.append((method, url, headers))
        r = self.replies.pop(0)
        if isinstance(r, Exception):
            raise r
        return r


def db(transport, engagement="e1"):
    return S.DbSpecSource("https://x.supabase.co/", "KEY", engagement, transport=transport)


class TestDbSource(unittest.TestCase):
    def test_reads_both_tiers_and_sends_the_key(self):
        t = Recorder((200, [
            {"path": "agents/a.md", "org_id": "default", "engagement_id": None, "content": "ORG"},
            {"path": "agents/a.md", "org_id": None, "engagement_id": "e1", "content": "ENG"}]))
        self.assertEqual(db(t).spec("agents/a.md"), "ENG")
        _, url, headers = t.calls[0]
        self.assertTrue(url.startswith("https://x.supabase.co/rest/v1/spec_file?"))
        self.assertIn("path=eq.agents/a.md", url.replace("%2F", "/"))
        self.assertIn("engagement_id.eq.e1", url)
        self.assertEqual(headers["apikey"], "KEY")
        self.assertEqual(headers["Authorization"], "Bearer KEY")

    def test_no_row_is_missing_not_empty(self):
        with self.assertRaises(S.SpecMissing):
            db(Recorder((200, []))).spec("agents/a.md")

    def test_a_failed_read_is_unavailable_not_missing(self):
        for reply in [(401, {"message": "bad key"}), (500, {"error": "boom"}),
                      urllib.error.URLError("refused")]:
            with self.subTest(str(reply)), self.assertRaises(S.SpecUnavailable):
                db(Recorder(reply)).spec("agents/a.md")

    def test_template_looks_up_the_org_once(self):
        row = {"name": "sow", "org_id": "o1", "engagement_id": None, "body": "B", "title": "T"}
        t = Recorder((200, [row]), (200, [{"id": "o1"}]), (200, [row]))   # rows, org, rows (org cached)
        src = db(t)
        self.assertEqual(src.template("sow")["tier"], "org")
        src.template("sow")
        self.assertEqual(sum("/org?" in c[1] for c in t.calls), 1)

    def test_role_resolves_the_agent(self):
        t = Recorder((200, [{"id": "o1"}]),
                     (200, [{"code": "engineer", "engagement_id": None, "agent": "engineer", "hosts": ["claude"]}]))
        self.assertEqual(db(t).role("engineer")["hosts"], ["claude"])

    def test_unknown_org_is_missing(self):
        with self.assertRaises(S.SpecMissing):
            db(Recorder((200, []))).role("engineer")

    def test_lists_a_prefix(self):
        t = Recorder((200, [{"path": "agents/b.md"}, {"path": "agents/a.md"}, {"path": "agents/a.md"}]))
        self.assertEqual(db(t).spec_paths("agents/"), ["agents/a.md", "agents/b.md"])


BUILD_STEPS = [
    {"ord": 1, "kind": "agent", "role_code": "engineer", "task": "implement-story", "title": "Implement the story",
     "nests_workflow_code": None, "depends_on": []},
    {"ord": 2, "kind": "agent", "role_code": "automation", "task": "write-e2e-tests", "title": "Tests",
     "nests_workflow_code": None, "depends_on": ["implement-story"]},
    {"ord": 3, "kind": "hitl", "role_code": "principal-engineer", "task": "approve-build", "title": "Accept",
     "nests_workflow_code": None, "depends_on": ["write-e2e-tests"]},
]


def build_transport(steps=BUILD_STEPS, versions=None, roles=None):
    """Replies in the order DbSpecSource asks: org, workflow, version, steps, then one per role."""
    versions = [{"id": "v1", "version": 1}] if versions is None else versions
    roles = roles if roles is not None else {"engineer": "engineer", "automation": "automation",
                                              "principal-engineer": "principal-engineer"}
    replies = [(200, [{"id": "o1"}]), (200, [{"id": "w1", "code": "build", "engagement_id": None}]),
               (200, versions), (200, steps)]
    for code in ("engineer", "automation", "principal-engineer"):
        replies.append((200, [{"code": code, "engagement_id": None, "agent": roles[code]}] if code in roles else []))
    return Recorder(*replies)


class TestWorkflowSteps(unittest.TestCase):
    def test_reads_the_published_version_in_ord_order_with_agents_resolved(self):
        t = build_transport()
        steps = db(t).workflow_steps("build")
        self.assertEqual([(s["ord"], s["agent"], s["task"]) for s in steps],
                         [(1, "engineer", "implement-story"), (2, "automation", "write-e2e-tests"),
                          (3, "principal-engineer", "approve-build")])
        urls = [c[1] for c in t.calls]
        self.assertIn("status=eq.published", urls[2])
        self.assertIn("order=ord.asc", urls[3])
        self.assertIn("enabled=eq.true", urls[1])

    def test_no_published_version_is_missing(self):
        with self.assertRaises(S.SpecMissing) as cm:
            db(build_transport(versions=[])).workflow_steps("build")
        self.assertIn("no published version", str(cm.exception))

    def test_unknown_workflow_is_missing(self):
        with self.assertRaises(S.SpecMissing):
            db(Recorder((200, [{"id": "o1"}]), (200, []))).workflow_steps("nope")

    def test_an_agent_step_for_a_role_that_does_not_exist_halts(self):
        with self.assertRaises(S.SpecMissing) as cm:
            db(build_transport(roles={"automation": "automation"})).workflow_steps("build")
        self.assertIn("engineer", str(cm.exception))

    def test_a_gate_row_may_name_a_role_with_no_row(self):
        steps = db(build_transport(roles={"engineer": "engineer", "automation": "automation"})).workflow_steps("build")
        self.assertIsNone(steps[2]["agent"])

    def test_in_memory_serves_the_same_shape(self):
        src = S.InMemorySpecSource(workflows=[{"code": "build", "engagement_id": None,
                                                "steps": [{"ord": 2, "agent": "b"}, {"ord": 1, "agent": "a"}]}])
        self.assertEqual([s["ord"] for s in src.workflow_steps("build")], [1, 2])
        with self.assertRaises(S.SpecMissing):
            src.workflow_steps("other")


class TestWorkflowCodes(unittest.TestCase):
    def test_only_enabled_workflows_with_a_published_version(self):
        t = Recorder((200, [{"id": "o1"}]),
                     (200, [{"id": "w1", "code": "build"}, {"id": "w2", "code": "draft-only"}]),
                     (200, [{"workflow_id": "w1"}]))
        self.assertEqual(db(t).workflow_codes(), ["build"])
        self.assertIn("enabled=eq.true", t.calls[1][1])
        self.assertIn("status=eq.published", t.calls[2][1])

    def test_none_enabled_is_empty(self):
        self.assertEqual(db(Recorder((200, [{"id": "o1"}]), (200, []))).workflow_codes(), [])

    def test_in_memory(self):
        src = S.InMemorySpecSource(engagement_id="e1", workflows=[
            {"code": "b", "engagement_id": None, "steps": [{"ord": 1}]},
            {"code": "a", "engagement_id": "e1", "steps": [{"ord": 1}]},
            {"code": "x", "engagement_id": "e2", "steps": [{"ord": 1}]},
            {"code": "empty", "engagement_id": None, "steps": []}])
        self.assertEqual(src.workflow_codes(), ["a", "b"])


class TestFromEnv(unittest.TestCase):
    def test_absent_credentials_halt_rather_than_fall_back(self):
        with self.assertRaises(S.SpecUnavailable) as cm:
            S.from_env("e1", env={})
        self.assertIn("no disk fallback", str(cm.exception))

    def test_builds_a_source_from_the_apps_variables(self):
        src = S.from_env("e1", env={"NEXT_PUBLIC_SUPABASE_URL": "https://x.supabase.co",
                                    "SUPABASE_SERVICE_ROLE_KEY": "K"})
        self.assertEqual(src.engagement_id, "e1")


if __name__ == "__main__":
    unittest.main()

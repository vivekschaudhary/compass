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
                got = S.pick_template(c["rows"], c["engagement"], c["org"], c["name"])
                if c["expect"] is None:
                    self.assertIsNone(got)
                else:
                    self.assertEqual({k: got[k] for k in c["expect"]}, c["expect"])

    def test_role_tiers(self):
        for c in VECTORS["role"]:
            with self.subTest(c["name"]):
                got = S.pick_role(c["rows"], c["engagement"], c["code"])
                self.assertEqual(got["agent"] if got else None, c["expect_agent"])


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

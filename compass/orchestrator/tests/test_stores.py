"""Store-projection tests — Jira/Confluence backends + connector routing.

The HTTP transport is injected (FakeTransport), so the object mapping + idempotency
(update-not-create via the distribution pointer) are proven without a live Atlassian.
"""
import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[4]))

from compass.orchestrator import stores, connector


class FakeTransport:
    """Records each call; returns canned (status, dict) responses in order."""
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []

    def __call__(self, method, url, headers, body):
        self.calls.append({"method": method, "url": url, "body": body})
        return self.responses.pop(0) if self.responses else (200, {})


AUTH = {"base_url": "https://acme.atlassian.net", "email": "x@x.com", "token": "t"}


class TestJiraPush(unittest.TestCase):
    def test_create(self):
        t = FakeTransport([(201, {"key": "PROJ-42"})])
        res = stores.jira_push(AUTH, "PROJ", "Story", "My story", "body", transport=t)
        self.assertEqual((res["action"], res["pointer"], res["ok"]), ("created", "PROJ-42", True))
        self.assertEqual(t.calls[0]["method"], "POST")
        self.assertIn("/rest/api/3/issue", t.calls[0]["url"])
        self.assertEqual(t.calls[0]["body"]["fields"]["project"], {"key": "PROJ"})
        self.assertEqual(t.calls[0]["body"]["fields"]["issuetype"], {"name": "Story"})

    def test_update_idempotent(self):
        t = FakeTransport([(204, {})])
        res = stores.jira_push(AUTH, "PROJ", "Story", "s", "body", key="PROJ-42", transport=t)
        self.assertEqual((res["action"], res["pointer"], res["ok"]), ("updated", "PROJ-42", True))
        self.assertEqual(t.calls[0]["method"], "PUT")
        self.assertIn("/issue/PROJ-42", t.calls[0]["url"])


class TestConfluencePush(unittest.TestCase):
    def test_create(self):
        t = FakeTransport([(200, {"id": "12345",
                                  "_links": {"base": "https://acme.atlassian.net/wiki",
                                             "webui": "/pages/12345"}})])
        res = stores.confluence_push(AUTH, "ENG", "Title", "body", transport=t)
        self.assertEqual((res["action"], res["pointer"], res["ok"]), ("created", "12345", True))
        self.assertEqual(t.calls[0]["method"], "POST")
        self.assertEqual(t.calls[0]["body"]["space"], {"key": "ENG"})

    def test_update_bumps_version(self):
        t = FakeTransport([(200, {"version": {"number": 3}}), (200, {"id": "12345", "_links": {}})])
        res = stores.confluence_push(AUTH, "ENG", "Title", "body", page_id="12345", transport=t)
        self.assertEqual(res["action"], "updated")
        self.assertEqual(t.calls[0]["method"], "GET")
        self.assertEqual(t.calls[1]["method"], "PUT")
        self.assertEqual(t.calls[1]["body"]["version"], {"number": 4})

    def test_update_bails_on_failed_version_get(self):
        # [Codex review] a 404/401 on the version GET must NOT become a version-2 PUT
        t = FakeTransport([(404, {"message": "not found"})])
        res = stores.confluence_push(AUTH, "ENG", "T", "body", page_id="999", transport=t)
        self.assertFalse(res["ok"])
        self.assertEqual(len(t.calls), 1)            # bailed after GET — no PUT
        self.assertEqual(t.calls[0]["method"], "GET")


class TestAuthResolution(unittest.TestCase):
    KEYS = ("JIRA_BASE_URL", "JIRA_EMAIL", "JIRA_API_TOKEN",
            "ATLASSIAN_BASE_URL", "ATLASSIAN_EMAIL", "ATLASSIAN_API_TOKEN")

    def setUp(self):
        self._saved = {k: os.environ.get(k) for k in self.KEYS}
        for k in self.KEYS:
            os.environ.pop(k, None)

    def tearDown(self):
        for k, v in self._saved.items():
            os.environ.pop(k, None) if v is None else os.environ.__setitem__(k, v)

    def test_none_when_unset(self):
        self.assertIsNone(stores.jira_auth())

    def test_jira_env_strips_trailing_slash(self):
        os.environ.update(JIRA_BASE_URL="https://a.net/", JIRA_EMAIL="e", JIRA_API_TOKEN="t")
        self.assertEqual(stores.jira_auth()["base_url"], "https://a.net")

    def test_atlassian_shared_fallback(self):
        os.environ.update(ATLASSIAN_BASE_URL="https://a.net", ATLASSIAN_EMAIL="e",
                          ATLASSIAN_API_TOKEN="t")
        self.assertIsNotNone(stores.jira_auth())
        self.assertIsNotNone(stores.confluence_auth())


class TestConnectorRouting(unittest.TestCase):
    KEYS = ("JIRA_BASE_URL", "JIRA_EMAIL", "JIRA_API_TOKEN", "JIRA_PROJECT")

    def setUp(self):
        self.project_dir = Path(tempfile.mkdtemp())
        self._saved = {k: os.environ.get(k) for k in self.KEYS}
        for k in self.KEYS:
            os.environ.pop(k, None)

    def tearDown(self):
        for k, v in self._saved.items():
            os.environ.pop(k, None) if v is None else os.environ.__setitem__(k, v)

    def test_jira_fallback_when_unconfigured(self):
        rel = "docs/bets/CB-1/stories/CB-1-1/story.md"
        label = connector.push_artifact(self.project_dir, rel, "# Story\nbody", "jira")
        self.assertIn("filesystem fallback — jira not configured", label)
        self.assertTrue((self.project_dir / rel).exists())  # Compass-primary cache always written

    def test_jira_create_then_idempotent_update(self):
        os.environ.update(JIRA_BASE_URL="https://a.net", JIRA_EMAIL="e",
                          JIRA_API_TOKEN="t", JIRA_PROJECT="PROJ")
        rel = "docs/bets/CB-1/stories/CB-1-1/story.md"
        content = "---\nid: CB-1-1\n---\n# My story\nbody"
        t1 = FakeTransport([(201, {"key": "PROJ-7"})])
        label = connector.push_artifact(self.project_dir, rel, content, "jira", transport=t1)
        self.assertEqual(label, "jira (PROJ-7, created)")
        written = (self.project_dir / rel).read_text()
        self.assertIn("jira_key: PROJ-7", written)  # distribution pointer stored
        # re-push reads the pointer → update, not a duplicate create
        t2 = FakeTransport([(204, {})])
        label2 = connector.push_artifact(self.project_dir, rel, written, "jira", transport=t2)
        self.assertEqual(label2, "jira (PROJ-7, updated)")
        self.assertEqual(t2.calls[0]["method"], "PUT")

    def test_resolve_per_artifact_type(self):
        (self.project_dir / "compass").mkdir(parents=True)
        (self.project_dir / "compass" / "config.yaml").write_text(
            "connectors:\n  ticketing: jira\n  docs: confluence\n")
        self.assertEqual(connector.resolve_connector_for_artifact(
            "docs/bets/CB-1/stories/CB-1-1/story.md", self.project_dir), "jira")
        self.assertEqual(connector.resolve_connector_for_artifact(
            "docs/bets/CB-1/brief.md", self.project_dir), "confluence")

    def test_pointer_frontmatter_roundtrip(self):
        c = connector._set_frontmatter_field("---\nid: X\n---\nbody", "jira_key", "PROJ-9")
        self.assertIn("jira_key: PROJ-9", c)
        self.assertEqual(connector._frontmatter_field(c, "jira_key"), "PROJ-9")


class TestPushErrorSurfacing(unittest.TestCase):
    """#181: a failed push must say WHY (status + API message), not a blind 'failed'."""

    def test_confluence_401_surfaces_in_label(self):
        with tempfile.TemporaryDirectory() as d:
            project = Path(d)
            os.environ.update({"CONFLUENCE_BASE_URL": "https://acme.atlassian.net",
                               "CONFLUENCE_EMAIL": "x@x.com", "CONFLUENCE_API_TOKEN": "bad",
                               "CONFLUENCE_SPACE": "ENG"})
            try:
                t = FakeTransport([(401, {"message": "Unauthorized; bad token"})])
                label = connector.push_artifact(project, "docs/foundation/product.md",
                                                "# P\nbody", "confluence", transport=t)
            finally:
                for k in ("CONFLUENCE_BASE_URL", "CONFLUENCE_EMAIL",
                          "CONFLUENCE_API_TOKEN", "CONFLUENCE_SPACE"):
                    os.environ.pop(k, None)
            self.assertIn("confluence push failed", label)
            self.assertIn("401", label)
            self.assertIn("Unauthorized", label)

    def test_jira_error_messages_surface(self):
        with tempfile.TemporaryDirectory() as d:
            project = Path(d)
            os.environ.update({"JIRA_BASE_URL": "https://acme.atlassian.net",
                               "JIRA_EMAIL": "x@x.com", "JIRA_API_TOKEN": "t",
                               "JIRA_PROJECT": "WLT"})
            try:
                t = FakeTransport([(400, {"errorMessages": ["project WLT does not exist"]})])
                label = connector.push_artifact(project, "docs/bets/B/stories/B-1/story.md",
                                                "# S\nbody", "jira", transport=t)
            finally:
                for k in ("JIRA_BASE_URL", "JIRA_EMAIL", "JIRA_API_TOKEN", "JIRA_PROJECT"):
                    os.environ.pop(k, None)
            self.assertIn("jira push failed", label)
            self.assertIn("400", label)
            self.assertIn("does not exist", label)


class TestOnDemandPush(unittest.TestCase):
    """#34: --push / --push-bet project EXISTING artifacts to their configured backend
    (story → Jira, brief/architecture → Confluence per config.yaml), or honest
    filesystem-fallback when uncredentialed."""

    def setUp(self):
        self.project = Path(tempfile.mkdtemp())
        self.compass = Path(__file__).resolve().parents[2]  # real config.yaml: jira/confluence
        # ensure no live creds bleed in from the env
        self._saved = {}
        for v in ("JIRA_BASE_URL", "JIRA_EMAIL", "JIRA_API_TOKEN", "JIRA_PROJECT",
                  "CONFLUENCE_BASE_URL", "CONFLUENCE_EMAIL", "CONFLUENCE_API_TOKEN",
                  "CONFLUENCE_SPACE", "ATLASSIAN_BASE_URL", "ATLASSIAN_EMAIL",
                  "ATLASSIAN_API_TOKEN"):
            self._saved[v] = os.environ.pop(v, None)
        b = self.project / "docs" / "bets" / "CB-1"
        (b / "stories" / "CB-1-1").mkdir(parents=True)
        (b / "brief.md").write_text("---\nid: CB-1\n---\n# Brief\nbody\n", encoding="utf-8")
        (b / "architecture.md").write_text("---\nstatus: approved\n---\n# Arch\n", encoding="utf-8")
        (b / "stories" / "CB-1-1" / "story.md").write_text("---\nid: CB-1-1\n---\n# Story\n", encoding="utf-8")

    def tearDown(self):
        import shutil
        shutil.rmtree(self.project, ignore_errors=True)
        for k, v in self._saved.items():
            if v is not None:
                os.environ[k] = v

    def test_bet_doc_paths_order(self):
        from compass.orchestrator.run import _bet_doc_paths
        paths = _bet_doc_paths(self.project, "CB-1")
        self.assertEqual(paths[0], "docs/bets/CB-1/brief.md")
        self.assertIn("docs/bets/CB-1/architecture.md", paths)
        self.assertTrue(paths[-1].endswith("CB-1-1/story.md"))

    def test_story_routes_to_jira(self):
        from compass.orchestrator.run import _project_artifact
        _, label = _project_artifact(self.project, self.compass,
                                     "docs/bets/CB-1/stories/CB-1-1/story.md")
        self.assertIn("jira", label)          # routed to the ticketing backend
        self.assertIn("fallback", label)      # uncredentialed → honest fallback

    def test_brief_routes_to_confluence(self):
        from compass.orchestrator.run import _project_artifact
        _, label = _project_artifact(self.project, self.compass, "docs/bets/CB-1/brief.md")
        self.assertIn("confluence", label)
        self.assertIn("fallback", label)

    def test_missing_file_errors(self):
        from compass.orchestrator.run import _project_artifact
        _, label = _project_artifact(self.project, self.compass, "docs/bets/CB-1/nope.md")
        self.assertIn("ERROR", label)


if __name__ == "__main__":
    unittest.main(verbosity=2)

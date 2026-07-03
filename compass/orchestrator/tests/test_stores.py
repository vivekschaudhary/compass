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
        # #71: a fix record routes to ticketing (Jira), not docs
        self.assertEqual(connector.resolve_connector_for_artifact(
            "docs/fixes/FIX-1.md", self.project_dir), "jira")
        self.assertEqual(connector.resolve_connector_for_artifact(
            "docs/bets/CB-1/fixes/FIX-2.md", self.project_dir), "jira")

    def test_pointer_frontmatter_roundtrip(self):
        c = connector._set_frontmatter_field("---\nid: X\n---\nbody", "jira_key", "PROJ-9")
        self.assertIn("jira_key: PROJ-9", c)
        self.assertEqual(connector._frontmatter_field(c, "jira_key"), "PROJ-9")


class TestIssueTypeResolution(unittest.TestCase):
    """#73: connector emits Bug/Task (not just Epic/Story); type from frontmatter/path
    or an explicit override."""
    def test_resolve_from_frontmatter_type(self):
        r = connector.resolve_issue_type
        self.assertEqual(r("docs/x.md", "---\ntype: defect\n---\n"), "Bug")
        self.assertEqual(r("docs/x.md", "---\ntype: bug\n---\n"), "Bug")
        self.assertEqual(r("docs/x.md", "---\ntype: ops\n---\n"), "Task")
        self.assertEqual(r("docs/x.md", "---\ntype: architecture\n---\n"), "Task")
        self.assertEqual(r("docs/x.md", "---\ntype: enhancement\n---\n"), "Story")
        self.assertEqual(r("docs/x.md", "---\ntype: design\n---\n"), "Story")

    def test_resolve_from_path_fallback(self):
        r = connector.resolve_issue_type
        self.assertEqual(r("docs/bets/CB-1/stories/CB-1-1/story.md", ""), "Story")
        self.assertEqual(r("docs/ops/OPS-1.md", ""), "Task")
        self.assertEqual(r("docs/bets/CB-1/architecture.md", ""), "Task")
        self.assertEqual(r("docs/bets/CB-1/brief.md", ""), "Epic")   # back-compat default

    def test_back_compat_story_unchanged(self):
        # frontmatter type wins, but a plain story path still → Story (no regression)
        self.assertEqual(connector.resolve_issue_type(
            "docs/bets/CB-1/stories/CB-1-1/story.md", "# S\nbody"), "Story")

    def test_fix_record_types(self):
        # #71: defect → Bug, enhancement → Story; a fix path with no type defaults to Bug
        r = connector.resolve_issue_type
        self.assertEqual(r("docs/fixes/FIX-1.md", "---\ntype: bug\n---\n"), "Bug")
        self.assertEqual(r("docs/fixes/FIX-1.md", "---\ntype: enhancement\n---\n"), "Story")
        self.assertEqual(r("docs/bets/CB-1/fixes/FIX-2.md", ""), "Bug")   # path default


class TestPushArtifactIssueType(unittest.TestCase):
    """#73: push_artifact honors an explicit issue_type and otherwise resolves it."""
    KEYS = ("JIRA_BASE_URL", "JIRA_EMAIL", "JIRA_API_TOKEN", "JIRA_PROJECT")

    def setUp(self):
        self.project_dir = Path(tempfile.mkdtemp())
        self._saved = {k: os.environ.get(k) for k in self.KEYS}
        os.environ.update(JIRA_BASE_URL="https://a.net", JIRA_EMAIL="e",
                          JIRA_API_TOKEN="t", JIRA_PROJECT="PROJ")

    def tearDown(self):
        for k, v in self._saved.items():
            os.environ.pop(k, None) if v is None else os.environ.__setitem__(k, v)

    def test_explicit_issue_type_bug(self):
        t = FakeTransport([(201, {"key": "PROJ-1"})])
        connector.push_artifact(self.project_dir, "docs/fixes/F-1.md", "# Fix\nbody",
                                "jira", transport=t, issue_type="Bug")
        self.assertEqual(t.calls[0]["body"]["fields"]["issuetype"], {"name": "Bug"})

    def test_resolved_task_from_frontmatter(self):
        t = FakeTransport([(201, {"key": "PROJ-2"})])
        connector.push_artifact(self.project_dir, "docs/ops/OPS-1.md",
                                "---\ntype: ops\n---\n# Cert rotation\nbody", "jira", transport=t)
        self.assertEqual(t.calls[0]["body"]["fields"]["issuetype"], {"name": "Task"})

    def test_default_still_story_for_story_path(self):
        t = FakeTransport([(201, {"key": "PROJ-3"})])
        connector.push_artifact(self.project_dir, "docs/bets/CB-1/stories/CB-1-1/story.md",
                                "# S\nbody", "jira", transport=t)
        self.assertEqual(t.calls[0]["body"]["fields"]["issuetype"], {"name": "Story"})


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


class TestConfluenceFormatting(unittest.TestCase):
    """#41: markdown → storage XHTML (headings/lists/code/inline), not one <pre> block."""

    def test_headings_and_paragraph(self):
        html_out = stores._storage("---\nid: x\n---\n# Title\n\nSome **bold** text.\n")
        self.assertIn("<h1>Title</h1>", html_out)
        self.assertIn("<strong>bold</strong>", html_out)
        self.assertNotIn("# Title", html_out)          # raw markdown gone
        self.assertNotIn("id: x", html_out)            # frontmatter stripped

    def test_bullets_and_numbered(self):
        html_out = stores._storage("- a\n- b\n\n1. one\n2. two\n")
        self.assertIn("<ul><li>a</li><li>b</li></ul>", html_out)
        self.assertIn("<ol><li>one</li><li>two</li></ol>", html_out)

    def test_code_fence_uses_code_macro(self):
        html_out = stores._storage("text\n\n```\nx = 1\n```\n")
        self.assertIn('ac:name="code"', html_out)
        self.assertIn("<![CDATA[x = 1]]>", html_out)

    def test_inline_code_and_link_escaped(self):
        html_out = stores._storage("Use `KAN-1` and see [docs](https://x.co/a).")
        self.assertIn("<code>KAN-1</code>", html_out)
        self.assertIn('<a href="https://x.co/a">docs</a>', html_out)

    def test_table(self):
        html_out = stores._storage("| A | B |\n| --- | --- |\n| 1 | 2 |\n")
        self.assertIn("<th>A</th>", html_out)
        self.assertIn("<td>1</td>", html_out)

    def test_confluence_push_sends_formatted_body(self):
        # the storage body handed to Confluence is real XHTML, not a <pre> dump
        t = FakeTransport([(201, {"id": "999", "_links": {"webui": "/p/999"}})])
        stores.confluence_push(AUTH, "ENG", "T", "# H\n\nbody\n", transport=t)
        body = t.calls[0]["body"]["body"]["storage"]["value"]
        self.assertIn("<h1>H</h1>", body)
        self.assertNotIn("<pre>", body)


class TestJiraStructureStores(unittest.TestCase):
    """#35: the Jira structural primitives — epic parenting + blocked-by links."""

    def test_set_parent_puts_parent_field(self):
        t = FakeTransport([(204, {})])
        res = stores.jira_set_parent(AUTH, "KAN-2", "KAN-10", transport=t)
        self.assertTrue(res["ok"])
        self.assertEqual(t.calls[0]["method"], "PUT")
        self.assertIn("/issue/KAN-2", t.calls[0]["url"])
        self.assertEqual(t.calls[0]["body"]["fields"]["parent"], {"key": "KAN-10"})

    def test_link_blocked_by_direction(self):
        # inward is_blocked_by outward: KAN-4 (inward) is blocked by KAN-3 (outward)
        t = FakeTransport([(201, {})])
        res = stores.jira_link(AUTH, inward_key="KAN-4", outward_key="KAN-3", transport=t)
        self.assertTrue(res["ok"])
        body = t.calls[0]["body"]
        self.assertEqual(body["type"]["name"], "Blocks")
        self.assertEqual(body["inwardIssue"]["key"], "KAN-4")
        self.assertEqual(body["outwardIssue"]["key"], "KAN-3")

    def test_links_of_parses_existing(self):
        t = FakeTransport([(200, {"fields": {"issuelinks": [
            {"type": {"name": "Blocks"}, "outwardIssue": {"key": "KAN-3"}}]}})])
        self.assertEqual(stores.jira_links_of(AUTH, "KAN-4", transport=t),
                         {("Blocks", "KAN-3")})


class TestProjectBetStructure(unittest.TestCase):
    """#35: project_bet_jira_structure wires epic + parents + blocked-by from the stored
    jira_keys, idempotently."""

    class _Routing:
        def __init__(self):
            self.calls = []
        def __call__(self, method, url, headers, body):
            self.calls.append((method, url, body))
            if method == "POST" and url.endswith("/issue"):
                return (201, {"key": "KAN-EPIC"})
            if method == "PUT" and "/issue/" in url:
                return (204, {})
            if method == "GET" and "issuelinks" in url:
                return (200, {"fields": {"issuelinks": []}})
            if method == "POST" and url.endswith("/issueLink"):
                return (201, {})
            return (200, {})

    def setUp(self):
        self.project = Path(tempfile.mkdtemp())
        self._saved = {}
        for v in ("JIRA_BASE_URL", "JIRA_EMAIL", "JIRA_API_TOKEN", "JIRA_PROJECT"):
            self._saved[v] = os.environ.get(v)
        os.environ.update({"JIRA_BASE_URL": "https://acme.atlassian.net",
                           "JIRA_EMAIL": "x@x.com", "JIRA_API_TOKEN": "t",
                           "JIRA_PROJECT": "KAN"})
        b = self.project / "docs" / "bets" / "WLT-27"
        (b / "stories" / "WLT-27-3").mkdir(parents=True)
        (b / "stories" / "WLT-27-4").mkdir(parents=True)
        (b / "brief.md").write_text("---\nid: WLT-27\n---\n# The Bet\n", encoding="utf-8")
        (b / "stories" / "WLT-27-3" / "story.md").write_text(
            "---\nid: WLT-27-3\njira_key: KAN-3\ndependencies: []\n---\n# API\n", encoding="utf-8")
        (b / "stories" / "WLT-27-4" / "story.md").write_text(
            "---\nid: WLT-27-4\njira_key: KAN-4\ndependencies: [WLT-27-3]\n---\n# Wizard\n",
            encoding="utf-8")

    def tearDown(self):
        import shutil
        shutil.rmtree(self.project, ignore_errors=True)
        for k, v in self._saved.items():
            os.environ.pop(k, None) if v is None else os.environ.__setitem__(k, v)

    def test_wires_epic_parents_and_blocked_by(self):
        t = self._Routing()
        actions = connector.project_bet_jira_structure(self.project, "WLT-27", transport=t)
        # epic created + pointer written back to brief.md
        self.assertIn("epic KAN-EPIC created", actions)
        brief = (self.project / "docs" / "bets" / "WLT-27" / "brief.md").read_text()
        self.assertIn("jira_epic_key: KAN-EPIC", brief)
        # both stories parented, and KAN-4 blocked by KAN-3
        self.assertTrue(any("KAN-3 → under KAN-EPIC" in a for a in actions))
        self.assertTrue(any("KAN-4 ⟵ blocked by KAN-3" in a for a in actions))
        # the issueLink call used the right direction
        link = [c for c in t.calls if c[1].endswith("/issueLink")]
        self.assertEqual(len(link), 1)
        self.assertEqual(link[0][2]["inwardIssue"]["key"], "KAN-4")
        self.assertEqual(link[0][2]["outwardIssue"]["key"], "KAN-3")

    def test_idempotent_epic_reuse_and_skip_existing_link(self):
        # brief already has the epic; the link already exists → no epic create, no re-link
        b = self.project / "docs" / "bets" / "WLT-27"
        (b / "brief.md").write_text("---\nid: WLT-27\njira_epic_key: KAN-EPIC\n---\n# The Bet\n",
                                    encoding="utf-8")
        class _Existing(self._Routing):
            def __call__(self, method, url, headers, body):
                if method == "GET" and "issuelinks" in url:
                    self.calls.append((method, url, body))
                    return (200, {"fields": {"issuelinks": [
                        {"type": {"name": "Blocks"}, "outwardIssue": {"key": "KAN-3"}}]}})
                return super().__call__(method, url, headers, body)
        t = _Existing()
        actions = connector.project_bet_jira_structure(self.project, "WLT-27", transport=t)
        self.assertIn("epic KAN-EPIC (reused)", actions)
        self.assertFalse(any(c[1].endswith("/issue") and c[0] == "POST" for c in t.calls))  # no epic create
        self.assertFalse(any(c[1].endswith("/issueLink") for c in t.calls))  # link skipped


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

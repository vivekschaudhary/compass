"""Docs-adapter tests — the `@docs` slot resolved to a provider (#154 slice 1).

Two behaviours are load-bearing and proven here without a live Atlassian:

  1. **Refuse, never fall back.** `connector.py` writes a filesystem cache when a push
     fails; this module must NOT. When the docs system IS the system of record there is
     no repo copy to fall back to, so every failure path raises `DocsUnreachable`.
  2. **Idempotent parent.** `ensure_parent` finds an existing engagement page by title
     rather than creating a second one on every run.
"""
import os
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[4]))

from compass.orchestrator import docs_adapter, stores


class FakeTransport:
    """Records each call; returns canned (status, dict) responses in order."""
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []

    def __call__(self, method, url, headers, body):
        self.calls.append({"method": method, "url": url, "body": body})
        return self.responses.pop(0) if self.responses else (200, {})


AUTH = {"base_url": "https://acme.atlassian.net", "email": "x@x.com", "token": "t"}

CONF_KEYS =("CONFLUENCE_BASE_URL", "CONFLUENCE_EMAIL", "CONFLUENCE_API_TOKEN",
             "CONFLUENCE_SPACE", "ATLASSIAN_BASE_URL", "ATLASSIAN_EMAIL",
             "ATLASSIAN_API_TOKEN")


class DocsAdapterCase(unittest.TestCase):
    """Base: isolate confluence env so credential state is explicit per test."""

    def setUp(self):
        self._saved = {k: os.environ.get(k) for k in CONF_KEYS}
        for k in CONF_KEYS:
            os.environ.pop(k, None)

    def tearDown(self):
        for k, v in self._saved.items():
            os.environ.pop(k, None) if v is None else os.environ.__setitem__(k, v)

    def credentialed(self):
        os.environ.update(CONFLUENCE_BASE_URL="https://acme.atlassian.net",
                          CONFLUENCE_EMAIL="x@x.com", CONFLUENCE_API_TOKEN="t",
                          CONFLUENCE_SPACE="ENG")


class TestBackendResolution(DocsAdapterCase):
    def test_declared_but_unimplemented_backends_raise(self):
        self.credentialed()
        for backend in ("gdrive", "teams-sharepoint"):
            with self.assertRaises(docs_adapter.DocsBackendNotImplemented) as cm:
                docs_adapter.push_page(backend, "T", "body")
            self.assertIn(backend, str(cm.exception))
            self.assertIn("confluence", str(cm.exception))  # names what IS implemented

    def test_unknown_backend_raises(self):
        self.credentialed()
        with self.assertRaises(docs_adapter.DocsBackendNotImplemented):
            docs_adapter.push_page("sharepoint-classic", "T", "body")

    def test_declared_set_is_disjoint_from_implemented(self):
        self.assertFalse(
            docs_adapter.IMPLEMENTED_DOCS_BACKENDS & docs_adapter.DECLARED_DOCS_BACKENDS)


class TestRefuseNeverFallBack(DocsAdapterCase):
    """The docs-primary contract: no silent filesystem fallback, ever."""

    def test_uncredentialed_raises_naming_missing_vars(self):
        with self.assertRaises(docs_adapter.DocsUnreachable) as cm:
            docs_adapter.push_page("confluence", "Title", "body")
        msg = str(cm.exception)
        self.assertIn("CONFLUENCE_BASE_URL", msg)
        self.assertIn("CONFLUENCE_SPACE", msg)
        self.assertIn("Refusing", msg)

    def test_missing_space_alone_raises(self):
        os.environ.update(CONFLUENCE_BASE_URL="https://acme.atlassian.net",
                          CONFLUENCE_EMAIL="x@x.com", CONFLUENCE_API_TOKEN="t")
        with self.assertRaises(docs_adapter.DocsUnreachable) as cm:
            docs_adapter.push_page("confluence", "Title", "body")
        self.assertIn("CONFLUENCE_SPACE", str(cm.exception))

    def test_api_failure_raises_rather_than_returning(self):
        self.credentialed()
        t = FakeTransport([(403, {"message": "no space permission"})])
        with self.assertRaises(docs_adapter.DocsUnreachable) as cm:
            docs_adapter.push_page("confluence", "Title", "body", transport=t)
        self.assertIn("403", str(cm.exception))

    def test_read_failure_raises(self):
        self.credentialed()
        t = FakeTransport([(404, {"message": "gone"})])
        with self.assertRaises(docs_adapter.DocsUnreachable):
            docs_adapter.read_page("confluence", "999", transport=t)

    def test_comments_failure_raises(self):
        self.credentialed()
        t = FakeTransport([(401, {"message": "unauthorized"})])
        with self.assertRaises(docs_adapter.DocsUnreachable):
            docs_adapter.page_comments("confluence", "123", transport=t)

    def test_unreachable_is_a_docs_error(self):
        self.assertTrue(issubclass(docs_adapter.DocsUnreachable, docs_adapter.DocsError))
        self.assertTrue(
            issubclass(docs_adapter.DocsBackendNotImplemented, docs_adapter.DocsError))


class TestEnsureParent(DocsAdapterCase):
    def test_existing_parent_is_reused_not_duplicated(self):
        self.credentialed()
        t = FakeTransport([(200, {"results": [{"id": "9000"}]})])
        res = docs_adapter.ensure_parent("confluence", "Acme Engagement", transport=t)
        self.assertEqual((res["pointer"], res["action"]), ("9000", "found"))
        self.assertEqual(len(t.calls), 1)              # searched only — no create
        self.assertEqual(t.calls[0]["method"], "GET")

    def test_missing_parent_is_created(self):
        self.credentialed()
        t = FakeTransport([(200, {"results": []}),
                           (200, {"id": "9001", "_links": {}})])
        res = docs_adapter.ensure_parent("confluence", "Acme Engagement", transport=t)
        self.assertEqual((res["pointer"], res["action"]), ("9001", "created"))
        self.assertEqual([c["method"] for c in t.calls], ["GET", "POST"])

    def test_search_failure_raises(self):
        self.credentialed()
        t = FakeTransport([(500, {"message": "boom"})])
        with self.assertRaises(docs_adapter.DocsUnreachable) as cm:
            docs_adapter.ensure_parent("confluence", "Acme", transport=t)
        self.assertIn("500", str(cm.exception))

    def test_create_failure_raises(self):
        self.credentialed()
        t = FakeTransport([(200, {"results": []}), (403, {"message": "denied"})])
        with self.assertRaises(docs_adapter.DocsUnreachable) as cm:
            docs_adapter.ensure_parent("confluence", "Acme", transport=t)
        self.assertIn("403", str(cm.exception))

    def test_title_with_spaces_is_url_encoded(self):
        self.credentialed()
        t = FakeTransport([(200, {"results": [{"id": "1"}]})])
        docs_adapter.ensure_parent("confluence", "Acme & Co Engagement", transport=t)
        url = t.calls[0]["url"]
        self.assertNotIn(" ", url)
        self.assertIn("Acme%20%26%20Co%20Engagement", url)


class TestPushPage(DocsAdapterCase):
    def test_new_page_is_filed_under_parent(self):
        self.credentialed()
        t = FakeTransport([(200, {"id": "123", "_links": {}})])
        res = docs_adapter.push_page("confluence", "Product Brief", "body",
                                     parent_id="9000", transport=t)
        self.assertEqual((res["pointer"], res["action"]), ("123", "created"))
        self.assertEqual(t.calls[0]["body"]["ancestors"], [{"id": "9000"}])

    def test_no_parent_means_no_ancestors_key(self):
        self.credentialed()
        t = FakeTransport([(200, {"id": "123", "_links": {}})])
        docs_adapter.push_page("confluence", "Product Brief", "body", transport=t)
        self.assertNotIn("ancestors", t.calls[0]["body"])

    def test_existing_page_id_updates_not_creates(self):
        self.credentialed()
        t = FakeTransport([(200, {"version": {"number": 2}}),
                           (200, {"id": "123", "_links": {}})])
        res = docs_adapter.push_page("confluence", "Product Brief", "body",
                                     page_id="123", parent_id="9000", transport=t)
        self.assertEqual(res["action"], "updated")
        self.assertEqual([c["method"] for c in t.calls], ["GET", "PUT"])
        self.assertEqual(t.calls[1]["body"]["version"], {"number": 3})
        # a content push does not re-parent an existing page
        self.assertNotIn("ancestors", t.calls[1]["body"])


class TestReadAndComments(DocsAdapterCase):
    def test_read_returns_title_and_body(self):
        self.credentialed()
        t = FakeTransport([(200, {"title": "Product Brief",
                                  "body": {"storage": {"value": "<p>hi</p>"}},
                                  "_links": {}})])
        res = docs_adapter.read_page("confluence", "123", transport=t)
        self.assertEqual((res["title"], res["body"]), ("Product Brief", "<p>hi</p>"))

    def test_comments_are_flattened(self):
        self.credentialed()
        t = FakeTransport([(200, {"results": [
            {"id": "c1", "body": {"storage": {"value": "tighten the scope"}}},
            {"id": "c2", "body": {"storage": {"value": "posture is wrong"}}},
        ]})])
        out = docs_adapter.page_comments("confluence", "123", transport=t)
        self.assertEqual([c["id"] for c in out], ["c1", "c2"])
        self.assertEqual(out[0]["body"], "tighten the scope")

    def test_no_comments_is_empty_list_not_error(self):
        self.credentialed()
        t = FakeTransport([(200, {"results": []})])
        self.assertEqual(docs_adapter.page_comments("confluence", "123", transport=t), [])


class TestStoresLayer(unittest.TestCase):
    """The stores-level additions, independent of the adapter's refusal policy."""

    def test_find_page_reports_not_found_without_erroring(self):
        t = FakeTransport([(200, {"results": []})])
        res = stores.confluence_find_page(AUTH, "ENG", "Nope", transport=t)
        self.assertEqual((res["ok"], res["found"], res["pointer"]), (True, False, None))

    def test_find_page_returns_first_match(self):
        t = FakeTransport([(200, {"results": [{"id": "77"}, {"id": "88"}]})])
        res = stores.confluence_find_page(AUTH, "ENG", "Dup", transport=t)
        self.assertEqual((res["found"], res["pointer"]), (True, "77"))

    def test_find_page_http_error_is_not_found_and_not_ok(self):
        t = FakeTransport([(500, {"message": "boom"})])
        res = stores.confluence_find_page(AUTH, "ENG", "X", transport=t)
        self.assertEqual((res["ok"], res["found"]), (False, False))

    def test_push_parent_id_is_stringified(self):
        t = FakeTransport([(200, {"id": "1", "_links": {}})])
        stores.confluence_push(AUTH, "ENG", "T", "b", parent_id=9000, transport=t)
        self.assertEqual(t.calls[0]["body"]["ancestors"], [{"id": "9000"}])

    def test_existing_confluence_push_signature_still_positional(self):
        # parent_id was inserted BEFORE transport — guard the existing keyword callers
        # in connector.py that pass page_id=/transport= by name.
        t = FakeTransport([(200, {"id": "1", "_links": {}})])
        res = stores.confluence_push(AUTH, "ENG", "T", "b", transport=t)
        self.assertTrue(res["ok"])


if __name__ == "__main__":
    unittest.main()

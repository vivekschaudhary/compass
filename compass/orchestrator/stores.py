"""
Store-projection backends — Compass-primary artifacts projected one-way to the
team's systems of record (Jira issues, Confluence pages).

Compass is the canonical store (the repo holds the source of truth); these backends
PROJECT an approved artifact outward so the team sees it in their own tools. Per the
Compass-primary, external-projection model: push is one-way; Compass stores the
**distribution pointer** (Jira key / Confluence page id) on the artifact so a re-push
is an idempotent update-not-create.

Auth is server-to-server (API token) read from the environment, so headless/dashboard
runs work and nothing is committed. Missing creds → the caller falls back to the
filesystem cache with an honest label (never a silent failure).

The HTTP transport is injectable (`transport=`) so the object mapping + idempotency are
unit-tested without a live Atlassian instance. The default transport uses urllib
(stdlib — no added dependency).
"""
import base64
import html
import json
import os
import urllib.error
import urllib.request


def _auth(prefix: str):
    """Resolve Atlassian auth for JIRA / CONFLUENCE from env, falling back to the
    shared ATLASSIAN_* vars. Returns {base_url, email, token} or None if unset."""
    def pick(name):
        return os.environ.get(f"{prefix}_{name}") or os.environ.get(f"ATLASSIAN_{name}")
    base_url, email, token = pick("BASE_URL"), pick("EMAIL"), pick("API_TOKEN")
    if base_url and email and token:
        return {"base_url": base_url.rstrip("/"), "email": email, "token": token}
    return None


def jira_auth():
    return _auth("JIRA")


def confluence_auth():
    return _auth("CONFLUENCE")


def _basic(auth: dict) -> str:
    raw = f"{auth['email']}:{auth['token']}".encode("utf-8")
    return "Basic " + base64.b64encode(raw).decode("ascii")


def _default_transport(method: str, url: str, headers: dict, body):
    """Real HTTP via urllib (stdlib). Returns (status_code, parsed_dict)."""
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            text = resp.read().decode("utf-8")
            return resp.status, (json.loads(text) if text.strip() else {})
    except urllib.error.HTTPError as e:
        text = e.read().decode("utf-8", "replace")
        try:
            return e.code, json.loads(text)
        except ValueError:
            return e.code, {"error": text[:500]}


def _adf(text: str) -> dict:
    """Minimal Atlassian Document Format (Jira v3 `description` is ADF)."""
    return {"type": "doc", "version": 1, "content": [
        {"type": "paragraph", "content": [{"type": "text", "text": text[:30000]}]}]}


def _storage(text: str) -> str:
    """Confluence storage XHTML — a preformatted block (lossless, renders anywhere)."""
    return f"<pre>{html.escape(text)}</pre>"


def jira_push(auth, project_key, issue_type, summary, body, key=None, transport=None):
    """Create (or update, when `key` is set) a Jira issue. Idempotent via `key` (the
    distribution pointer). Returns {pointer, url, action, ok, response}."""
    transport = transport or _default_transport
    headers = {"Authorization": _basic(auth), "Content-Type": "application/json",
               "Accept": "application/json"}
    fields = {"summary": (summary or "")[:250], "description": _adf(body)}
    if key:
        status, resp = transport(
            "PUT", f"{auth['base_url']}/rest/api/3/issue/{key}", headers, {"fields": fields})
        return {"pointer": key, "url": f"{auth['base_url']}/browse/{key}",
                "action": "updated", "ok": status in (200, 204), "response": resp}
    fields["project"] = {"key": project_key}
    fields["issuetype"] = {"name": issue_type}
    status, resp = transport(
        "POST", f"{auth['base_url']}/rest/api/3/issue", headers, {"fields": fields})
    new_key = resp.get("key")
    return {"pointer": new_key,
            "url": f"{auth['base_url']}/browse/{new_key}" if new_key else None,
            "action": "created", "ok": status in (200, 201) and bool(new_key), "response": resp}


def confluence_push(auth, space, title, body, page_id=None, transport=None):
    """Create (or update, when `page_id` is set) a Confluence page. Idempotent via
    `page_id`. Returns {pointer, url, action, ok, response}."""
    transport = transport or _default_transport
    headers = {"Authorization": _basic(auth), "Content-Type": "application/json",
               "Accept": "application/json"}
    storage = {"storage": {"value": _storage(body), "representation": "storage"}}
    if page_id:
        vstatus, vresp = transport(
            "GET", f"{auth['base_url']}/wiki/rest/api/content/{page_id}?expand=version",
            headers, None)
        if vstatus != 200:  # [Codex review] don't mask a 401/404/429 as a version-2 PUT
            return {"pointer": page_id, "url": None, "action": "updated",
                    "ok": False, "response": vresp}
        ver = (vresp.get("version") or {}).get("number", 1) + 1
        status, resp = transport(
            "PUT", f"{auth['base_url']}/wiki/rest/api/content/{page_id}", headers,
            {"id": page_id, "type": "page", "title": title,
             "version": {"number": ver}, "body": storage})
        return {"pointer": page_id, "url": _conf_url(auth, resp, page_id),
                "action": "updated", "ok": status == 200, "response": resp}
    status, resp = transport(
        "POST", f"{auth['base_url']}/wiki/rest/api/content", headers,
        {"type": "page", "title": title, "space": {"key": space}, "body": storage})
    new_id = resp.get("id")
    return {"pointer": new_id, "url": _conf_url(auth, resp, new_id),
            "action": "created", "ok": status in (200, 201) and bool(new_id), "response": resp}


def _conf_url(auth, resp, page_id):
    if not page_id:
        return None
    links = resp.get("_links") or {}
    base = links.get("base") or f"{auth['base_url']}/wiki"
    return base + (links.get("webui") or f"/pages/{page_id}")

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
import re
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


def _md_inline(s: str) -> str:
    """#41: markdown inline → storage XHTML: `code`, **bold**, *italic*, [text](url).
    Escapes HTML first, then applies the markup (the md metacharacters survive escaping)."""
    s = html.escape(s)
    s = re.sub(r"`([^`]+)`", r"<code>\1</code>", s)
    s = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", s)
    s = re.sub(r"(?<!\*)\*([^*\s][^*]*?)\*(?!\*)", r"<em>\1</em>", s)
    s = re.sub(r"\[([^\]]+)\]\((https?://[^)\s]+)\)", r'<a href="\2">\1</a>', s)
    return s


def _storage(text: str) -> str:
    """#41: convert markdown to Confluence **storage XHTML** — headings, bullet/numbered
    lists, code blocks (the code macro), tables, and inline bold/italic/code/links — so
    pages read like real docs instead of one preformatted `<pre>` block. A lightweight
    stdlib converter (no deps); a leading `--- … ---` frontmatter block is stripped."""
    text = re.sub(r"^---\n.*?\n---\n", "", text, count=1, flags=re.DOTALL)
    lines = text.split("\n")
    out, para = [], []
    n, i = len(lines), 0

    def flush():
        if para:
            out.append("<p>" + _md_inline(" ".join(para).strip()) + "</p>")
            para.clear()

    while i < n:
        line = lines[i]
        if re.match(r"^\s*```", line):                                  # code fence
            flush()
            code, i = [], i + 1
            while i < n and not re.match(r"^\s*```\s*$", lines[i]):
                code.append(lines[i]); i += 1
            i += 1
            body = "\n".join(code).replace("]]>", "]]]]><![CDATA[>")
            out.append('<ac:structured-macro ac:name="code"><ac:plain-text-body>'
                       f"<![CDATA[{body}]]></ac:plain-text-body></ac:structured-macro>")
            continue
        h = re.match(r"^(#{1,6})\s+(.*)$", line)                        # heading
        if h:
            flush()
            lvl = len(h.group(1))
            out.append(f"<h{lvl}>{_md_inline(h.group(2).strip())}</h{lvl}>"); i += 1; continue
        if re.match(r"^\s*([-*_])\1{2,}\s*$", line):                    # horizontal rule
            flush(); out.append("<hr/>"); i += 1; continue
        if (line.lstrip().startswith("|") and i + 1 < n               # table
                and re.match(r"^\s*\|[\s:|-]+\|\s*$", lines[i + 1])):
            flush()
            header = [c.strip() for c in line.strip().strip("|").split("|")]
            i += 2; rows = []
            while i < n and lines[i].lstrip().startswith("|"):
                rows.append([c.strip() for c in lines[i].strip().strip("|").split("|")]); i += 1
            th = "".join(f"<th>{_md_inline(c)}</th>" for c in header)
            trs = "".join("<tr>" + "".join(f"<td>{_md_inline(c)}</td>" for c in r) + "</tr>"
                          for r in rows)
            out.append(f"<table><tbody><tr>{th}</tr>{trs}</tbody></table>"); continue
        if re.match(r"^\s*[-*+]\s+", line):                             # bullet list
            flush(); items = []
            while i < n and re.match(r"^\s*[-*+]\s+", lines[i]):
                items.append(re.sub(r"^\s*[-*+]\s+", "", lines[i])); i += 1
            out.append("<ul>" + "".join(f"<li>{_md_inline(x)}</li>" for x in items) + "</ul>")
            continue
        if re.match(r"^\s*\d+\.\s+", line):                            # numbered list
            flush(); items = []
            while i < n and re.match(r"^\s*\d+\.\s+", lines[i]):
                items.append(re.sub(r"^\s*\d+\.\s+", "", lines[i])); i += 1
            out.append("<ol>" + "".join(f"<li>{_md_inline(x)}</li>" for x in items) + "</ol>")
            continue
        if not line.strip():                                           # blank → para break
            flush(); i += 1; continue
        para.append(line.strip()); i += 1
    flush()
    return "".join(out) or "<p></p>"


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
                "action": "updated", "ok": status in (200, 204), "status": status, "response": resp}
    fields["project"] = {"key": project_key}
    fields["issuetype"] = {"name": issue_type}
    status, resp = transport(
        "POST", f"{auth['base_url']}/rest/api/3/issue", headers, {"fields": fields})
    new_key = resp.get("key")
    return {"pointer": new_key,
            "url": f"{auth['base_url']}/browse/{new_key}" if new_key else None,
            "action": "created", "ok": status in (200, 201) and bool(new_key),
            "status": status, "response": resp}


def jira_set_parent(auth, key, parent_key, transport=None):
    """#35: put issue `key` under Epic `parent_key` (team-managed hierarchy uses the
    `parent` field). Idempotent (re-setting the same parent is a no-op PUT). Returns
    {ok, status, response}."""
    transport = transport or _default_transport
    headers = {"Authorization": _basic(auth), "Content-Type": "application/json"}
    status, resp = transport("PUT", f"{auth['base_url']}/rest/api/3/issue/{key}",
                             headers, {"fields": {"parent": {"key": parent_key}}})
    return {"ok": status in (200, 204), "status": status, "response": resp}


def jira_link(auth, inward_key, outward_key, link_type="Blocks", transport=None):
    """#35: create an issue link — with type 'Blocks', `outward_key` **blocks**
    `inward_key` (i.e. inward 'is blocked by' outward). Use inward = the dependent
    story, outward = its dependency. Returns {ok, status, response}."""
    transport = transport or _default_transport
    headers = {"Authorization": _basic(auth), "Content-Type": "application/json"}
    status, resp = transport(
        "POST", f"{auth['base_url']}/rest/api/3/issueLink", headers,
        {"type": {"name": link_type},
         "inwardIssue": {"key": inward_key}, "outwardIssue": {"key": outward_key}})
    return {"ok": status in (200, 201), "status": status, "response": resp}


def jira_links_of(auth, key, transport=None):
    """#35: existing issue links of `key` as a set of (link_type_name, other_key), so
    re-linking is idempotent. Best-effort — empty set on any error."""
    transport = transport or _default_transport
    headers = {"Authorization": _basic(auth), "Accept": "application/json"}
    status, resp = transport(
        "GET", f"{auth['base_url']}/rest/api/3/issue/{key}?fields=issuelinks", headers, None)
    if status != 200:
        return set()
    out = set()
    for lk in ((resp.get("fields") or {}).get("issuelinks") or []):
        tname = (lk.get("type") or {}).get("name")
        for side in ("inwardIssue", "outwardIssue"):
            other = (lk.get(side) or {}).get("key")
            if other:
                out.add((tname, other))
    return out


def jira_add_labels(auth, key, labels, transport=None):
    """#127 (Phase 1c): add labels to a Jira issue without disturbing existing ones — the
    `update.labels: [{add: L}]` verb is idempotent (adding a label the issue already has
    is a no-op server-side). Used to mark a Definition-of-Ready-met Story `ready`. Returns
    {ok, status, response}. Best-effort — never raises."""
    transport = transport or _default_transport
    headers = {"Authorization": _basic(auth), "Content-Type": "application/json"}
    adds = [{"add": l} for l in (labels or []) if l]
    if not adds:
        return {"ok": True, "status": 204, "response": None, "action": "noop"}
    status, resp = transport("PUT", f"{auth['base_url']}/rest/api/3/issue/{key}",
                             headers, {"update": {"labels": adds}})
    return {"ok": status in (200, 204), "status": status, "response": resp}


def _adf_to_text(adf) -> str:
    """#Phase1a: flatten an Atlassian Document Format doc (Jira v3 `description`) to plain
    text — the inverse of `_adf`. Best-effort: concatenates text nodes, newline after each
    block. So Compass can READ a ticket it (or a human) wrote and hand it to the engineer."""
    if not isinstance(adf, dict):
        return str(adf or "")
    out = []
    _BLOCK = {"paragraph", "heading", "listItem", "codeBlock", "blockquote", "rule"}

    def walk(node):
        if node.get("type") == "text":
            out.append(node.get("text", ""))
        for child in (node.get("content") or []):
            walk(child)
        if node.get("type") in _BLOCK:
            out.append("\n")

    for node in (adf.get("content") or []):
        walk(node)
    return "".join(out).strip()


def jira_get_issue(auth, key, transport=None):
    """#Phase1a: READ a Jira issue so Compass can execute work that lives in Jira, not the
    repo (a bug filed in Jira → `/fix KAN-99`). Returns a normalized dict
    {ok, key, summary, description, status, category, issuetype, parent, labels, url,
    status_code}. Best-effort — `ok=False` on a non-200, never raises."""
    transport = transport or _default_transport
    headers = {"Authorization": _basic(auth), "Accept": "application/json"}
    status, resp = transport(
        "GET", f"{auth['base_url']}/rest/api/3/issue/{key}"
               "?fields=summary,description,status,issuetype,parent,labels", headers, None)
    if status != 200:
        return {"ok": False, "key": key, "status_code": status, "response": resp}
    f = resp.get("fields") or {}
    st = f.get("status") or {}
    return {
        "ok": True, "key": resp.get("key") or key,
        "summary": f.get("summary") or "",
        "description": _adf_to_text(f.get("description")),
        "status": st.get("name"),
        "category": (st.get("statusCategory") or {}).get("key"),   # new | indeterminate | done
        "issuetype": ((f.get("issuetype") or {}).get("name") or "").lower(),
        "parent": (f.get("parent") or {}).get("key"),
        "labels": f.get("labels") or [],
        "url": f"{auth['base_url']}/browse/{resp.get('key') or key}",
        "status_code": status,
    }


# #MVP1: `statusCategory.key` is STABLE across every Jira workflow (new / indeterminate /
# done); the transition + status *names* are per-project and unreliable. So we match a
# canonical lifecycle target to a category, never to a name.
_STATUS_CATEGORY = {"todo": "new", "in_progress": "indeterminate", "done": "done"}


def jira_transition(auth, key, target, transport=None):
    """#MVP1: move issue `key` toward a canonical lifecycle state — `'todo'` |
    `'in_progress'` | `'done'` — so the board reflects reality instead of sitting at "To Do"
    forever. Matches an AVAILABLE transition whose TARGET status **category** equals the
    target's category (categories are stable across workflows; names are not). No-op when the
    issue is already in the target category. Best-effort — never raises. Returns
    `{ok, action, from, to, status, response}` with `action ∈ transitioned | noop | no_path | error`."""
    transport = transport or _default_transport
    target_cat = _STATUS_CATEGORY.get(target)
    if not target_cat:
        return {"ok": False, "action": "error", "from": None, "to": target,
                "status": None, "response": {"error": f"unknown target '{target}'"}}
    headers = {"Authorization": _basic(auth), "Content-Type": "application/json",
               "Accept": "application/json"}
    # one call: current status + available transitions from here
    gstatus, gresp = transport(
        "GET", f"{auth['base_url']}/rest/api/3/issue/{key}?fields=status&expand=transitions",
        headers, None)
    if gstatus != 200:
        return {"ok": False, "action": "error", "from": None, "to": target,
                "status": gstatus, "response": gresp}
    cur = ((gresp.get("fields") or {}).get("status") or {})
    cur_cat = (cur.get("statusCategory") or {}).get("key")
    cur_name = cur.get("name")
    if cur_cat == target_cat:
        return {"ok": True, "action": "noop", "from": cur_name, "to": target,
                "status": gstatus, "response": {}}
    match = next((t for t in (gresp.get("transitions") or [])
                  if ((t.get("to") or {}).get("statusCategory") or {}).get("key") == target_cat), None)
    if not match:
        return {"ok": False, "action": "no_path", "from": cur_name, "to": target,
                "status": gstatus,
                "response": {"error": f"no transition to '{target_cat}' available from '{cur_name}'"}}
    pstatus, presp = transport(
        "POST", f"{auth['base_url']}/rest/api/3/issue/{key}/transitions", headers,
        {"transition": {"id": match["id"]}})
    return {"ok": pstatus in (200, 204), "action": "transitioned", "from": cur_name,
            "to": (match.get("to") or {}).get("name") or target, "status": pstatus, "response": presp}


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
                    "ok": False, "status": vstatus, "response": vresp}
        ver = (vresp.get("version") or {}).get("number", 1) + 1
        status, resp = transport(
            "PUT", f"{auth['base_url']}/wiki/rest/api/content/{page_id}", headers,
            {"id": page_id, "type": "page", "title": title,
             "version": {"number": ver}, "body": storage})
        return {"pointer": page_id, "url": _conf_url(auth, resp, page_id),
                "action": "updated", "ok": status == 200, "status": status, "response": resp}
    status, resp = transport(
        "POST", f"{auth['base_url']}/wiki/rest/api/content", headers,
        {"type": "page", "title": title, "space": {"key": space}, "body": storage})
    new_id = resp.get("id")
    return {"pointer": new_id, "url": _conf_url(auth, resp, new_id),
            "action": "created", "ok": status in (200, 201) and bool(new_id),
            "status": status, "response": resp}


def _conf_url(auth, resp, page_id):
    if not page_id:
        return None
    links = resp.get("_links") or {}
    base = links.get("base") or f"{auth['base_url']}/wiki"
    return base + (links.get("webui") or f"/pages/{page_id}")

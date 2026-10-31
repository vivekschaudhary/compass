"""
Framework content from the database — the ONE place the orchestrator reads it.

The Next app reads agent prompts, the doc tree and templates from `spec_file` and
`document_template`. The orchestrator used to read the same things from `compass/` on disk, which
meant two sources that drifted: an edit in the table never reached a build. Everything that was a
`Path(compass_dir) / ...` read goes through a `SpecSource` instead.

Three rules, all of them the repo's own:

  Missing is a HALT, never a default. `SpecMissing` names the path and the command that loads it.
  An empty string standing in for an absent prompt would give an agent that behaves plausibly and
  follows none of the discipline.

  A failed read is not an absent row. A dropped connection or a bad key raises `SpecUnavailable`,
  so "the database is down" is never reported as "no such agent file".

  No disk implementation. A fallback to `compass/` is how an empty table once looked healthy.

Resolution mirrors the app (`resolveSpecFromTable`, `templateFor`, `resolveActor`):

  spec      engagement override → org default (`org_id = 'default'`)
  template  engagement → org → default
  role      engagement → org
  workflow  engagement → org (published version only)
  document  this engagement's `document` row, at its current version (no org tier)
  work item this engagement's `backlog_item` row (an epic or a story)

The tier rules are pure functions over rows (`pick_spec`, `pick_template`, `pick_role`) so a shared
vector file can pin them from both languages; the DB source only fetches candidate rows.

The HTTP transport is injectable (`transport=`), as in `stores.py`, so this is tested without a
database. The default uses urllib — no added dependency.
"""
import contextlib
import json
import os
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from typing import Optional

#: What `spec_file.org_id` holds for the org-wide tier (specs.ts DEFAULT_ORG).
DEFAULT_ORG = "default"

SEED_HINT = "Load it with `node --experimental-strip-types --env-file=.env.local scripts/seed-specs.mts --apply` (in app/)."


class SpecMissing(Exception):
    """No row at any tier. Callers report this; they never substitute."""


class SpecUnavailable(Exception):
    """The read itself failed — not the same as the row being absent."""


def _check_path(path: str) -> str:
    """Refuse a path that could name anything but a framework file. Fails closed, like the app."""
    if not path or path != path.strip() or path.startswith("/") or "\0" in path or ".." in path.split("/"):
        raise SpecMissing(f"not a framework path: {path!r}")
    return path


# ── tier rules: pure, over rows ──────────────────────────────────────────────────────────────

def pick_spec(rows: list, engagement_id: Optional[str], path: str) -> Optional[dict]:
    """Engagement override, then org default. `rows` are spec_file rows already matching `path`."""
    if engagement_id:
        for r in rows:
            if r.get("engagement_id") == engagement_id and r.get("path") == path:
                return {"content": r["content"], "tier": "engagement"}
    for r in rows:
        if r.get("org_id") == DEFAULT_ORG and not r.get("engagement_id") and r.get("path") == path:
            return {"content": r["content"], "tier": "org"}
    return None


def pick_template(rows: list, engagement_id: Optional[str], org_id: Optional[str], name: str) -> Optional[dict]:
    """Engagement, then org, then the default scope (both null)."""
    def body(r, tier):
        return {"body": r["body"], "title": r.get("title"), "tier": tier} if r.get("body") else None
    if engagement_id:
        for r in rows:
            if r.get("name") == name and r.get("engagement_id") == engagement_id:
                return body(r, "engagement")
    if org_id:
        for r in rows:
            if r.get("name") == name and not r.get("engagement_id") and r.get("org_id") == org_id:
                return body(r, "org")
    for r in rows:
        if r.get("name") == name and not r.get("engagement_id") and not r.get("org_id"):
            return body(r, "default")
    return None


def pick_role(rows: list, engagement_id: Optional[str], code: str) -> Optional[dict]:
    """Engagement override, then the org row. `rows` are already scoped to the org."""
    if engagement_id:
        for r in rows:
            if r.get("code") == code and r.get("engagement_id") == engagement_id:
                return r
    for r in rows:
        if r.get("code") == code and not r.get("engagement_id"):
            return r
    return None


def pick_workflow(rows: list, engagement_id: Optional[str], code: str) -> Optional[dict]:
    """Engagement's own workflow, then the org's. `rows` are already scoped to the org and enabled."""
    if engagement_id:
        for r in rows:
            if r.get("code") == code and r.get("engagement_id") == engagement_id:
                return r
    for r in rows:
        if r.get("code") == code and not r.get("engagement_id"):
            return r
    return None


def pick_work_item(rows: list, ident: str) -> Optional[dict]:
    """A backlog row by Jira key, else by ref. A key wins: refs are per engagement, keys are the tracker's."""
    for field in ("ticket_key", "ref"):
        for r in rows:
            if r.get(field) == ident:
                return dict(r)
    return None


def _shape_document(path, version, status, sections) -> dict:
    sections = [{"heading": s.get("heading", ""), "body": s.get("body", "")} for s in sections]
    text = "\n\n".join(f"## {s['heading']}\n\n{s['body']}".rstrip() for s in sections)
    return {"path": path, "version": str(version), "status": status, "sections": sections, "text": text}


def section_for(doc: dict, ref: str) -> Optional[dict]:
    """The section of a document whose heading starts with `ref` — `ACC-E1-S1 — Create an account`.
    `ACC-E1-S1` must not match `ACC-E1-S10`, so the ref has to end where the heading's next word starts."""
    import re
    pat = re.compile(r"^\s*" + re.escape(ref) + r"(?![A-Za-z0-9-])")
    for s in doc.get("sections", []):
        if pat.match(s["heading"]):
            return s
    return None


# ── the interface ────────────────────────────────────────────────────────────────────────────

class SpecSource:
    """What every orchestrator function asks for framework content."""

    def spec(self, path: str) -> str:
        """The file's text. Raises `SpecMissing`."""
        raise NotImplementedError

    def spec_paths(self, prefix: str) -> list:
        """Paths under `prefix`, e.g. `agents/` — the DB's answer to listing a directory."""
        raise NotImplementedError

    def template(self, name: str) -> dict:
        """`{body, title, tier}` for a deliverable template. Raises `SpecMissing`."""
        raise NotImplementedError

    def role(self, code: str) -> dict:
        """The role row (`agent`, `hosts`, `capabilities`, ...). Raises `SpecMissing`."""
        raise NotImplementedError

    def document(self, path: str, version: Optional[str] = None) -> dict:
        """An engagement document: `{path, version, status, sections, text}`. `sections` is
        `[{heading, body}]` in order. `version` omitted is the CURRENT version; given, exactly that one —
        what a task pinned when it started. Raises `SpecMissing` — no document at that path, no such
        version, or no engagement to scope it (documents belong to one)."""
        raise NotImplementedError

    def pinned_inputs(self, task_id: str) -> dict:
        """What the app pinned for a task: `{document_path: version or None}`. `None` is a pin recorded
        while nothing was there. A task with no pins is `{}`."""
        raise NotImplementedError

    def work_item(self, ident: str) -> dict:
        """An epic or story from `backlog_item`, found by Jira key OR ref: `{ref, kind, parent_ref, title,
        ticket_key, body}`. Raises `SpecMissing`."""
        raise NotImplementedError

    def work_items(self, parent_ref: str) -> list:
        """The children of an epic, in `ord` order — `work_item`'s shape."""
        raise NotImplementedError

    def workflow_codes(self) -> list:
        """Codes of the enabled workflows that have a published version — what can be launched."""
        raise NotImplementedError

    def workflow_steps(self, code: str) -> list:
        """The PUBLISHED version's steps, in `ord` order. Raises `SpecMissing`.

        Each step is `{ord, kind, role_code, agent, task, title, nests, depends_on, reads}`; `agent` is the
        role's agent file stem (`role.agent`), resolved here so no caller has to know the mapping.
        This is the dispatch graph — the `workflows/*.md` copy is not read.
        """
        raise NotImplementedError


class InMemorySpecSource(SpecSource):
    """Rows held in lists, resolved by the same pure functions. For tests, and for the vectors."""

    def __init__(self, specs=None, templates=None, roles=None, engagement_id=None, org_id=None, workflows=None,
                 documents=None, backlog=None, pins=None):
        self.specs, self.templates, self.roles = specs or [], templates or [], roles or []
        # path -> {version, status, sections: [{heading, body}], history?: {version: {status, sections}}}
        self.documents = documents or {}
        self.pins = pins or {}              # task_id -> {path: version or None}
        self.backlog = backlog or []        # backlog_item rows
        self.workflows = workflows or []   # {code, engagement_id, steps: [normalised step, as workflow_steps returns]}
        self.engagement_id, self.org_id = engagement_id, org_id

    def spec(self, path):
        _check_path(path)
        hit = pick_spec([r for r in self.specs if r.get("path") == path], self.engagement_id, path)
        if hit is None:
            raise SpecMissing(f"no spec_file row for {path}. {SEED_HINT}")
        return hit["content"]

    def spec_paths(self, prefix):
        return sorted({r["path"] for r in self.specs if r.get("path", "").startswith(prefix)})

    def template(self, name):
        hit = pick_template(self.templates, self.engagement_id, self.org_id, name)
        if hit is None:
            raise SpecMissing(f"no document_template row for {name!r} at any scope")
        return hit

    def role(self, code):
        hit = pick_role(self.roles, self.engagement_id, code)
        if hit is None:
            raise SpecMissing(f"no role row for {code!r}")
        return hit

    def document(self, path, version=None):
        _check_path(path)
        if not self.engagement_id:
            raise SpecMissing(f"document {path}: documents belong to an engagement; pass --engagement")
        doc = self.documents.get(path)
        if doc is None:
            raise SpecMissing(f"no document at {path} for this engagement")
        if version is not None and str(version) != str(doc["version"]):
            old = (doc.get("history") or {}).get(str(version))
            if old is None:
                raise SpecMissing(f"document {path} has no version {version}")
            return _shape_document(path, version, old["status"], old["sections"])
        return _shape_document(path, doc["version"], doc["status"], doc["sections"])

    def pinned_inputs(self, task_id):
        return dict(self.pins.get(task_id, {}))

    def work_item(self, ident):
        hit = pick_work_item(self.backlog, ident)
        if hit is None:
            raise SpecMissing(f"no epic or story {ident!r} for this engagement")
        return hit

    def work_items(self, parent_ref):
        return sorted((dict(r) for r in self.backlog if r.get("parent_ref") == parent_ref),
                      key=lambda r: r.get("ord", 0))

    def workflow_codes(self):
        return sorted({w["code"] for w in self.workflows
                       if w.get("steps") and (not w.get("engagement_id") or w["engagement_id"] == self.engagement_id)})

    def workflow_steps(self, code):
        hit = pick_workflow(self.workflows, self.engagement_id, code)
        if hit is None or not hit.get("steps"):
            raise SpecMissing(f"no published workflow {code!r}")
        return sorted(hit["steps"], key=lambda st: st["ord"])


def _default_transport(method: str, url: str, headers: dict, body=None):
    """Real HTTP via urllib. Returns (status, parsed_json). A network error raises."""
    req = urllib.request.Request(url, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            text = resp.read().decode("utf-8")
            return resp.status, (json.loads(text) if text.strip() else [])
    except urllib.error.HTTPError as e:
        text = e.read().decode("utf-8", "replace")
        try:
            return e.code, json.loads(text)
        except ValueError:
            return e.code, {"error": text[:500]}


class DbSpecSource(SpecSource):
    """Reads `spec_file`, `document_template` and `role` over PostgREST, for one engagement."""

    def __init__(self, url: str, key: str, engagement_id: Optional[str], org_code: str = DEFAULT_ORG,
                 transport=None):
        self.base = url.rstrip("/") + "/rest/v1/"
        self.headers = {"apikey": key, "Authorization": f"Bearer {key}", "Accept": "application/json"}
        self.engagement_id, self.org_code = engagement_id, org_code
        self._transport = transport or _default_transport
        self._org_id = None

    def _get(self, table: str, **filters) -> list:
        query = "&".join(f"{k}={urllib.parse.quote(str(v), safe=',.()*')}" for k, v in filters.items())
        try:
            status, data = self._transport("GET", f"{self.base}{table}?{query}", self.headers, None)
        except (urllib.error.URLError, OSError) as e:
            raise SpecUnavailable(f"read {table}: {e}") from e
        if status != 200 or not isinstance(data, list):
            raise SpecUnavailable(f"read {table}: HTTP {status} {str(data)[:200]}")
        return data

    def _org(self) -> str:
        if self._org_id is None:
            rows = self._get("org", select="id", code=f"eq.{self.org_code}")
            if not rows:
                raise SpecMissing(f"no org with code {self.org_code!r}")
            self._org_id = rows[0]["id"]
        return self._org_id

    def _scope(self) -> str:
        """PostgREST `or` over the two tiers a spec can come from."""
        tiers = [f"org_id.eq.{DEFAULT_ORG}"]
        if self.engagement_id:
            tiers.append(f"engagement_id.eq.{self.engagement_id}")
        return "(" + ",".join(tiers) + ")"

    def spec(self, path):
        _check_path(path)
        rows = self._get("spec_file", select="path,content,org_id,engagement_id",
                         path=f"eq.{path}", **{"or": self._scope()})
        hit = pick_spec(rows, self.engagement_id, path)
        if hit is None:
            raise SpecMissing(f"no spec_file row for {path}. {SEED_HINT}")
        return hit["content"]

    def spec_paths(self, prefix):
        _check_path(prefix.rstrip("/") or "x")
        rows = self._get("spec_file", select="path", path=f"like.{prefix}*", **{"or": self._scope()})
        return sorted({r["path"] for r in rows})

    def template(self, name):
        rows = self._get("document_template", select="name,title,body,org_id,engagement_id", name=f"eq.{name}")
        hit = pick_template(rows, self.engagement_id, self._org(), name)
        if hit is None:
            raise SpecMissing(f"no document_template row for {name!r} at any scope")
        return hit

    def _engagement(self, what: str) -> str:
        if not self.engagement_id:
            raise SpecMissing(f"{what}: this belongs to an engagement; pass --engagement")
        return self.engagement_id

    def document(self, path, version=None):
        _check_path(path)
        eng = self._engagement(f"document {path}")
        docs = self._get("document", select="id,current_version_id", engagement_id=f"eq.{eng}", path=f"eq.{path}")
        if not docs:
            raise SpecMissing(f"no document at {path} for engagement {eng}")
        if version is not None:
            # The version the task pinned, not whatever is current now.
            vers = self._get("document_version", select="id,version,status",
                             document_id=f"eq.{docs[0]['id']}", version=f"eq.{version}")
            if not vers:
                raise SpecMissing(f"document {path} has no version {version}")
            version_id = vers[0]["id"]
        else:
            version_id = docs[0].get("current_version_id")
            if not version_id:
                raise SpecMissing(f"document {path} has no current version")
            vers = self._get("document_version", select="version,status", id=f"eq.{version_id}")
            if not vers:
                raise SpecMissing(f"document {path}: its current version row is missing")
        secs = self._get("document_section", select="ord,heading,body",
                         document_version_id=f"eq.{version_id}", order="ord.asc")
        return _shape_document(path, vers[0]["version"], vers[0]["status"], secs)

    def pinned_inputs(self, task_id):
        rows = self._get("task_input", select="document_path,document_version", task_id=f"eq.{task_id}")
        return {r["document_path"]: r.get("document_version") for r in rows}

    def work_item(self, ident):
        eng = self._engagement(f"work item {ident}")
        rows = self._get("backlog_item", select="ref,kind,parent_ref,title,ticket_key,body,ord",
                         engagement_id=f"eq.{eng}", **{"or": f"(ticket_key.eq.{ident},ref.eq.{ident})"})
        hit = pick_work_item(rows, ident)
        if hit is None:
            raise SpecMissing(f"no epic or story {ident!r} for engagement {eng}")
        return hit

    def work_items(self, parent_ref):
        eng = self._engagement(f"children of {parent_ref}")
        return self._get("backlog_item", select="ref,kind,parent_ref,title,ticket_key,body,ord",
                         engagement_id=f"eq.{eng}", parent_ref=f"eq.{parent_ref}", order="ord.asc")

    def _wf_scope(self) -> str:
        return "(engagement_id.is.null" + (f",engagement_id.eq.{self.engagement_id})" if self.engagement_id else ")")

    def workflow_steps(self, code):
        return _steps_from_db(self, code)

    def workflow_codes(self):
        wfs = self._get("workflow", select="id,code", org_id=f"eq.{self._org()}", enabled="eq.true",
                        **{"or": self._wf_scope()})
        if not wfs:
            return []
        ids = ",".join(w["id"] for w in wfs)
        published = {v["workflow_id"] for v in self._get(
            "workflow_version", select="workflow_id", status="eq.published", workflow_id=f"in.({ids})")}
        return sorted({w["code"] for w in wfs if w["id"] in published})

    def role(self, code):
        scope = "(engagement_id.is.null" + (f",engagement_id.eq.{self.engagement_id})" if self.engagement_id else ")")
        rows = self._get("role", select="code,label,agent,hosts,capabilities,engagement_id",
                         org_id=f"eq.{self._org()}", code=f"eq.{code}", **{"or": scope})
        hit = pick_role(rows, self.engagement_id, code)
        if hit is None:
            raise SpecMissing(f"no role row for {code!r}")
        return hit


def _steps_from_db(src, code):
    wfs = src._get("workflow", select="id,code,engagement_id", org_id=f"eq.{src._org()}",
                   code=f"eq.{code}", enabled="eq.true", **{"or": src._wf_scope()})
    wf = pick_workflow(wfs, src.engagement_id, code)
    if wf is None:
        raise SpecMissing(f"no workflow {code!r} (enabled) for this org. Workflows are imported from "
                          "compass/seed/*.csv by the app's /api/import.")
    vers = src._get("workflow_version", select="id,version", workflow_id=f"eq.{wf['id']}", status="eq.published")
    if not vers:
        raise SpecMissing(f"workflow {code!r} has no published version")
    rows = src._get("workflow_step",
                    select="ord,kind,role_code,task,title,nests_workflow_code,depends_on,reads",
                    workflow_version_id=f"eq.{vers[0]['id']}", order="ord.asc")
    if not rows:
        raise SpecMissing(f"workflow {code!r} version {vers[0]['version']} has no steps")
    agents = {}
    out = []
    for r in rows:
        agent = None
        if r.get("role_code"):
            if r["role_code"] not in agents:
                try:
                    agents[r["role_code"]] = src.role(r["role_code"]).get("agent")
                except SpecMissing:
                    if r["kind"] == "agent":
                        raise     # a step an agent must run, for a role that does not exist
                    agents[r["role_code"]] = None
            agent = agents[r["role_code"]]
        out.append({"ord": r["ord"], "kind": r["kind"], "role_code": r.get("role_code"), "agent": agent,
                    "task": r.get("task"), "title": r.get("title"),
                    "nests": r.get("nests_workflow_code"), "depends_on": r.get("depends_on") or [],
                    "reads": r.get("reads") or []})
    return out


def from_env(engagement_id: Optional[str], env=None, transport=None) -> DbSpecSource:
    """The source for a spawned run: the app's own Supabase variables, inherited at spawn.

    Absent credentials are a halt, not a reason to look at the disk.
    """
    env = os.environ if env is None else env
    url, key = env.get("NEXT_PUBLIC_SUPABASE_URL"), env.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise SpecUnavailable(
            "NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set — the orchestrator "
            "reads framework content from the database and has no disk fallback.")
    return DbSpecSource(url, key, engagement_id, transport=transport)


@contextlib.contextmanager
def prompt_file(text: str):
    """Hold `text` in a temp file for the length of a dispatch, then delete it.

    Every host adapter takes the agent prompt as a FILE PATH (`claude_code` hands it to
    `--append-system-prompt-file`), and the prompt now comes from the database as text. This is the
    only place it touches the disk, and it lives for one dispatch — the file is never read back as a
    source, so it cannot become a second copy that drifts.
    """
    fh = tempfile.NamedTemporaryFile("w", suffix=".md", delete=False, encoding="utf-8")
    try:
        fh.write(text)
        fh.close()
        yield fh.name
    finally:
        try:
            os.unlink(fh.name)
        except OSError:
            pass

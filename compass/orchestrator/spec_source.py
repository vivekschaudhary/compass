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

The tier rules are pure functions over rows (`pick_spec`, `pick_template`, `pick_role`) so a shared
vector file can pin them from both languages; the DB source only fetches candidate rows.

The HTTP transport is injectable (`transport=`), as in `stores.py`, so this is tested without a
database. The default uses urllib — no added dependency.
"""
import json
import os
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


class InMemorySpecSource(SpecSource):
    """Rows held in lists, resolved by the same pure functions. For tests, and for the vectors."""

    def __init__(self, specs=None, templates=None, roles=None, engagement_id=None, org_id=None):
        self.specs, self.templates, self.roles = specs or [], templates or [], roles or []
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

    def role(self, code):
        scope = "(engagement_id.is.null" + (f",engagement_id.eq.{self.engagement_id})" if self.engagement_id else ")")
        rows = self._get("role", select="code,label,agent,hosts,capabilities,engagement_id",
                         org_id=f"eq.{self._org()}", code=f"eq.{code}", **{"or": scope})
        hit = pick_role(rows, self.engagement_id, code)
        if hit is None:
            raise SpecMissing(f"no role row for {code!r}")
        return hit


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

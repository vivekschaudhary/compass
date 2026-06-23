"""Tests for #87 slice 1 — read-only tool-using executor.

Covers the security-critical sandbox (path-escape refusal), the read tools,
the tool dispatch, the dispatch_with_tools loop (with a fake client — no
network), and run.py's executor_tools frontmatter parse.
"""
import tempfile
import unittest
from pathlib import Path

from compass.orchestrator.hosts import tools
from compass.orchestrator.hosts.claude import dispatch_with_tools
from compass.orchestrator.run import _read_agent_tools


class TestSandbox(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.proj = Path(self._tmp.name)
        (self.proj / "docs").mkdir()
        (self.proj / "docs" / "a.md").write_text("hello world\n", encoding="utf-8")

    def tearDown(self):
        self._tmp.cleanup()

    def test_read_file_in_bounds(self):
        self.assertIn("hello world", tools.execute_tool("read_file", {"path": "docs/a.md"}, self.proj))

    def test_read_file_missing(self):
        self.assertIn("not found", tools.execute_tool("read_file", {"path": "docs/nope.md"}, self.proj))

    def test_path_escape_relative_refused(self):
        out = tools.execute_tool("read_file", {"path": "../../../etc/passwd"}, self.proj)
        self.assertIn("escapes project directory", out)

    def test_path_escape_absolute_refused(self):
        out = tools.execute_tool("read_file", {"path": "/etc/passwd"}, self.proj)
        self.assertIn("escapes project directory", out)

    def test_glob(self):
        out = tools.execute_tool("glob", {"pattern": "docs/*.md"}, self.proj)
        self.assertIn("docs/a.md", out)

    def test_grep(self):
        (self.proj / "docs" / "b.md").write_text("foo\nbar baz\n", encoding="utf-8")
        out = tools.execute_tool("grep", {"pattern": "baz"}, self.proj)
        self.assertIn("docs/b.md:2", out)

    def test_unknown_tool(self):
        self.assertIn("unknown tool", tools.execute_tool("rm_rf", {}, self.proj))

    def test_missing_arg(self):
        self.assertIn("missing required argument", tools.execute_tool("read_file", {}, self.proj))


# ── Fakes for the dispatch loop (no network) ──────────────────────────────────

class _Block:
    def __init__(self, type, text=None, name=None, input=None, id=None):
        self.type = type
        self.text = text
        self.name = name
        self.input = input
        self.id = id


class _Resp:
    def __init__(self, stop_reason, content):
        self.stop_reason = stop_reason
        self.content = content


class _FakeMessages:
    def __init__(self, scripted):
        self._scripted = list(scripted)
        self.calls = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        return self._scripted.pop(0)


class _FakeClient:
    def __init__(self, scripted):
        self.messages = _FakeMessages(scripted)


class TestDispatchLoop(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.proj = Path(self._tmp.name)
        (self.proj / "arch.md").write_text("DB: postgres, RLS on watchlist\n", encoding="utf-8")
        self.agent = self.proj / "engineer.md"
        self.agent.write_text("---\nname: engineer\n---\nYou fix bugs.\n", encoding="utf-8")

    def tearDown(self):
        self._tmp.cleanup()

    def test_tool_then_final(self):
        # Turn 1: model asks to read a file. Turn 2: model returns final text.
        scripted = [
            _Resp("tool_use", [
                _Block("tool_use", name="read_file", input={"path": "arch.md"}, id="t1"),
            ]),
            _Resp("end_turn", [_Block("text", text="Fix: add RLS policy on watchlist.")]),
        ]
        client = _FakeClient(scripted)
        out = dispatch_with_tools(
            str(self.agent), "fix-bug", "Fix the watchlist leak.", self.proj,
            client=client,
        )
        self.assertEqual(out, "Fix: add RLS policy on watchlist.")
        # Second call must include the tool_result for t1 (the loop fed the read back).
        second_call_messages = client.messages.calls[1]["messages"]
        tool_results = [
            b for m in second_call_messages if isinstance(m["content"], list)
            for b in m["content"] if isinstance(b, dict) and b.get("type") == "tool_result"
        ]
        self.assertEqual(len(tool_results), 1)
        self.assertEqual(tool_results[0]["tool_use_id"], "t1")
        self.assertIn("postgres", tool_results[0]["content"])

    def test_immediate_final(self):
        client = _FakeClient([_Resp("end_turn", [_Block("text", text="done")])])
        out = dispatch_with_tools(
            str(self.agent), "fix-bug", "trivial", self.proj, client=client,
        )
        self.assertEqual(out, "done")

    def test_max_iterations_wraps_up(self):
        # Cap reached → final tools-disabled turn forces a summary (#100), NOT a
        # raise that discards completed work. Returns the summary + a cap note.
        tool = _Resp("tool_use", [
            _Block("tool_use", name="glob", input={"pattern": "*.md"}, id="t"),
        ])
        scripted = [tool, tool, tool, _Resp("end_turn", [
            _Block("text", text="Summary: wrote the fix + test, all checks green."),
        ])]
        out = dispatch_with_tools(
            str(self.agent), "fix-bug", "x", self.proj,
            client=_FakeClient(scripted), max_iterations=3, on_event=lambda e: None,
        )
        self.assertIn("Summary:", out)
        self.assertIn("cap", out.lower())   # the wrap-up note

    def test_on_event_streams_tool_calls(self):
        scripted = [
            _Resp("tool_use", [
                _Block("tool_use", name="read_file", input={"path": "arch.md"}, id="t1"),
            ]),
            _Resp("end_turn", [_Block("text", text="done")]),
        ]
        events = []
        dispatch_with_tools(
            str(self.agent), "fix-bug", "x", self.proj,
            client=_FakeClient(scripted), on_event=events.append,
        )
        types = [e["type"] for e in events]
        self.assertIn("tool_use", types)
        self.assertIn("tool_result", types)
        self.assertEqual(next(e for e in events if e["type"] == "tool_use")["name"], "read_file")

    def test_prompt_caching_system_and_tools(self):
        # #105: system is a cache-marked block list; the last tool carries
        # cache_control (caches the static prefix across the tool loop).
        scripted = [_Resp("end_turn", [_Block("text", text="ok")])]
        client = _FakeClient(scripted)
        dispatch_with_tools(
            str(self.agent), "fix-bug", "x", self.proj, client=client,
            tool_schemas=[{"name": "read_file"}, {"name": "glob"}],
            on_event=lambda e: None,
        )
        call = client.messages.calls[0]
        # system → list of blocks, last block cache-marked
        self.assertIsInstance(call["system"], list)
        self.assertEqual(call["system"][-1]["cache_control"], {"type": "ephemeral"})
        # tools → last entry cache-marked, earlier entries not
        self.assertEqual(call["tools"][-1]["cache_control"], {"type": "ephemeral"})
        self.assertNotIn("cache_control", call["tools"][0])

    def test_rolling_conversation_breakpoint_single(self):
        # After a tool turn, the next call's last message carries the rolling
        # cache breakpoint — and there must be EXACTLY ONE across all messages
        # (Anthropic caps total breakpoints; one per turn would overflow).
        scripted = [
            _Resp("tool_use", [
                _Block("tool_use", name="read_file", input={"path": "arch.md"}, id="t1"),
            ]),
            _Resp("end_turn", [_Block("text", text="done")]),
        ]
        client = _FakeClient(scripted)
        dispatch_with_tools(
            str(self.agent), "fix-bug", "x", self.proj, client=client,
            on_event=lambda e: None,
        )
        msgs = client.messages.calls[1]["messages"]
        marked = [
            b for m in msgs if isinstance(m["content"], list)
            for b in m["content"] if isinstance(b, dict) and "cache_control" in b
        ]
        self.assertEqual(len(marked), 1)  # exactly one rolling breakpoint
        # and it's on the most recent message (the tool_result we just fed back)
        self.assertEqual(msgs[-1]["content"][-1].get("cache_control"), {"type": "ephemeral"})

    def test_usage_event_emitted(self):
        # #105: response.usage → a usage event on the spine, incl. cache fields.
        class _Usage:
            input_tokens = 1200
            output_tokens = 40
            cache_read_input_tokens = 1000
            cache_creation_input_tokens = 200
        resp = _Resp("end_turn", [_Block("text", text="ok")])
        resp.usage = _Usage()
        events = []
        dispatch_with_tools(
            str(self.agent), "fix-bug", "x", self.proj,
            client=_FakeClient([resp]), on_event=events.append,
        )
        usage = [e for e in events if e["type"] == "usage"]
        self.assertEqual(len(usage), 1)
        self.assertEqual(usage[0]["cache_read_input_tokens"], 1000)
        self.assertEqual(usage[0]["input_tokens"], 1200)

    def test_no_usage_object_is_safe(self):
        # The plain fake response has no .usage → no usage event, no crash.
        events = []
        dispatch_with_tools(
            str(self.agent), "fix-bug", "x", self.proj,
            client=_FakeClient([_Resp("end_turn", [_Block("text", text="ok")])]),
            on_event=events.append,
        )
        self.assertEqual([e for e in events if e["type"] == "usage"], [])


class TestAgentToolsFrontmatter(unittest.TestCase):
    def _agent(self, fm: str) -> Path:
        f = tempfile.NamedTemporaryFile("w", suffix=".md", delete=False, encoding="utf-8")
        f.write(f"---\n{fm}\n---\nbody\n")
        f.close()
        return Path(f.name)

    def test_present(self):
        p = self._agent("name: engineer\nexecutor_tools: [read_file, glob, grep]")
        try:
            self.assertEqual(_read_agent_tools(p), ["read_file", "glob", "grep"])
        finally:
            p.unlink()

    def test_absent(self):
        p = self._agent("name: pm\npreferred_hosts: [claude]")
        try:
            self.assertEqual(_read_agent_tools(p), [])
        finally:
            p.unlink()

    def test_real_engineer_declares_tools(self):
        eng = Path(__file__).resolve().parents[2] / "agents" / "engineer.md"
        self.assertEqual(
            _read_agent_tools(eng), ["read_file", "glob", "grep", "write_file", "bash"]
        )


class TestWriteGating(unittest.TestCase):
    """Slice 2: write tools are opt-in (allow_write) at both layers."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.proj = Path(self._tmp.name)

    def tearDown(self):
        self._tmp.cleanup()

    def test_schemas_for_drops_write_when_off(self):
        names = ["read_file", "glob", "grep", "write_file", "bash"]
        got = [s["name"] for s in tools.schemas_for(names, allow_write=False)]
        self.assertEqual(got, ["read_file", "glob", "grep"])

    def test_schemas_for_includes_write_when_on(self):
        names = ["read_file", "write_file", "bash"]
        got = [s["name"] for s in tools.schemas_for(names, allow_write=True)]
        self.assertEqual(got, ["read_file", "write_file", "bash"])

    def test_execute_refuses_write_without_allow(self):
        out = tools.execute_tool("write_file", {"path": "x.txt", "content": "hi"}, self.proj, allow_write=False)
        self.assertIn("requires --allow-write", out)
        self.assertFalse((self.proj / "x.txt").exists())

    def test_write_file_when_allowed(self):
        out = tools.execute_tool(
            "write_file", {"path": "sub/x.txt", "content": "hi"}, self.proj, allow_write=True
        )
        self.assertIn("wrote", out)
        self.assertEqual((self.proj / "sub" / "x.txt").read_text(), "hi")

    def test_write_file_path_escape_refused(self):
        out = tools.execute_tool(
            "write_file", {"path": "../evil.txt", "content": "x"}, self.proj, allow_write=True
        )
        self.assertIn("escapes project directory", out)


class TestBashSafety(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.proj = Path(self._tmp.name)

    def tearDown(self):
        self._tmp.cleanup()

    def _run(self, cmd):
        return tools.execute_tool("bash", {"command": cmd}, self.proj, allow_write=True)

    def test_denies_force_push(self):
        self.assertIn("refused", self._run("git push --force origin main"))

    def test_denies_no_verify(self):
        self.assertIn("refused", self._run("git commit -m x --no-verify"))

    def test_denies_reset_hard(self):
        self.assertIn("refused", self._run("git reset --hard HEAD~3"))

    def test_denies_rm_rf(self):
        self.assertIn("refused", self._run("rm -rf ."))

    def test_denies_sudo(self):
        self.assertIn("refused", self._run("sudo rm x"))

    def test_allows_safe_command_in_sandbox(self):
        (self.proj / "marker.txt").write_text("ok", encoding="utf-8")
        out = self._run("ls")
        self.assertIn("exit code: 0", out)
        self.assertIn("marker.txt", out)

    def test_bash_refused_without_allow_write(self):
        out = tools.execute_tool("bash", {"command": "ls"}, self.proj, allow_write=False)
        self.assertIn("requires --allow-write", out)

    def test_stdin_command_does_not_hang(self):
        # `cat` reads stdin; with stdin=DEVNULL it gets immediate EOF → exits 0
        # fast, instead of blocking until the 120s timeout (#97).
        out = self._run("cat")
        self.assertIn("exit code: 0", out)


class TestHostSelection(unittest.TestCase):
    """#97: a host is selectable only if its key AND its SDK are present."""

    def test_pkg_importable(self):
        from compass.orchestrator.hosts.router import _pkg_importable
        self.assertTrue(_pkg_importable("os"))
        self.assertFalse(_pkg_importable("definitely_not_a_real_pkg_xyz"))

    def test_adapter_importable(self):
        from compass.orchestrator.hosts.router import _adapter_importable
        self.assertTrue(_adapter_importable("claude"))    # anthropic installed
        self.assertTrue(_adapter_importable("unknown"))   # no mapping → pass-through

    def test_select_host_ready_needs_key_and_pkg(self):
        import os
        from compass.orchestrator.hosts import router
        old = os.environ.get("ANTHROPIC_API_KEY")
        os.environ["ANTHROPIC_API_KEY"] = "test-key"
        try:
            self.assertEqual(router.select_host(["claude"]), "claude")
        finally:
            if old is None:
                os.environ.pop("ANTHROPIC_API_KEY", None)
            else:
                os.environ["ANTHROPIC_API_KEY"] = old

    def test_select_host_none_when_no_ready_host(self):
        from compass.orchestrator.hosts import router
        self.assertIsNone(router.select_host(["deepseek"]))  # no key path → skipped


class TestWorkBranch(unittest.TestCase):
    """#99: write-mode work lands on a branch, never on main."""

    def test_branch_name_with_bet(self):
        from compass.orchestrator.run import _work_branch_name
        self.assertEqual(
            _work_branch_name("fix", "WLT-12", "Bug: session expires too quickly"),
            "fix/WLT-12-session-expires-too-quickly",
        )

    def test_branch_name_no_bet_strips_label(self):
        from compass.orchestrator.run import _work_branch_name
        self.assertEqual(
            _work_branch_name("ops", None, "Change: rotate the api secret"),
            "ops/rotate-api-secret",   # 'the' dropped as a stopword (#100)
        )

    def test_branch_type_by_workflow(self):
        from compass.orchestrator.run import _work_branch_name
        self.assertTrue(_work_branch_name("build", None, "x").startswith("feat/"))
        self.assertTrue(_work_branch_name("triage", None, "x").startswith("fix/"))

    def test_ensure_branch_off_main(self):
        import subprocess
        from compass.orchestrator.run import _ensure_work_branch
        with tempfile.TemporaryDirectory() as d:
            def git(*a):
                return subprocess.run(["git", "-C", d, *a], capture_output=True, text=True)
            git("init", "-b", "main")
            git("config", "user.email", "t@t")
            git("config", "user.name", "t")
            (Path(d) / "f.txt").write_text("x")
            git("add", "."); git("commit", "-m", "init")
            # on main → creates the work branch
            self.assertEqual(_ensure_work_branch(d, "fix/x-y"), "fix/x-y")
            self.assertEqual(
                git("rev-parse", "--abbrev-ref", "HEAD").stdout.strip(), "fix/x-y"
            )
            # already on a work branch → reuse, don't re-branch
            self.assertEqual(_ensure_work_branch(d, "fix/other"), "fix/x-y")

    def test_ensure_branch_non_git_returns_none(self):
        from compass.orchestrator.run import _ensure_work_branch
        with tempfile.TemporaryDirectory() as d:
            self.assertIsNone(_ensure_work_branch(d, "fix/x"))


class TestOpenAIAdapter(unittest.TestCase):
    # #112: newer OpenAI models reject `max_tokens` (400) — the adapter must send
    # `max_completion_tokens`. Fake client captures the create() kwargs.
    class _FakeCompletions:
        def __init__(self):
            self.calls = []
        def create(self, **kw):
            self.calls.append(kw)
            msg = type("M", (), {"content": "review: LGTM"})()
            return type("R", (), {"choices": [type("C", (), {"message": msg})()]})()

    class _FakeChat:
        def __init__(self, comps):
            self.completions = comps

    class _FakeClient:
        def __init__(self, comps):
            self.chat = TestOpenAIAdapter._FakeChat(comps)

    def test_uses_max_completion_tokens_not_max_tokens(self):
        from compass.orchestrator.hosts.openai import dispatch
        comps = self._FakeCompletions()
        with tempfile.NamedTemporaryFile("w", suffix=".md", delete=False, encoding="utf-8") as f:
            f.write("---\nname: reviewer\n---\nYou review.\n")
            agent = f.name
        try:
            out = dispatch(agent, "review-pr", "review this", model="gpt-5",
                           max_tokens=4096, client=self._FakeClient(comps))
        finally:
            Path(agent).unlink()
        self.assertEqual(out, "review: LGTM")
        kw = comps.calls[0]
        self.assertEqual(kw["max_completion_tokens"], 4096)  # the fix
        self.assertNotIn("max_tokens", kw)                   # the bug (400 on gpt-5)


if __name__ == "__main__":
    unittest.main()

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

    def test_max_iterations_backstop(self):
        # Always asks for a tool → loop must terminate at the cap, not hang.
        always_tool = _Resp("tool_use", [
            _Block("tool_use", name="glob", input={"pattern": "*.md"}, id="t"),
        ])

        class _Loop:
            def create(self_inner, **kw):
                return always_tool

        class _C:
            messages = _Loop()

        out = dispatch_with_tools(
            str(self.agent), "fix-bug", "x", self.proj, client=_C(), max_iterations=3,
        )
        self.assertIn("max_iterations", out)


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


if __name__ == "__main__":
    unittest.main()

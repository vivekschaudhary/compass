"""Tests for the codex-cli host (#155) — subscription-backed Codex dispatch.

No test invokes the real `codex` binary: pure helpers (`_build_cli_argv`,
`_parse_result`, `_progress_line`, `_cli_model`) are unit-tested directly, and the
dispatch path runs through an injected fake `runner`. The point is the REVIEWER being
reachable flat-cost for a CLI-only operator, so the key assertions are: allow_write →
full-bypass sandbox parity, OPENAI_API_KEY stripped (flat cost), and a NOTE-not-usage
emission (so the budget cap can't see a subscription run).
"""
import json
import os
import unittest

from compass.orchestrator.hosts import codex_cli as cx
from compass.orchestrator.hosts import router
from compass.orchestrator import run as runmod
from compass.orchestrator import events as ev


class _Proc:
    def __init__(self, stdout="", stderr="", returncode=0):
        self.stdout, self.stderr, self.returncode = stdout, stderr, returncode


def _stream(text="hello", inp=100, out=20):
    """A codex `--json` stdout stream: an agent_message + a turn.completed usage."""
    return "\n".join([
        json.dumps({"type": "thread.started", "thread_id": "t1"}),
        json.dumps({"type": "item.completed",
                    "item": {"id": "i0", "type": "agent_message", "text": text}}),
        json.dumps({"type": "turn.completed",
                    "usage": {"input_tokens": inp, "output_tokens": out}}),
    ])


class TestBuildArgv(unittest.TestCase):
    def test_readonly_step(self):
        argv = cx._build_cli_argv(None, None, False, "/tmp/o.txt")
        self.assertEqual(argv[:2], ["codex", "exec"])
        self.assertIn("--json", argv)
        self.assertIn("--ignore-user-config", argv)            # #148-style isolation
        self.assertIn("-s", argv)
        self.assertEqual(argv[argv.index("-s") + 1], "read-only")
        self.assertNotIn("-C", argv)
        self.assertNotIn("--dangerously-bypass-approvals-and-sandbox", argv)
        self.assertEqual(argv[argv.index("-o") + 1], "/tmp/o.txt")

    def test_allow_write_full_bypass_and_cwd(self):
        argv = cx._build_cli_argv(None, "/proj", True, "/tmp/o.txt")
        self.assertEqual(argv[argv.index("-C") + 1], "/proj")
        self.assertEqual(argv[argv.index("--add-dir") + 1], "/proj")
        self.assertIn("--dangerously-bypass-approvals-and-sandbox", argv)
        self.assertNotIn("-s", argv)            # bypass replaces the sandbox policy

    def test_model_omitted_by_default_used_when_overridden(self):
        self.assertNotIn("-m", cx._build_cli_argv(None, None, False, "/o"))
        os.environ["COMPASS_CODEX_CLI_MODEL"] = "gpt-5-codex"
        try:
            argv = cx._build_cli_argv("gpt-5", None, False, "/o")
            self.assertEqual(argv[argv.index("-m") + 1], "gpt-5-codex")
        finally:
            del os.environ["COMPASS_CODEX_CLI_MODEL"]


class TestParseResult(unittest.TestCase):
    def test_from_stream_agent_message(self):
        text, usage = cx._parse_result(_stream("the review", 50, 7))
        self.assertEqual(text, "the review")
        self.assertEqual(usage["input_tokens"], 50)

    def test_prefers_output_file(self):
        import tempfile
        f = tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False, encoding="utf-8")
        f.write("FROM FILE\n")
        f.close()
        try:
            text, _ = cx._parse_result(_stream("from stream"), output_file=f.name)
            self.assertEqual(text, "FROM FILE")   # -o file wins over the stream
        finally:
            os.unlink(f.name)

    def test_no_message_raises(self):
        with self.assertRaises(RuntimeError):
            cx._parse_result(json.dumps({"type": "turn.completed", "usage": {}}))


class TestProgress(unittest.TestCase):
    def test_command_execution(self):
        line = cx._progress_line({"type": "item.completed",
                                  "item": {"type": "command_execution", "command": "gh pr view 42"}})
        self.assertIn("gh pr view 42", line)

    def test_agent_message_and_skips(self):
        self.assertEqual(
            cx._progress_line({"type": "item.completed",
                               "item": {"type": "agent_message", "text": "Reviewing the diff"}}),
            "· Reviewing the diff")
        self.assertIsNone(cx._progress_line({"type": "item.completed",
                                             "item": {"type": "reasoning"}}))
        self.assertIsNone(cx._progress_line({"type": "turn.started"}))


class TestDispatch(unittest.TestCase):
    def test_returns_text_note_no_usage(self):
        events = []
        out = cx.dispatch("/x/agent.md", "review", "do it",
                          runner=lambda argv, input, cwd=None: _Proc(stdout=_stream("REVIEWED")),
                          on_event=events.append)
        self.assertEqual(out, "REVIEWED")
        types = [e["type"] for e in events]
        self.assertIn(ev.NOTE, types)
        self.assertNotIn(ev.USAGE, types)               # flat-cost: invisible to --max-cost
        self.assertIn("subscription", next(e for e in events if e["type"] == ev.NOTE)["text"])

    def test_nonzero_exit_raises_clean(self):
        with self.assertRaises(RuntimeError):
            cx.dispatch("/x/agent.md", "t", "x",
                        runner=lambda argv, input, cwd=None: _Proc(stderr="not logged in",
                                                                   returncode=1),
                        on_event=lambda e: None)

    def test_execute_directive_and_no_self_approve_on_tool_steps_only(self):
        seen = {}

        def runner(argv, input, cwd=None):
            seen.setdefault("inputs", []).append(input)
            return _Proc(stdout=_stream())
        cx.dispatch_with_tools("/x/agent.md", "t", "MSG", "/proj",
                               allow_write=True, runner=runner, on_event=lambda e: None)
        cx.dispatch("/x/agent.md", "t", "MSG", runner=runner, on_event=lambda e: None)
        tool_input, plain_input = seen["inputs"]
        self.assertIn("Orchestrator execution mode", tool_input)
        self.assertIn("NEVER self-approve", tool_input)   # #153 carve-out
        self.assertNotIn("Orchestrator execution mode", plain_input)

    def test_subscription_env_strips_openai_key(self):
        saved = os.environ.get("OPENAI_API_KEY")
        try:
            os.environ["OPENAI_API_KEY"] = "sk-metered"
            env = cx._subscription_env()
            self.assertNotIn("OPENAI_API_KEY", env)
            self.assertIn("PATH", env)
        finally:
            if saved is None:
                os.environ.pop("OPENAI_API_KEY", None)
            else:
                os.environ["OPENAI_API_KEY"] = saved

    def test_idle_timeout_parsing(self):
        saved = os.environ.get("COMPASS_CODEX_CLI_IDLE_TIMEOUT")
        try:
            os.environ.pop("COMPASS_CODEX_CLI_IDLE_TIMEOUT", None)
            self.assertEqual(cx._cli_idle_timeout(), cx._DEFAULT_CLI_IDLE)
            os.environ["COMPASS_CODEX_CLI_IDLE_TIMEOUT"] = "90"
            self.assertEqual(cx._cli_idle_timeout(), 90)
            os.environ["COMPASS_CODEX_CLI_IDLE_TIMEOUT"] = "0"
            self.assertIsNone(cx._cli_idle_timeout())
        finally:
            if saved is None:
                os.environ.pop("COMPASS_CODEX_CLI_IDLE_TIMEOUT", None)
            else:
                os.environ["COMPASS_CODEX_CLI_IDLE_TIMEOUT"] = saved


class TestRouterIntegration(unittest.TestCase):
    def test_has_key_reflects_binary(self):
        saved = router.shutil.which
        try:
            router.shutil.which = lambda name: "/usr/bin/codex" if name == "codex" else None
            self.assertTrue(router._has_key("codex-cli"))
            router.shutil.which = lambda name: None
            self.assertFalse(router._has_key("codex-cli"))
        finally:
            router.shutil.which = saved

    def test_family_is_openai(self):
        self.assertEqual(router._family("codex-cli"), "openai")

    def test_adapter_importable_no_sdk(self):
        self.assertTrue(router._adapter_importable("codex-cli"))

    def test_dispatch_routes_to_codex_cli_with_tools(self):
        from compass.orchestrator.hosts import codex_cli
        saved = codex_cli.dispatch_with_tools
        seen = {}
        try:
            def fake(*a, **k):
                seen["project_dir"] = a[3] if len(a) > 3 else k.get("project_dir")
                return "REVIEWED"
            codex_cli.dispatch_with_tools = fake
            out = router.dispatch_to_host("codex-cli", "/x/agent.md", "review", "msg",
                                          tools=None, project_dir="/proj", allow_write=True)
            self.assertEqual(out, "REVIEWED")
            self.assertEqual(seen["project_dir"], "/proj")
        finally:
            codex_cli.dispatch_with_tools = saved


class TestRemap(unittest.TestCase):
    def test_codex_remapped_to_cli(self):
        self.assertEqual(runmod._remap_codex_cli(["codex", "gemini"]),
                         ["codex-cli", "gemini"])

    def test_claude_untouched(self):
        # remap is codex-only; a claude step is not affected
        self.assertEqual(runmod._remap_codex_cli(["claude"]), ["claude"])

    def test_reviewer_becomes_reachable(self):
        # the whole point: reviewer [codex, gemini] → [codex-cli, gemini], and
        # codex-cli is ready when the binary's on PATH (independence preserved).
        self.assertEqual(runmod._remap_codex_cli(["codex", "gemini"])[0], "codex-cli")


if __name__ == "__main__":
    unittest.main()

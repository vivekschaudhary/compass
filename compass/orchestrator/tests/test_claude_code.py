"""Tests for the claude-code (CLI) host (#120) — subscription-backed dispatch.

No test invokes the real `claude` binary: pure helpers (`_cli_model`,
`_build_cli_argv`, `_parse_result`) are unit-tested directly, and the dispatch
path runs through an injected fake `runner`. The point of #120 is flat cost, so
the key assertions are: allow_write → bypassPermissions parity, and dispatch
emits a NOTE but NO `usage` event (so `--max-cost` can't false-trip).
"""
import json
import os
import unittest

from compass.orchestrator.hosts import claude_code as cc
from compass.orchestrator.hosts import router
from compass.orchestrator import run as runmod
from compass.orchestrator import events as ev


class _Proc:
    def __init__(self, stdout="", stderr="", returncode=0):
        self.stdout, self.stderr, self.returncode = stdout, stderr, returncode


def _ok_json(text="hello", inp=10, out=5, cost=0.02):
    return json.dumps({"result": text, "is_error": False, "total_cost_usd": cost,
                       "usage": {"input_tokens": inp, "output_tokens": out}})


class TestCliModel(unittest.TestCase):
    def test_family_aliases(self):
        self.assertEqual(cc._cli_model("claude-sonnet-4-6"), "sonnet")
        self.assertEqual(cc._cli_model("claude-opus-4-8"), "opus")
        self.assertEqual(cc._cli_model("claude-haiku-4-5"), "haiku")

    def test_passthrough_and_default(self):
        self.assertEqual(cc._cli_model("some-custom-id"), "some-custom-id")
        self.assertEqual(cc._cli_model(""), "sonnet")

    def test_env_override(self):
        os.environ["COMPASS_CLAUDE_CLI_MODEL"] = "opusplanck"
        try:
            self.assertEqual(cc._cli_model("claude-sonnet-4-6"), "opusplanck")
        finally:
            del os.environ["COMPASS_CLAUDE_CLI_MODEL"]


class TestBuildArgv(unittest.TestCase):
    def test_readonly_step_no_dir_no_perm(self):
        argv = cc._build_cli_argv("claude-sonnet-4-6", "/x/agent.md")
        self.assertEqual(argv[:2], ["claude", "-p"])
        self.assertIn("--output-format", argv)
        # #152: stream-json (+ required --verbose) so the idle-timeout has a liveness
        # signal and the run log shows live activity.
        self.assertEqual(argv[argv.index("--output-format") + 1], "stream-json")
        self.assertIn("--verbose", argv)
        # #170: partial chunks stream token deltas so a long compose turn isn't silent
        # (else the idle guard false-kills the architect mid-draft).
        self.assertIn("--include-partial-messages", argv)
        self.assertEqual(argv[argv.index("--append-system-prompt-file") + 1], "/x/agent.md")
        self.assertEqual(argv[argv.index("--model") + 1], "sonnet")
        self.assertNotIn("--add-dir", argv)
        self.assertNotIn("--permission-mode", argv)

    def test_isolated_from_project_user_settings(self):
        # #148: load no settings so the consumer repo's allowlist / user memory
        # can't make the agent confabulate a permission/context block.
        argv = cc._build_cli_argv("claude-sonnet-4-6", "/x/agent.md")
        i = argv.index("--setting-sources")
        self.assertEqual(argv[i + 1], "")  # empty → load none

    def test_allow_write_maps_to_bypass(self):
        argv = cc._build_cli_argv("claude-opus-4-8", "/x/agent.md",
                                  project_dir="/proj", allow_write=True)
        self.assertEqual(argv[argv.index("--add-dir") + 1], "/proj")
        self.assertEqual(argv[argv.index("--permission-mode") + 1], "bypassPermissions")

    def test_tool_step_without_write_is_default_mode(self):
        argv = cc._build_cli_argv("claude-opus-4-8", "/x/agent.md",
                                  project_dir="/proj", allow_write=False)
        self.assertEqual(argv[argv.index("--permission-mode") + 1], "default")


class TestParseResult(unittest.TestCase):
    def test_good(self):
        text, usage, cost = cc._parse_result(_ok_json("hi", 7, 3, 0.01))
        self.assertEqual(text, "hi")
        self.assertEqual(usage["input_tokens"], 7)
        self.assertEqual(cost, 0.01)

    def test_unparseable_raises(self):
        with self.assertRaises(RuntimeError):
            cc._parse_result("{not json")

    def test_error_result_raises(self):
        with self.assertRaises(RuntimeError):
            cc._parse_result(json.dumps({"is_error": True, "result": "boom"}))

    def test_missing_result_raises(self):
        with self.assertRaises(RuntimeError):
            cc._parse_result(json.dumps({"is_error": False}))


class TestStreaming(unittest.TestCase):
    """#152: stream-json parsing + idle-timeout config (the runner I/O itself —
    threads/Popen — stays exercised via the fail-loud fake; the parsing is pure)."""

    def test_progress_line_tool_use(self):
        obj = {"type": "assistant", "message": {"content": [
            {"type": "tool_use", "name": "Read", "input": {"file_path": "/a/b.md"}}]}}
        self.assertEqual(cc._progress_line(obj), "· Read /a/b.md")

    def test_progress_line_bash_uses_command(self):
        obj = {"type": "assistant", "message": {"content": [
            {"type": "tool_use", "name": "Bash", "input": {"command": "ls -la"}}]}}
        self.assertIn("ls -la", cc._progress_line(obj))

    def test_progress_line_text_and_skips(self):
        say = {"type": "assistant", "message": {"content": [
            {"type": "text", "text": "Reading the brief now"}]}}
        self.assertEqual(cc._progress_line(say), "· Reading the brief now")
        # non-assistant / empty events produce nothing to tee
        self.assertIsNone(cc._progress_line({"type": "system", "subtype": "init"}))
        self.assertIsNone(cc._progress_line({"type": "result"}))
        # #170: partial-message chunks reset the idle timer but must NOT flood the log
        self.assertIsNone(cc._progress_line({"type": "stream_event",
                                             "event": {"type": "content_block_delta"}}))

    def test_extract_result_line_picks_result_event(self):
        lines = [
            json.dumps({"type": "system", "subtype": "init"}),
            json.dumps({"type": "assistant", "message": {"content": []}}),
            json.dumps({"type": "result", "result": "done", "is_error": False,
                        "usage": {"input_tokens": 1, "output_tokens": 2}}),
        ]
        res = cc._extract_result_line(lines)
        text, _, _ = cc._parse_result(res)   # the result event feeds _parse_result unchanged
        self.assertEqual(text, "done")

    def test_extract_result_line_missing_raises(self):
        # a stream that ends without a result event = the CLI died mid-run
        with self.assertRaises(RuntimeError):
            cc._extract_result_line([json.dumps({"type": "assistant"})])

    def test_idle_timeout_parsing(self):
        saved = os.environ.get("COMPASS_CLAUDE_CLI_IDLE_TIMEOUT")
        try:
            os.environ.pop("COMPASS_CLAUDE_CLI_IDLE_TIMEOUT", None)
            self.assertEqual(cc._cli_idle_timeout(), cc._DEFAULT_CLI_IDLE)
            os.environ["COMPASS_CLAUDE_CLI_IDLE_TIMEOUT"] = "60"
            self.assertEqual(cc._cli_idle_timeout(), 60)
            os.environ["COMPASS_CLAUDE_CLI_IDLE_TIMEOUT"] = "0"
            self.assertIsNone(cc._cli_idle_timeout())   # 0 disables the idle guard
            os.environ["COMPASS_CLAUDE_CLI_IDLE_TIMEOUT"] = "junk"
            self.assertEqual(cc._cli_idle_timeout(), cc._DEFAULT_CLI_IDLE)
        finally:
            if saved is None:
                os.environ.pop("COMPASS_CLAUDE_CLI_IDLE_TIMEOUT", None)
            else:
                os.environ["COMPASS_CLAUDE_CLI_IDLE_TIMEOUT"] = saved


class TestDispatch(unittest.TestCase):
    def test_returns_text_and_emits_flatcost_note_no_usage(self):
        events = []
        out = cc.dispatch("/x/agent.md", "t", "do the thing",
                          runner=lambda argv, input, cwd=None: _Proc(stdout=_ok_json("done")),
                          on_event=events.append)
        self.assertEqual(out, "done")
        types = [e["type"] for e in events]
        self.assertIn(ev.NOTE, types)
        self.assertNotIn(ev.USAGE, types)  # flat-cost: budget cap can't see it
        note = next(e for e in events if e["type"] == ev.NOTE)
        self.assertIn("subscription", note["text"])

    def test_passes_user_message_on_stdin(self):
        seen = {}

        def runner(argv, input, cwd=None):
            seen["input"] = input
            return _Proc(stdout=_ok_json())
        cc.dispatch("/x/agent.md", "t", "MESSAGE-BODY", runner=runner,
                    on_event=lambda e: None)
        self.assertEqual(seen["input"], "MESSAGE-BODY")

    def test_cli_timeout_parsing(self):
        # #131: default, explicit, disable (0), and garbage → default
        saved = os.environ.get("COMPASS_CLAUDE_CLI_TIMEOUT")
        try:
            os.environ.pop("COMPASS_CLAUDE_CLI_TIMEOUT", None)
            self.assertEqual(cc._cli_timeout(), cc._DEFAULT_CLI_TIMEOUT)
            os.environ["COMPASS_CLAUDE_CLI_TIMEOUT"] = "120"
            self.assertEqual(cc._cli_timeout(), 120)
            os.environ["COMPASS_CLAUDE_CLI_TIMEOUT"] = "0"
            self.assertIsNone(cc._cli_timeout())       # 0 disables the cap
            os.environ["COMPASS_CLAUDE_CLI_TIMEOUT"] = "junk"
            self.assertEqual(cc._cli_timeout(), cc._DEFAULT_CLI_TIMEOUT)
        finally:
            if saved is None:
                os.environ.pop("COMPASS_CLAUDE_CLI_TIMEOUT", None)
            else:
                os.environ["COMPASS_CLAUDE_CLI_TIMEOUT"] = saved

    def test_timeout_fails_loud(self):
        # a hung CLI (runner raises, simulating the timeout kill) must surface as
        # a clean RuntimeError, not block — [fail-loud-not-silent].
        def hung(argv, input, cwd=None):
            raise RuntimeError("claude CLI exceeded the 900s timeout and was killed")
        with self.assertRaises(RuntimeError):
            cc.dispatch("/x/agent.md", "t", "x", runner=hung, on_event=lambda e: None)

    def test_nonzero_exit_raises_clean(self):
        with self.assertRaises(RuntimeError):
            cc.dispatch("/x/agent.md", "t", "x",
                        runner=lambda argv, input, cwd=None: _Proc(stderr="not logged in",
                                                         returncode=1),
                        on_event=lambda e: None)

    def test_execute_directive_on_tool_steps_only(self):
        # #139: tool-capable dispatch (project_dir) appends the execute directive;
        # a no-tools single-shot does not.
        seen = {}

        def runner(argv, input, cwd=None):
            seen.setdefault("inputs", []).append(input)
            return _Proc(stdout=_ok_json())
        cc.dispatch_with_tools("/x/agent.md", "t", "MSG", "/proj",
                               allow_write=True, runner=runner, on_event=lambda e: None)
        cc.dispatch("/x/agent.md", "t", "MSG", runner=runner, on_event=lambda e: None)
        tool_input, plain_input = seen["inputs"]
        self.assertIn("Orchestrator execution mode", tool_input)
        self.assertIn("REFUSE:", tool_input)          # routes a genuine block to the sentinel
        # #153: the directive must carve out gate discipline — 'finish now' can't mean
        # 'self-approve'. (The mechanical guard in run.py is the backstop; this is the prompt.)
        self.assertIn("NEVER self-approve", tool_input)
        self.assertNotIn("Orchestrator execution mode", plain_input)

    def test_subscription_env_strips_api_key(self):
        # The flat-cost guarantee: the CLI must NOT see ANTHROPIC_API_KEY, or it
        # bills the metered API (and inherits its usage cap) instead of the sub.
        saved = {k: os.environ.get(k) for k in
                 ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL")}
        try:
            os.environ["ANTHROPIC_API_KEY"] = "sk-capped"
            os.environ["ANTHROPIC_AUTH_TOKEN"] = "tok"
            os.environ["ANTHROPIC_BASE_URL"] = "http://x"
            env = cc._subscription_env()
            self.assertNotIn("ANTHROPIC_API_KEY", env)
            self.assertNotIn("ANTHROPIC_AUTH_TOKEN", env)
            self.assertNotIn("ANTHROPIC_BASE_URL", env)
            self.assertIn("PATH", env)  # the rest of the env is preserved
        finally:
            for k, v in saved.items():
                if v is None:
                    os.environ.pop(k, None)
                else:
                    os.environ[k] = v

    def test_with_tools_grants_project_dir(self):
        seen = {}

        def runner(argv, input, cwd=None):
            seen["argv"] = argv
            seen["cwd"] = cwd
            return _Proc(stdout=_ok_json())
        cc.dispatch_with_tools("/x/agent.md", "t", "x", "/proj",
                               allow_write=True, runner=runner,
                               on_event=lambda e: None)
        self.assertIn("--add-dir", seen["argv"])
        self.assertEqual(seen["argv"][seen["argv"].index("--permission-mode") + 1],
                         "bypassPermissions")
        self.assertEqual(seen["cwd"], "/proj")   # #132: runs IN the target repo

    def test_note_wording_unambiguous(self):
        # #132: the NOTE must read as $0 to the user, not a charge
        events = []
        cc.dispatch("/x/agent.md", "t", "x",
                    runner=lambda argv, input, cwd=None: _Proc(stdout=_ok_json(cost=0.67)),
                    on_event=events.append)
        note = next(e for e in events if e["type"] == ev.NOTE)["text"]
        self.assertIn("$0 to you", note)
        self.assertIn("if billed via API", note)


class TestRouterIntegration(unittest.TestCase):
    def test_has_key_reflects_binary(self):
        saved = router.shutil.which
        try:
            router.shutil.which = lambda name: "/usr/bin/claude" if name == "claude" else None
            self.assertTrue(router._has_key("claude-code"))
            router.shutil.which = lambda name: None
            self.assertFalse(router._has_key("claude-code"))
        finally:
            router.shutil.which = saved

    def test_adapter_importable_no_sdk(self):
        self.assertTrue(router._adapter_importable("claude-code"))

    def test_family_is_claude(self):
        self.assertEqual(router._family("claude-code"), "claude")
        self.assertEqual(router.deep_model("claude-code"), router.DEEP_MODELS["claude"])

    def test_claude_code_always_tool_capable(self):
        # #141: with project_dir, claude-code uses dispatch_with_tools even when
        # the agent declared no executor_tools (tools=None) — CC always has tools.
        from compass.orchestrator.hosts import claude_code
        saved = claude_code.dispatch_with_tools
        seen = {}
        try:
            def fake(*a, **k):
                seen["called"] = True
                seen["project_dir"] = a[3] if len(a) > 3 else k.get("project_dir")
                return "REVIEWED"
            claude_code.dispatch_with_tools = fake
            out = router.dispatch_to_host("claude-code", "/x/agent.md", "t", "msg",
                                          tools=None, project_dir="/proj", allow_write=True)
            self.assertEqual(out, "REVIEWED")
            self.assertTrue(seen.get("called"))
            self.assertEqual(seen.get("project_dir"), "/proj")
        finally:
            claude_code.dispatch_with_tools = saved

    def test_dispatch_routes_to_cli_module(self):
        from compass.orchestrator.hosts import claude_code
        saved = claude_code.dispatch
        try:
            claude_code.dispatch = lambda *a, **k: "ROUTED"
            out = router.dispatch_to_host("claude-code", "/x/agent.md", "t", "msg")
            self.assertEqual(out, "ROUTED")
        finally:
            claude_code.dispatch = saved


class TestRemap(unittest.TestCase):
    def test_claude_remapped_to_cli(self):
        self.assertEqual(runmod._remap_claude_cli(["claude"]), ["claude-code"])

    def test_reviewers_untouched(self):
        # cross-model review independence: codex/gemini must NOT become claude-code
        self.assertEqual(runmod._remap_claude_cli(["codex", "gemini"]),
                         ["codex", "gemini"])

    def test_mixed_only_claude_changes(self):
        self.assertEqual(runmod._remap_claude_cli(["claude", "gemini"]),
                         ["claude-code", "gemini"])


if __name__ == "__main__":
    unittest.main()

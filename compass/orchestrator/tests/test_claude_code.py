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
        self.assertEqual(argv[argv.index("--output-format") + 1], "json")
        self.assertEqual(argv[argv.index("--append-system-prompt-file") + 1], "/x/agent.md")
        self.assertEqual(argv[argv.index("--model") + 1], "sonnet")
        self.assertNotIn("--add-dir", argv)
        self.assertNotIn("--permission-mode", argv)

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


class TestDispatch(unittest.TestCase):
    def test_returns_text_and_emits_flatcost_note_no_usage(self):
        events = []
        out = cc.dispatch("/x/agent.md", "t", "do the thing",
                          runner=lambda argv, input: _Proc(stdout=_ok_json("done")),
                          on_event=events.append)
        self.assertEqual(out, "done")
        types = [e["type"] for e in events]
        self.assertIn(ev.NOTE, types)
        self.assertNotIn(ev.USAGE, types)  # flat-cost: budget cap can't see it
        note = next(e for e in events if e["type"] == ev.NOTE)
        self.assertIn("subscription", note["text"])

    def test_passes_user_message_on_stdin(self):
        seen = {}

        def runner(argv, input):
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
        def hung(argv, input):
            raise RuntimeError("claude CLI exceeded the 900s timeout and was killed")
        with self.assertRaises(RuntimeError):
            cc.dispatch("/x/agent.md", "t", "x", runner=hung, on_event=lambda e: None)

    def test_nonzero_exit_raises_clean(self):
        with self.assertRaises(RuntimeError):
            cc.dispatch("/x/agent.md", "t", "x",
                        runner=lambda argv, input: _Proc(stderr="not logged in",
                                                         returncode=1),
                        on_event=lambda e: None)

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

        def runner(argv, input):
            seen["argv"] = argv
            return _Proc(stdout=_ok_json())
        cc.dispatch_with_tools("/x/agent.md", "t", "x", "/proj",
                               allow_write=True, runner=runner,
                               on_event=lambda e: None)
        self.assertIn("--add-dir", seen["argv"])
        self.assertEqual(seen["argv"][seen["argv"].index("--permission-mode") + 1],
                         "bypassPermissions")


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

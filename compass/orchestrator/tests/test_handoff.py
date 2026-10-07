import io
import json
import unittest
from unittest import mock

from compass.orchestrator import handoff as h

REFUSED_REQUEST = {
    "version": 1, "framework": "nextjs-ts",
    "repo": {"key": "app", "local_path": "/definitely/not/there"},
    "subject_ref": "app", "options": "",
    "caller": {"kind": "ts", "handoff_call_id": "h-test-1"},
}


def run(argv, stdin_text):
    out = io.StringIO()
    code = h.main(argv, stdin=io.StringIO(stdin_text), stdout=out)
    return code, json.loads(out.getvalue())


class Verbs(unittest.TestCase):
    def test_generate_is_registered(self):
        self.assertIn("generate", h.VERBS)

    def test_unknown_verb_is_refused_with_its_code(self):
        code, out = run(["build_it"], "{}")
        self.assertEqual(code, 1)
        self.assertFalse(out["ok"])
        self.assertEqual(out["error"]["code"], "unknown_verb")

    def test_missing_verb_is_refused_not_run(self):
        code, out = run([], "{}")
        self.assertEqual(out["error"]["code"], "unknown_verb")

    def test_run_call_is_not_reachable_yet(self):
        code, out = run(["run_call"], "{}")
        self.assertEqual(out["error"]["code"], "unknown_verb")


class Envelope(unittest.TestCase):
    def test_generate_returns_the_contract_result_inside_the_envelope(self):
        code, out = run(["generate"], json.dumps(REFUSED_REQUEST))
        self.assertEqual(out["verb"], "generate")
        self.assertEqual(out["version"], 1)
        self.assertTrue(out["ok"])
        self.assertEqual(out["result"]["status"], "refused")
        self.assertIsNone(out["result"]["usage"])
        self.assertEqual(code, 0)

    def test_a_request_the_contract_refuses_is_invalid_input_not_a_traceback(self):
        bad = dict(REFUSED_REQUEST, framework="rails")
        code, out = run(["generate"], json.dumps(bad))
        self.assertEqual(code, 1)
        self.assertEqual(out["error"]["code"], "invalid_input")
        self.assertIn("not a supported framework", out["error"]["message"])

    def test_stdin_that_is_not_json_is_invalid_input(self):
        code, out = run(["generate"], "{not json")
        self.assertEqual(out["error"]["code"], "invalid_input")
        self.assertIn("not JSON", out["error"]["message"])

    def test_stdin_that_is_not_an_object_is_invalid_input(self):
        code, out = run(["generate"], "[1, 2]")
        self.assertEqual(out["error"]["code"], "invalid_input")

    def test_empty_stdin_is_invalid_input_not_a_crash(self):
        code, out = run(["generate"], "")
        self.assertEqual(out["error"]["code"], "invalid_input")

    def test_an_unexpected_exception_is_internal_and_names_its_type(self):
        with mock.patch.dict(h.VERBS, {"generate": mock.Mock(side_effect=RuntimeError("boom"))}):
            code, out = run(["generate"], json.dumps(REFUSED_REQUEST))
        self.assertEqual(code, 1)
        self.assertEqual(out["error"]["code"], "internal")
        self.assertIn("RuntimeError: boom", out["error"]["message"])


if __name__ == "__main__":
    unittest.main()

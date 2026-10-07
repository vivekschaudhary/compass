import copy
import json
import unittest
from pathlib import Path

from compass.orchestrator import generate_contract as g

FIXTURES = Path(__file__).parent / "fixtures"


def _load(name):
    return json.loads((FIXTURES / name).read_text())


class RequestTests(unittest.TestCase):
    def test_fixture_parses(self):
        r = g.parse_request(_load("generate_request.json"))
        self.assertEqual(r.framework, "nextjs-ts")
        self.assertEqual(r.repo.key, "app")
        self.assertEqual(r.caller.kind, "ts")
        self.assertIsNone(r.checks)

    def test_unknown_framework_refused(self):
        d = _load("generate_request.json")
        d["framework"] = "rails"
        with self.assertRaisesRegex(g.ContractError, "not a supported framework"):
            g.parse_request(d)

    def test_wrong_version_refused(self):
        d = _load("generate_request.json")
        d["version"] = 2
        with self.assertRaisesRegex(g.ContractError, "version"):
            g.parse_request(d)

    def test_missing_repo_path_refused(self):
        d = _load("generate_request.json")
        d["repo"]["local_path"] = "  "
        with self.assertRaisesRegex(g.ContractError, "local_path"):
            g.parse_request(d)

    def test_unknown_caller_kind_refused(self):
        d = _load("generate_request.json")
        d["caller"]["kind"] = "agent"
        with self.assertRaisesRegex(g.ContractError, "caller.kind"):
            g.parse_request(d)

    def test_options_absent_is_empty_but_wrong_type_refused(self):
        d = _load("generate_request.json")
        del d["options"]
        self.assertEqual(g.parse_request(d).options, "")
        d["options"] = 42
        with self.assertRaisesRegex(g.ContractError, "options must be a string"):
            g.parse_request(d)

    def test_empty_checks_list_refused_not_defaulted(self):
        d = _load("generate_request.json")
        d["checks"] = []
        with self.assertRaisesRegex(g.ContractError, "empty"):
            g.parse_request(d)

    def test_explicit_checks_kept(self):
        d = _load("generate_request.json")
        d["checks"] = ["pnpm test"]
        self.assertEqual(g.parse_request(d).checks, ("pnpm test",))


class ResultTests(unittest.TestCase):
    def _result(self, **over):
        base = g.GenerateResult(
            status="shipped", branch="b", pr_url="https://github.com/o/r/pull/7", files_changed=1,
            checks=g.Checks(ran=("pnpm build",), failed=None, tail=None),
            refusal=None, log_ref="l",
        )
        return base if not over else g.GenerateResult(**{**base.__dict__, **over})

    def test_shipped_fixture_matches_wire_shape(self):
        out = g.result_to_dict(self._result())
        fixture = _load("generate_result_shipped.json")
        self.assertEqual(out, fixture)

    def test_shipped_without_pr_refused(self):
        with self.assertRaisesRegex(g.ContractError, "requires a pr_url"):
            g.result_to_dict(self._result(pr_url=None))

    def test_refused_without_reason_refused(self):
        with self.assertRaisesRegex(g.ContractError, "requires a refusal"):
            g.result_to_dict(self._result(status="refused", pr_url=None, refusal=None))

    def test_unknown_status_refused(self):
        with self.assertRaisesRegex(g.ContractError, "not one of"):
            g.result_to_dict(self._result(status="done"))

    def test_usage_is_always_null(self):
        self.assertIsNone(g.result_to_dict(self._result())["usage"])


if __name__ == "__main__":
    unittest.main()

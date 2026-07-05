"""#80: on-demand cancel — immediately halt an in-flight run (RUN_END 'cancelled by
operator'), targeted or all-for-a-project, regardless of staleness."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[4]))

from compass.orchestrator import events as ev


def _run(run_id, project="home", ended=False):
    evs = [ev.make_event(ev.RUN_START, run_id=run_id, project=project, workflow="fix")]
    if ended:
        evs.append(ev.make_event(ev.RUN_END, run_id=run_id, status="completed"))
    return evs


class TestCancelInflight(unittest.TestCase):
    def _cancel(self, events, **kw):
        out = []
        cancelled = ev.cancel_inflight(sink=lambda e: out.append(e), events=events, **kw)
        return cancelled, out

    def test_targeted_cancels_only_that_run(self):
        events = _run("r1") + _run("r2")
        cancelled, out = self._cancel(events, run_id="r1")
        self.assertEqual(cancelled, ["r1"])
        self.assertEqual(out[0]["status"], "halted")
        self.assertEqual(out[0]["reason"], "cancelled by operator")

    def test_all_for_project_scope(self):
        events = _run("r1", "home") + _run("r2", "home") + _run("r3", "crypto")
        cancelled, _ = self._cancel(events, project="home")
        self.assertEqual(set(cancelled), {"r1", "r2"})   # crypto untouched

    def test_skips_already_ended(self):
        events = _run("r1", ended=True) + _run("r2")
        cancelled, _ = self._cancel(events)
        self.assertEqual(cancelled, ["r2"])              # idempotent — r1 already done

    def test_targeted_not_inflight_is_noop(self):
        events = _run("r1", ended=True)
        cancelled, out = self._cancel(events, run_id="r1")
        self.assertEqual((cancelled, out), ([], []))


if __name__ == "__main__":
    unittest.main()

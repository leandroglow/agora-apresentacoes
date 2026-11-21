import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1].parent))
from rh_gateway.attendance import apply_attendance


def empty_ledger():
    return {"revision": 0, "ocorrencias": [], "compensacoes": [],
            "adiantamentos": [], "pagamentos": [], "historico_registros": []}


def forecast():
    return {"groups": [{"people": [
        {"id": "fake-1", "name": "José"},
        {"id": "fake-2", "name": "Ana"},
    ]}]}


def payload(**changes):
    value = {"event": "telegram:100", "date": "2026-11-21",
             "shift": "manha", "people": ["José"], "project": "019",
             "activity": "teste"}
    value.update(changes)
    return value


class AttendancePublicationTests(unittest.TestCase):
    def test_registers_history_and_replays_batch(self):
        first, receipt = apply_attendance(
            empty_ledger(), forecast(), payload(people=["José", "Ana"]))
        self.assertEqual(receipt, {"status": "recorded", "count": 2})
        self.assertEqual(len(first["ocorrencias"]), 2)
        self.assertEqual(len(first["historico_registros"]), 2)
        replay, replay_receipt = apply_attendance(
            first, forecast(), payload(people=["José", "Ana"]))
        self.assertEqual(replay_receipt, {"status": "existing", "count": 2})
        self.assertEqual(replay, first)

    def test_partial_overlap_is_actionable_error(self):
        first, _ = apply_attendance(empty_ledger(), forecast(), payload())
        with self.assertRaisesRegex(ValueError, "reenvie somente os faltantes"):
            apply_attendance(first, forecast(), payload(
                event="telegram:101", people=["José", "Ana"]))

    def test_replay_mismatch_is_rejected(self):
        first, _ = apply_attendance(empty_ledger(), forecast(), payload())
        with self.assertRaises(ValueError):
            apply_attendance(first, forecast(), payload(activity="outro"))


if __name__ == "__main__":
    unittest.main()

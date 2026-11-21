"""Testes do gateway contra o backend RH real e Drive falso somente para I/O."""
import copy
import time
import unittest
from datetime import date

from rh_gateway.attendance import apply_attendance
from rh_gateway.gateway import Failure, dispatch, verify

MASTER_FORECAST = {"groups": [{"id": "g1", "anchor": "2026-11-20", "people": [{"id": "p1", "name": "Pessoa Teste"}]}]}

def request(event="telegram:123", day="2026-11-20", shift="manha", people=None, project="017", activity="Vistoria"):
    return {"event": event, "date": day, "shift": shift, "people": people or ["Pessoa Teste"], "project": project, "activity": activity}

class FakeDrive:
    def __init__(self, *, race=False):
        self.forecast = copy.deepcopy(MASTER_FORECAST)
        self.ledger = {"revision": 7, "ocorrencias": [], "compensacoes": [], "adiantamentos": [], "pagamentos": [], "historico_registros": []}
        self.etag, self.writes, self.reads, self.race = "etag-7", [], 0, race
    def sources(self): return self.forecast, "ledger-file-123"
    def read(self, file_id):
        self.reads += 1; result = copy.deepcopy(self.ledger)
        if self.race and self.reads == 2:
            result["revision"] += 1
            result["ocorrencias"].append({"id":"attendance:external","personId":"p1","date":"2026-11-20","type":"attendance","days":.5,"shift":"manha","status":"reported","source":"telegram:999","projectId":"017","activity":"Outra vistoria"})
        return result, self.etag
    def write(self, file_id, ledger, etag):
        self.writes.append((file_id, copy.deepcopy(ledger), etag)); self.ledger = copy.deepcopy(ledger); self.etag = "etag-8"

class GatewayTests(unittest.TestCase):
    def test_check_and_record_use_real_backend_and_master_projection(self):
        drive = FakeDrive()
        self.assertEqual(dispatch({"check":"attendance"}, drive), {"ok":True,"status":"ready"})
        self.assertEqual(dispatch(request(), drive), {"ok":True,"status":"recorded","count":1})
        self.assertEqual(drive.ledger["ocorrencias"][0]["personId"], "p1")
        self.assertEqual(drive.ledger["ocorrencias"][0]["shift"], "manha")

    def test_fixture_date_is_inside_panel_competence_window(self):
        start, end = date.fromisoformat("2026-11-14"), date.fromisoformat("2026-11-27")
        self.assertTrue(start <= date.fromisoformat(request()["date"]) <= end)

    def test_auth_rejects_expired_and_malformed_signatures(self):
        for timestamp, signature in [(str(int(time.time())-121), ""), (str(int(time.time())), "not-base64")]:
            with self.subTest(timestamp=timestamp):
                with self.assertRaises(Failure) as error: verify(b"{}", timestamp, signature)
                self.assertEqual(error.exception.status, 401)

    def test_idempotency_receipt_does_not_write_twice(self):
        drive = FakeDrive(); first, second = dispatch(request(), drive), dispatch(request(), drive)
        self.assertEqual(first, {"ok":True,"status":"recorded","count":1})
        self.assertEqual(second, {"ok":True,"status":"existing","count":1})
        self.assertEqual(len(drive.writes), 1)

    def test_race_fails_receipt_confirmation(self):
        with self.assertRaises(Failure) as error: dispatch(request(), FakeDrive(race=True))
        self.assertEqual(error.exception.status, 503); self.assertIn("confirmação", error.exception.reason)

    def test_persistence_is_verified_by_fake_drive_readback(self):
        drive = FakeDrive(); dispatch(request(), drive)
        self.assertEqual(drive.reads, 2); self.assertEqual(drive.ledger["revision"], 8)
        self.assertEqual(drive.writes[0][0], "ledger-file-123"); self.assertEqual(drive.writes[0][2], "etag-7")

    def test_real_backend_rejects_unknown_person_and_bad_shift(self):
        with self.assertRaises(Failure) as error: dispatch(request(people=["Pessoa ausente"]), FakeDrive())
        self.assertEqual(error.exception.status, 422)
        with self.assertRaises(Failure) as error: dispatch(request(shift="noite"), FakeDrive())
        self.assertEqual(error.exception.status, 422)

if __name__ == "__main__": unittest.main()

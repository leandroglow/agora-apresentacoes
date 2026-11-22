import json
import unittest
from rh_gateway.fontes import FontesDrive, SourceError, anotar, editar, ler
from rh_gateway.fontes_nativas import DOC, SHEET


class GoogleFake:
    def __init__(self):
        self.text = "Cabeçalho 😀\nLinha antiga\nFim\n"
        self.rev = 7
        self.writes = 0

    def request(self, url, method="GET", data=None, headers=None):
        if "/drive/v2/files/" in url:
            kind = SHEET if "sheet_native" in url else DOC
            return json.dumps({"etag": str(self.rev), "version": self.rev, "mimeType": kind, "editable": kind == DOC}).encode()
        if url.endswith("/export?mimeType=text/csv"):
            return b"item,quantidade\ncimento,10\n"
        if "docs.googleapis.com/v1/documents/" in url and method == "GET":
            return json.dumps({"revisionId": "d" + str(self.rev), "body": {"content": [
                {"paragraph": {"elements": [{"textRun": {"content": self.text}}]}}]}}).encode()
        if url.endswith(":batchUpdate") and method == "POST":
            body = json.loads(data)
            if body["writeControl"]["requiredRevisionId"] != "d" + str(self.rev):
                raise AssertionError("expected Docs revision")
            for req in body["requests"]:
                raw = self.text.encode("utf-16-le")
                if "deleteContentRange" in req:
                    region = req["deleteContentRange"]["range"]
                    first, last = (region[k] - 1 for k in ("startIndex", "endIndex"))
                    assert 0 <= first < last <= len(raw) // 2 - 1
                    raw = raw[:2 * first] + raw[2 * last:]
                else:
                    op = req["insertText"]
                    pos = len(raw) - 2 if "endOfSegmentLocation" in op else (op["location"]["index"] - 1) * 2
                    assert 0 <= pos <= len(raw) - 2
                    raw = raw[:pos] + op["text"].encode("utf-16-le") + raw[pos:]
                self.text = raw.decode("utf-16-le")
            self.rev += 1
            self.writes += 1
            return b"{}"
        raise AssertionError(url)


class FontesNativasTests(unittest.TestCase):
    def setUp(self):
        self.google = GoogleFake()
        self.drive = FontesDrive(token="synthetic", request_fn=self.google.request)
        self.sources = {"doc": {"id": "doc_native_123", "editavel": True},
                        "compras": {"id": "sheet_native_123", "editavel": False}}

    def test_editar_utf16_e_conferir_recibo(self):
        data = {"fonte": "doc", "anterior": "Linha antiga", "texto": "Nova linha", "evento": "telegram:97", "revisao": 7}
        self.assertEqual(editar(data, self.drive, self.sources)["status"], "gravado")
        self.assertTrue(self.google.text.startswith("Cabeçalho 😀\nNova linha\nFim\n<!-- AGORA-FONTES"))
        self.assertEqual(editar(data, self.drive, self.sources)["status"], "existente")
        self.assertEqual(self.google.writes, 1)

    def test_anotar_somente_na_revisao_lida(self):
        data = {"fonte": "doc", "texto": "Planejar entrega", "evento": "telegram:98", "revisao": 6}
        with self.assertRaises(SourceError) as e:
            anotar(data, self.drive, self.sources)
        self.assertEqual(e.exception.status, 409)
        self.assertEqual(self.google.writes, 0)
        data["revisao"] = 7
        self.assertEqual(anotar(data, self.drive, self.sources)["status"], "gravado")
        self.assertIn("\nFim\nPlanejar entrega\n<!-- AGORA-FONTES", self.google.text)
        self.assertTrue(self.google.text.endswith("-->\n"))

    def test_leitura_da_planilha_sem_escrita(self):
        result = ler({"fonte": "compras"}, self.drive, self.sources)
        self.assertEqual(result["texto"], "item,quantidade\ncimento,10\n")
        self.assertFalse(result["editavel"])
        with self.assertRaises(SourceError) as e:
            anotar({"fonte": "compras", "texto": "x", "evento": "telegram:99", "revisao": 7}, self.drive, self.sources)
        self.assertEqual(e.exception.status, 403)
        self.assertEqual(self.google.writes, 0)

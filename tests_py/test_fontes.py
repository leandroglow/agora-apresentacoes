import base64, json, os, time, unittest
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from rh_gateway.fontes import SourceError, anotar, editar, ler, listar, verify_fontes
from rh_gateway import fontes_handler

class FakeDrive:
    def __init__(self, text="linha\n" * 3000): self.raw=text.encode(); self.etag="e1"; self.revision=1; self.writes=0
    def snapshot(self, file_id): return self.raw, self.etag, self.revision
    def write(self, file_id, raw, etag):
        if etag != self.etag: raise SourceError(503, "controle mudou")
        self.raw=raw; self.revision += 1; self.etag="e"+str(self.revision); self.writes += 1

class FontesTests(unittest.TestCase):
    def setUp(self):
        self.key=rsa.generate_private_key(public_exponent=65537,key_size=2048)
        self.pem=self.key.public_key().public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo).decode()
        self.map={"status":{"id":"file_status_123","descricao":"Estado RH","editavel":True},"read":{"id":"file_read_123","descricao":"Somente leitura","editavel":False}}
        self.drive=FakeDrive()
    def test_signature_has_own_domain_prefix_and_timestamp_separate(self):
        body=b'{"op":"listar"}'; timestamp=str(int(time.time())); sig=self.key.sign(timestamp.encode()+b"\nfontes-v1\n"+body,padding.PKCS1v15(),hashes.SHA256())
        verify_fontes(body,timestamp,base64.b64encode(sig),self.pem)
        with self.assertRaises(SourceError): verify_fontes(body,str(int(timestamp)+1),base64.b64encode(sig),self.pem)
    def test_closed_map_listing_and_pagination(self):
        self.assertEqual(listar(self.map)["fontes"][0]["nome"],"read")
        page=ler({"fonte":"status","inicio":0},self.drive,self.map)
        self.assertEqual(len(page["texto"]),12000); self.assertEqual(page["proximo"],12000); self.assertEqual(page["revisao"],1)
        with self.assertRaises(SourceError): ler({"fonte":"missing"},self.drive,self.map)
    def test_annotation_conditional_idempotent_even_with_different_retry_text(self):
        p={"fonte":"status","texto":"primeira nota","evento":"telegram:7","revisao":1}
        self.assertEqual(anotar(p,self.drive,self.map)["status"],"gravado"); self.assertEqual(self.drive.writes,1)
        retry={**p,"texto":"tentativa diferente","revisao":2}
        with self.assertRaises(SourceError): anotar(retry,self.drive,self.map)
        self.assertEqual(self.drive.writes,1)
        self.assertIn("primeira nota",self.drive.raw.decode())
    def test_read_only_and_stale_revision_fail_closed(self):
        with self.assertRaises(SourceError): anotar({"fonte":"read","texto":"x","evento":"telegram:1","revisao":1},self.drive,self.map)
        with self.assertRaises(SourceError): anotar({"fonte":"status","texto":"x","evento":"telegram:2","revisao":99},self.drive,self.map)
    def test_edit_exactly_once_protected_receipt_and_idempotency(self):
        self.drive.raw = b"Antes\nTrecho exato\nDepois\n"
        p={"fonte":"status","anterior":"Trecho exato","texto":"Trecho substituto","evento":"telegram:10","revisao":1}
        self.assertEqual(editar(p,self.drive,self.map)["status"],"gravado")
        self.assertIn("Trecho substituto",self.drive.raw.decode()); self.assertNotIn("Trecho exato\nDepois",self.drive.raw.decode())
        retry={**p,"texto":"Outra tentativa","revisao":2}
        with self.assertRaises(SourceError): editar(retry,self.drive,self.map)
        self.assertEqual(self.drive.writes,1)
    def test_edit_requires_unique_unprotected_text_and_cannot_touch_receipt(self):
        self.drive.raw = b"x\nrepetido\nrepetido\n"
        with self.assertRaises(SourceError): editar({"fonte":"status","anterior":"repetido","texto":"novo","evento":"telegram:11","revisao":1},self.drive,self.map)
        with self.assertRaises(SourceError): editar({"fonte":"status","anterior":"<!-- AGORA-FONTES","texto":"novo","evento":"telegram:12","revisao":1},self.drive,self.map)
    def test_handler_module_is_the_single_secondary_route(self):
        self.assertTrue(callable(fontes_handler.handle_post))
        source = open("api/presenca.py", encoding="utf-8").read()
        vercel = open("vercel.json", encoding="utf-8").read()
        self.assertIn("fontes-coordenador", source)
        self.assertIn('"destination": "/api/presenca?_route=fontes-coordenador"', vercel)

if __name__ == "__main__": unittest.main(verbosity=2)

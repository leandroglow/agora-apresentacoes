import base64
import binascii
import hashlib
import json
import os
import re
import time
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding

from .attendance import apply_attendance
from .registro_rh import normalize

PUBLIC_KEY = b"""-----BEGIN PUBLIC KEY-----
MIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEAql2GhDwV1EiGdBJ+wMeN
WUCoAzjuclRDEoPCsobHQGyGfaE5zTIJFJ9HLw4GOiESxGSbQEoqi4aMV2VAnaK5
Czz63dvOPQfQYHAwWY2YffA5u2LjV67fFE2sMMI0hNOwcrcGy/l7ccmdlKfHyl6R
Ao4L2hD43c223pS0iXoIuAmoiAw1wdseyyI2MJ6EFmwj85y26HHXnPZaXXmrLRz3
qS8cDXl8pDonleagw437EutZrFXcmWeNLSLBzbBFWFaU6V4rY/LHjE8L9yrLWEFJ
kVHkChLmYezSRTP90nslMvN1UyymPus3mefW0mcUTS2swbVobD5jDvxb0MtPQoRI
1ZVh+GR7NRZ2WxMXSJAZjXvND+WhRicnqPhV+qAoC+ZHRZTHrQGBRNNMXERQHm5K
sLWKA0SOxCliFJBtFfxUqkwZrdcQjcXH0zPt8eIOCF+J1DbNm4HfHBMA5Tr1C28W
7KF37w4ZNqATiEFkoP/173vOd1UiZn/ie9RoKerazES5AgMBAAE=
-----END PUBLIC KEY-----"""


class Failure(Exception):
    def __init__(self, status, reason):
        self.status, self.reason = status, reason
        super().__init__(reason)


def verify(body, timestamp, signature, key=PUBLIC_KEY):
    if not re.fullmatch(r"[0-9]{10}", timestamp) or abs(time.time() - int(timestamp)) > 120:
        raise Failure(401, "Assinatura inválida ou expirada.")
    try:
        sig = base64.b64decode(signature, validate=True)
        serialization.load_pem_public_key(key).verify(
            sig, timestamp.encode("ascii") + b"\n" + body, padding.PKCS1v15(), hashes.SHA256()
        )
    except (InvalidSignature, ValueError, binascii.Error):
        raise Failure(401, "Assinatura inválida ou expirada.") from None


def request(url, *, method="GET", headers=None, data=None):
    try:
        with urlopen(Request(url, data=data, headers=headers or {}, method=method), timeout=15) as res:
            raw = res.read(8_000_001)
            if len(raw) > 8_000_000:
                raise Failure(503, "Fonte de RH excedeu o tamanho previsto.")
            return raw
    except HTTPError as exc:
        if exc.code == 412:
            raise Failure(503, "O controle mudou durante a gravação. Tente novamente.") from None
        print("Serviço do Drive indisponível; resposta HTTP", exc.code, flush=True)
        raise Failure(503, "Acesso à fonte do RH indisponível.") from None


def drive_token():
    fixed = os.environ.get("GOOGLE_DRIVE_OAUTH_ACCESS_TOKEN")
    if fixed:
        return fixed
    body = urlencode({"grant_type":"refresh_token","refresh_token":os.environ["GOOGLE_OAUTH_REFRESH_TOKEN"],
                      "client_id":os.environ["GOOGLE_OAUTH_CLIENT_ID"],
                      "client_secret":os.environ["GOOGLE_OAUTH_CLIENT_SECRET"]}).encode()
    data = request("https://oauth2.googleapis.com/token", method="POST", data=body,
                   headers={"Content-Type":"application/x-www-form-urlencoded"})
    return json.loads(data)["access_token"]


class Drive:
    def __init__(self):
        self.headers = {"Authorization":"Bearer " + drive_token()}

    @staticmethod
    def valid_id(file_id):
        if not isinstance(file_id, str) or not re.fullmatch(r"[A-Za-z0-9_-]{10,160}", file_id):
            raise Failure(503, "Referência do painel de RH indisponível.")
        return file_id

    def media(self, file_id):
        return request("https://www.googleapis.com/drive/v3/files/" + self.valid_id(file_id) +
                       "?alt=media&supportsAllDrives=true", headers=self.headers)

    def sources(self):
        dashboard = json.loads(self.media(os.environ["DASHBOARD_DATA_FILE_ID"]))
        forecast = json.loads(self.media(dashboard["rhForecast"]["rhForecastFileId"]))
        return forecast, self.valid_id(forecast["adjustmentsFileId"])

    def read(self, file_id):
        meta = json.loads(request("https://www.googleapis.com/drive/v2/files/" + self.valid_id(file_id) +
                                  "?fields=id,etag,md5Checksum,editable,labels(trashed)&supportsAllDrives=true", headers=self.headers))
        etag = meta.get("etag")
        if not etag or not meta.get("editable") or meta.get("labels",{}).get("trashed"):
            raise Failure(503, "Fonte de RH não disponível para atualização por revisão.")
        raw = self.media(file_id)
        if hashlib.md5(raw, usedforsecurity=False).hexdigest() != meta.get("md5Checksum"):
            raise Failure(503, "A revisão do controle mudou durante a leitura.")
        return json.loads(raw), etag

    def write(self, file_id, ledger, etag):
        raw = (json.dumps(ledger, ensure_ascii=False, indent=2, allow_nan=False) + "\n").encode()
        request("https://www.googleapis.com/upload/drive/v2/files/" + self.valid_id(file_id) +
                "?uploadType=media&newRevision=true&supportsAllDrives=true&fields=id", method="PUT", data=raw,
                headers={**self.headers, "Content-Type":"application/json", "If-Match":etag})


def dispatch(payload, drive):
    forecast, file_id = drive.sources()
    ledger, etag = drive.read(file_id)
    if not isinstance(ledger.get("ocorrencias"),list) or not isinstance(ledger.get("revision"),int):
        raise Failure(503, "Formato do registro único de RH incompatível.")
    if not any(g.get("people") for g in forecast.get("groups", [])):
        raise Failure(503, "Cadastro de pessoas indisponível.")
    if payload == {"check":"attendance"}:
        try:
            normalize(ledger)
        except ValueError:
            raise Failure(503, "O histórico do RH precisa de conferência.") from None
        return {"ok":True,"status":"ready"}
    try:
        updated, receipt = apply_attendance(ledger, forecast, payload)
    except ValueError as exc:
        raise Failure(422, str(exc)[:240]) from None
    if updated != ledger:
        drive.write(file_id, updated, etag)
        current, _ = drive.read(file_id)
        try:
            retry, replay_receipt = apply_attendance(current, forecast, payload)
        except ValueError:
            raise Failure(503, "Aguardando confirmação da gravação no Drive.") from None
        if current != retry or replay_receipt != {"status":"existing","count":receipt["count"]}:
            raise Failure(503, "Aguardando confirmação da gravação no Drive.")
    return {"ok":True,"status":receipt["status"],"count":receipt["count"]}

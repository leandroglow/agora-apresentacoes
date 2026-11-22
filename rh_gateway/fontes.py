"""Fontes privadas do coordenador, com mapa fechado e escrita condicional no Drive."""
from __future__ import annotations
import hashlib, json, os, re
from .gateway import Failure, drive_token, request, Drive, verify

MAX_BODY = 32768
MAX_SOURCE = 2_000_000
PAGE = 12000
MAX_NOTE = 1000
EVENT = re.compile(r"^telegram:[0-9]+$")
RECEIPT = re.compile(r"<!-- AGORA-FONTES-RECIBO tipo=(anotar|editar) evento=(telegram:[0-9]+) digest=([0-9a-f]{64}) -->")

class SourceError(Failure): pass

def verify_fontes(body, timestamp, signature, key_pem=None, now=None):
    key_pem = key_pem or os.environ.get("AGORA_FONTES_PUBLIC_KEY")
    if not key_pem: raise SourceError(503, "Autorização das fontes não configurada.")
    try:
        verify(b"fontes-v1\n" + body, str(timestamp), signature, key=key_pem.encode() if isinstance(key_pem, str) else key_pem)
    except Failure as exc:
        raise SourceError(exc.status, exc.reason) from None

def source_map(raw=None):
    try: data = raw if isinstance(raw, dict) else json.loads(os.environ.get("AGORA_FONTES_JSON", "{}") if raw is None else raw)
    except (TypeError, ValueError): raise SourceError(503, "Mapa privado de fontes indisponível.") from None
    if not isinstance(data, dict) or not data or len(data) > 32: raise SourceError(503, "Mapa privado de fontes indisponível.")
    out = {}
    for alias, value in data.items():
        if not isinstance(alias, str) or not re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,63}", alias) or not isinstance(value, dict): raise SourceError(503, "Mapa privado de fontes inválido.")
        file_id, description, editable = value.get("id"), value.get("descricao", ""), value.get("editavel")
        if not isinstance(file_id, str) or not re.fullmatch(r"[A-Za-z0-9_-]{10,160}", file_id) or not isinstance(description, str) or len(description) > 500 or not isinstance(editable, bool): raise SourceError(503, "Mapa privado de fontes inválido.")
        out[alias] = {"id": file_id, "descricao": description, "editavel": editable}
    return out

class FontesDrive:
    def __init__(self, token=None, request_fn=request): self.token, self.request = token or drive_token(), request_fn
    def snapshot(self, file_id):
        fid = Drive.valid_id(file_id)
        headers = {"Authorization": "Bearer " + self.token}
        meta = json.loads(self.request("https://www.googleapis.com/drive/v2/files/" + fid + "?fields=id,etag,md5Checksum,version,editable,labels(trashed)&supportsAllDrives=true", headers=headers))
        if not meta.get("etag") or meta.get("labels", {}).get("trashed"): raise SourceError(403, "Fonte sem permissão de leitura.")
        raw = self.request("https://www.googleapis.com/drive/v3/files/" + fid + "?alt=media&supportsAllDrives=true", headers=headers)
        if len(raw) > MAX_SOURCE or hashlib.md5(raw, usedforsecurity=False).hexdigest() != meta.get("md5Checksum"): raise SourceError(503, "Fonte mudou durante a leitura.")
        return raw, meta.get("etag"), int(meta.get("version", 0))
    def write(self, file_id, raw, etag):
        fid = Drive.valid_id(file_id); headers = {"Authorization": "Bearer " + self.token, "Content-Type": "text/plain; charset=utf-8", "If-Match": etag}
        self.request("https://www.googleapis.com/upload/drive/v2/files/" + fid + "?uploadType=media&newRevision=true&supportsAllDrives=true&fields=id", method="PUT", data=raw, headers=headers)

def _text(raw):
    try: text = raw.decode("utf-8")
    except UnicodeDecodeError: raise SourceError(422, "Fonte textual inválida.") from None
    if len(raw) > MAX_SOURCE: raise SourceError(413, "Fonte excede o tamanho permitido.")
    return text

def _digest(kind, event, anterior, text):
    return hashlib.sha256(json.dumps({"tipo": kind, "evento": event, "anterior": anterior, "texto": text}, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()

def _receipt_status(text, event, digest):
    for match in RECEIPT.finditer(text):
        if match.group(2) == event:
            if match.group(1) == "anotar" and digest == match.group(3): return True
            if match.group(1) == "editar" and digest == match.group(3): return True
            raise SourceError(409, "Evento já utilizado com conteúdo diferente.")
    return False

def _protected_spans(text): return [m.span() for m in RECEIPT.finditer(text)]

def _append_receipt(text, marker):
    newline = "\r\n" if "\r\n" in text else "\n"
    return text + ("" if text.endswith(("\n", "\r")) else newline) + marker + newline

def listar(mapping=None): return {"fontes": [{"nome": a, "descricao": v["descricao"], "editavel": v["editavel"]} for a, v in sorted(source_map(mapping).items())]}

def ler(payload, drive, mapping=None):
    sources = source_map(mapping); alias = payload.get("fonte"); item = sources.get(alias)
    if not item: raise SourceError(404, "Fonte não encontrada.")
    raw, etag, revision = drive.snapshot(item["id"]); text = _text(raw); start = payload.get("inicio", 0)
    if start is None: start = 0
    if type(start) is not int or start < 0 or start > len(text): raise SourceError(416, "Início de leitura inválido.")
    end = min(len(text), start + PAGE)
    return {"texto": text[start:end], "revisao": revision, "proximo": end if end < len(text) else None, "tamanho": len(text), "fonte": alias}

def anotar(payload, drive, mapping=None):
    sources = source_map(mapping); alias, item = payload.get("fonte"), sources.get(payload.get("fonte"))
    if not item: raise SourceError(404, "Fonte não encontrada.")
    if item["editavel"] is not True: raise SourceError(403, "Fonte não é editável.")
    event, note, expected = payload.get("evento"), payload.get("texto"), payload.get("revisao")
    if not isinstance(event, str) or not EVENT.fullmatch(event) or not isinstance(note, str) or not note.strip() or len(note) > MAX_NOTE or "<!-- AGORA-FONTES" in note or "-->" in note: raise SourceError(422, "Anotação inválida.")
    raw, etag, revision = drive.snapshot(item["id"])
    text = _text(raw); digest = _digest("anotar", event, "", note.strip())
    if _receipt_status(text, event, digest): return {"ok": True, "status": "existente"}
    if type(expected) is not int or expected != revision: raise SourceError(409, "A fonte mudou; releia antes de anotar.")
    marker = "<!-- AGORA-FONTES-RECIBO tipo=anotar evento=" + event + " digest=" + digest + " -->"
    # Conteúdo do usuário é acrescentado normalmente; o recibo fica separado no fim.
    updated = _append_receipt(text, note.strip(),).encode("utf-8")
    updated = _append_receipt(updated.decode("utf-8"), marker).encode("utf-8")
    if len(updated) > MAX_SOURCE: raise SourceError(413, "Fonte excede o tamanho permitido.")
    drive.write(item["id"], updated, etag)
    check, _, _ = drive.snapshot(item["id"])
    if check != updated: raise SourceError(503, "Não foi possível confirmar a gravação.")
    return {"ok": True, "status": "gravado"}

def editar(payload, drive, mapping=None):
    sources = source_map(mapping); alias, item = payload.get("fonte"), sources.get(payload.get("fonte"))
    if not item: raise SourceError(404, "Fonte não encontrada.")
    if item["editavel"] is not True: raise SourceError(403, "Fonte não é editável.")
    event, anterior, note, expected = payload.get("evento"), payload.get("anterior"), payload.get("texto"), payload.get("revisao")
    if (not isinstance(event, str) or not EVENT.fullmatch(event) or not isinstance(anterior, str) or not anterior.strip() or len(anterior) > MAX_NOTE or not isinstance(note, str) or not note.strip() or len(note) > MAX_NOTE or "<!-- AGORA-FONTES" in anterior + note or "-->" in anterior + note): raise SourceError(422, "Edição inválida.")
    raw, etag, revision = drive.snapshot(item["id"]); text = _text(raw); digest = _digest("editar", event, anterior, note.strip())
    if _receipt_status(text, event, digest): return {"ok": True, "status": "existente"}
    if type(expected) is not int or expected != revision: raise SourceError(409, "A fonte mudou; releia antes de editar.")
    matches = [m for m in re.finditer(re.escape(anterior), text)]
    spans = _protected_spans(text)
    if len(matches) != 1 or any(any(start < b and end > a for a, b in spans) for start, end in [m.span() for m in matches]): raise SourceError(409, "O trecho anterior não ocorre exatamente uma vez fora dos recibos.")
    m = matches[0]; replacement = note.strip()
    changed = text[:m.start()] + replacement + text[m.end():]
    marker = "<!-- AGORA-FONTES-RECIBO tipo=editar evento=" + event + " digest=" + digest + " -->"
    updated = _append_receipt(changed, marker).encode("utf-8")
    if len(updated) > MAX_SOURCE: raise SourceError(413, "Fonte excede o tamanho permitido.")
    drive.write(item["id"], updated, etag)
    check, _, _ = drive.snapshot(item["id"])
    if check != updated: raise SourceError(503, "Não foi possível confirmar a gravação.")
    return {"ok": True, "status": "gravado"}

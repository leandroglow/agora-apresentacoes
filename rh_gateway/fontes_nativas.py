"""Leitura de fontes nativas e edição pontual de parágrafos no planejamento."""
import json
from dataclasses import dataclass
from .gateway import Failure

DOC = "application/vnd.google-apps.document"
SHEET = "application/vnd.google-apps.spreadsheet"
MAX_SOURCE = 2_000_000


@dataclass(frozen=True)
class NativeRevision:
    docs_revision: str
    original: str


def read_native(request, headers, meta, meta_url, fid):
    kind = meta["mimeType"]
    revision = int(meta["version"])
    docs_revision = ""
    raw = None
    if kind == DOC:
        try:
            doc = json.loads(request("https://docs.googleapis.com/v1/documents/" + fid, headers=headers))
        except Failure:
            doc = {}
        # Only flat paragraphs have a one-to-one mapping to the Docs indices.
        blocks = doc.get("body", {}).get("content", [])
        if blocks and "sectionBreak" in blocks[0] and blocks[0].get("endIndex") == 1:
            blocks = blocks[1:]
        if blocks and all("paragraph" in block and all("textRun" in e for e in block["paragraph"].get("elements", [])) for block in blocks):
            text = "".join(e["textRun"]["content"] for block in blocks for e in block["paragraph"]["elements"])
            if text.endswith("\n"):
                raw = text.encode("utf-8")
                if meta.get("editable") and isinstance(doc.get("revisionId"), str):
                    docs_revision = doc["revisionId"]
    if raw is None:
        export = "text/csv" if kind == SHEET else "text/plain"
        raw = request("https://www.googleapis.com/drive/v3/files/" + fid + "/export?mimeType=" + export, headers=headers)
    if len(raw) > MAX_SOURCE:
        raise Failure(413, "A fonte excede o tamanho permitido.")
    after = json.loads(request(meta_url, headers=headers))
    if after.get("etag") != meta["etag"] or int(after["version"]) != revision or after.get("labels", {}).get("trashed"):
        raise Failure(409, "A fonte mudou durante a leitura.")
    return raw, NativeRevision(docs_revision, raw.decode("utf-8")), revision


def docs_index(text, offset):
    return 1 + len(text[:offset].encode("utf-16-le")) // 2


def edit_requests(original, updated):
    # The final newline belongs to Google Docs. Insert the receipt before it.
    lines = updated.rstrip("\n").rsplit("\n", 1)
    if len(lines) != 2 or not lines[1].startswith("<!-- AGORA-FONTES-RECIBO "):
        raise Failure(422, "Recibo ausente.")
    new_body, receipt = lines
    old_body = original.removesuffix("\n")
    start = 0
    limit = min(len(old_body), len(new_body))
    while start < limit and old_body[start] == new_body[start]:
        start += 1
    suffix = 0
    while suffix < limit - start and old_body[-suffix - 1] == new_body[-suffix - 1]:
        suffix += 1
    old_end = len(old_body) - suffix
    new_end = len(new_body) - suffix
    pos = docs_index(old_body, start)
    ops = []
    if old_end > start:
        ops.append({"deleteContentRange": {"range": {"startIndex": pos, "endIndex": docs_index(old_body, old_end)}}})
    if new_end > start:
        ops.append({"insertText": {"location": {"index": pos}, "text": new_body[start:new_end]}})
    ops.append({"insertText": {"endOfSegmentLocation": {}, "text": "\n" + receipt}})
    return ops


def write_native(request, token, fid, raw, state):
    if not state.docs_revision:
        raise Failure(403, "Esta fonte nativa está disponível apenas para consulta.")
    body = {"writeControl": {"requiredRevisionId": state.docs_revision},
            "requests": edit_requests(state.original, raw.decode("utf-8"))}
    request("https://docs.googleapis.com/v1/documents/" + fid + ":batchUpdate",
            method="POST", data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
            headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"})

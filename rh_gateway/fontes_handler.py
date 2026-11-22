"""Handler HTTP das fontes, montado pela função existente de presença."""
import json, os
from rh_gateway.fontes import FontesDrive, SourceError, anotar, editar, ler, listar, verify_fontes, MAX_BODY
from rh_gateway.gateway import Failure

def handle_post(handler):
    try:
        if os.environ.get("VERCEL_ENV") != "production": raise SourceError(403, "Canal disponível somente em produção.")
        if handler.headers.get_content_type() != "application/json": raise SourceError(415, "Envie JSON.")
        length = handler.headers.get("Content-Length", "")
        if not length.isdigit() or not 0 < int(length) <= MAX_BODY: raise SourceError(413, "Tamanho inválido.")
        body = handler.rfile.read(int(length)); verify_fontes(body, handler.headers.get("X-Agora-Time", ""), handler.headers.get("X-Agora-Signature", ""))
        try: payload = json.loads(body)
        except (ValueError, UnicodeError): raise SourceError(400, "JSON inválido.") from None
        if not isinstance(payload, dict): raise SourceError(400, "Pedido inválido.")
        op = payload.get("op")
        if op == "listar": result = listar()
        elif op == "ler": result = ler(payload, FontesDrive())
        elif op == "anotar": result = anotar(payload, FontesDrive())
        elif op == "editar": result = editar(payload, FontesDrive())
        else: raise SourceError(400, "Operação inválida.")
        handler.reply(200, result)
    except Failure as exc: handler.reply(exc.status, {"ok": False, "error": exc.reason})
    except Exception: handler.reply(503, {"ok": False, "error": "Não foi possível consultar as fontes."})

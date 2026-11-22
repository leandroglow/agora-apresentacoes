import json
import os
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlsplit

from rh_gateway.gateway import Drive, Failure, dispatch, verify
from rh_gateway import fontes_handler


class handler(BaseHTTPRequestHandler):
    def reply(self, status, data):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Cache-Control","no-store")
        self.send_header("Content-Type","application/json; charset=utf-8")
        self.send_header("Content-Length",str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        self.reply(405, {"ok":False,"error":"Use POST."})

    def do_POST(self):
        target = urlsplit(self.path)
        if target.path == "/api/fontes_coordenador" or parse_qs(target.query).get("_route") == ["fontes-coordenador"]:
            return fontes_handler.handle_post(self)
        try:
            if os.environ.get("VERCEL_ENV") != "production":
                raise Failure(403, "Canal disponível somente em produção.")
            if self.headers.get_content_type() != "application/json":
                raise Failure(415,"Envie JSON.")
            length = self.headers.get("Content-Length","")
            if not length.isdigit() or not 0 < int(length) <= 16384:
                raise Failure(413,"Tamanho inválido.")
            body = self.rfile.read(int(length))
            verify(body, self.headers.get("X-Agora-Time",""), self.headers.get("X-Agora-Signature",""))
            try:
                payload = json.loads(body)
            except (ValueError, UnicodeError):
                raise Failure(400,"JSON inválido.") from None
            if not isinstance(payload,dict):
                raise Failure(400,"Pedido inválido.")
            self.reply(200,dispatch(payload,Drive()))
        except Failure as exc:
            self.reply(exc.status,{"ok":False,"error":exc.reason})
        except Exception as exc:
            print("Falha no serviço de presença:",type(exc).__name__,flush=True)
            self.reply(503,{"ok":False,"error":"Não foi possível confirmar no controle de RH."})

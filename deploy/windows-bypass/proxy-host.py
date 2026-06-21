#!/usr/bin/env python3
"""Proxy HTTP simple en el host Windows (sin Docker). Salida directa por IP residencial."""

from __future__ import annotations

import json
import socket
import sys
import threading
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

LISTEN_HOST = "0.0.0.0"
LISTEN_PORT = 8888
ALLOW_PREFIXES = ("127.", "10.234.232.", "172.", "192.168.")

USER_AGENT = (
    "Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 "
    "(KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3"
)


def client_allowed(host: str) -> bool:
    return host.startswith(ALLOW_PREFIXES)


class ProxyHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write("[proxy] %s - %s\n" % (self.client_address[0], fmt % args))

    def do_GET(self) -> None:
        self._handle()

    def do_POST(self) -> None:
        self._handle()

    def do_HEAD(self) -> None:
        self._handle(head_only=True)

    def _handle(self, head_only: bool = False) -> None:
        if not client_allowed(self.client_address[0]):
            self.send_error(403, "Access denied")
            return

        url = self.path
        if not url.startswith("http://") and not url.startswith("https://"):
            self.send_error(400, "Use absolute URL (http://host/path)")
            return

        length = int(self.headers.get("Content-Length", "0") or 0)
        body = self.rfile.read(length) if length else None
        headers = {
            k: v
            for k, v in self.headers.items()
            if k.lower() not in ("host", "proxy-connection", "connection", "content-length")
        }
        headers["User-Agent"] = USER_AGENT

        req = urllib.request.Request(url, data=body, headers=headers, method=self.command)
        try:
            with urllib.request.urlopen(req, timeout=45) as upstream:
                payload = upstream.read()
                self.send_response(upstream.status)
                for key, value in upstream.headers.items():
                    if key.lower() in ("transfer-encoding", "connection", "proxy-connection"):
                        continue
                    self.send_header(key, value)
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                if not head_only:
                    self.wfile.write(payload)
        except urllib.error.HTTPError as exc:
            payload = exc.read()
            self.send_response(exc.code)
            self.send_header("Content-Type", exc.headers.get("Content-Type", "text/plain"))
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            if not head_only:
                self.wfile.write(payload)
        except Exception as exc:
            self.send_error(502, "Upstream failed: %s" % exc)


def main() -> None:
    socket.setdefaulttimeout(45)
    server = ThreadingHTTPServer((LISTEN_HOST, LISTEN_PORT), ProxyHandler)
    print(
        json.dumps(
            {
                "status": "listening",
                "host": LISTEN_HOST,
                "port": LISTEN_PORT,
                "xtream_base": "line.trxdnscloud.ru",
            }
        ),
        flush=True,
    )
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()

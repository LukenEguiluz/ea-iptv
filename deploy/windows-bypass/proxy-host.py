#!/usr/bin/env python3
"""Proxy HTTP en Windows para bypass Xtream (ZeroTier EA_VPN).

Soporta GET/POST (HTTP) y CONNECT (HTTPS tunnel).
Solo trafico del servidor VM (10.234.232.x) hacia el proveedor Xtream.
"""

from __future__ import annotations

import json
import select
import socket
import sys
import threading
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

LISTEN_HOST = "0.0.0.0"
LISTEN_PORT = 8888
ALLOW_PREFIXES = ("127.", "10.234.232.", "172.", "192.168.")
TUNNEL_TIMEOUT = 300
RELAY_CHUNK = 65536

USER_AGENT = (
    "Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 "
    "(KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3"
)


def client_allowed(host: str) -> bool:
    return host.startswith(ALLOW_PREFIXES)


def relay_sockets(client: socket.socket, remote: socket.socket) -> None:
    sockets = [client, remote]
    try:
        while True:
            readable, _, errored = select.select(sockets, [], sockets, TUNNEL_TIMEOUT)
            if errored:
                break
            if not readable:
                break
            for sock in readable:
                other = remote if sock is client else client
                try:
                    data = sock.recv(RELAY_CHUNK)
                except OSError:
                    return
                if not data:
                    return
                try:
                    other.sendall(data)
                except OSError:
                    return
    finally:
        for sock in sockets:
            try:
                sock.shutdown(socket.SHUT_RDWR)
            except OSError:
                pass
            try:
                sock.close()
            except OSError:
                pass


class ProxyHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    timeout = 45

    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write("[proxy] %s - %s\n" % (self.client_address[0], fmt % args))

    def handle_one_request(self) -> None:
        try:
            super().handle_one_request()
        except ConnectionResetError:
            pass
        except BrokenPipeError:
            pass
        except OSError as exc:
            if exc.winerror not in (10054, 10053):  # reset / aborted on Windows
                raise

    def do_CONNECT(self) -> None:
        if not client_allowed(self.client_address[0]):
            self.send_error(403, "Access denied")
            return

        host, _, port_text = self.path.partition(":")
        port = int(port_text or "443")
        if not host:
            self.send_error(400, "Invalid CONNECT target")
            return

        try:
            remote = socket.create_connection((host, port), timeout=30)
            remote.settimeout(TUNNEL_TIMEOUT)
        except OSError as exc:
            self.log_message('CONNECT %s:%s failed: %s', host, port, exc)
            self.send_error(502, "Connect failed")
            return

        self.send_response(200, "Connection Established")
        self.send_header("Proxy-Agent", "ea-iptv-bypass/1.1")
        self.end_headers()

        client = self.connection
        client.settimeout(TUNNEL_TIMEOUT)
        relay_sockets(client, remote)

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
                "connect_tunnel": True,
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

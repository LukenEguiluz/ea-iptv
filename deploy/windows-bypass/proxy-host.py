#!/usr/bin/env python3
"""Proxy HTTP en Windows para bypass Xtream (ZeroTier EA_VPN).

- GET/POST con streaming (catálogos grandes y TV en vivo)
- CONNECT para HTTPS tunnel
"""

from __future__ import annotations

import http.client
import json
import select
import socket
import sys
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

LISTEN_HOST = "0.0.0.0"
LISTEN_PORT = 8888
ALLOW_PREFIXES = ("127.", "10.234.232.", "172.", "192.168.")
TUNNEL_TIMEOUT = 600
API_READ_TIMEOUT = 300
CONNECT_TIMEOUT = 30
RELAY_CHUNK = 65536

USER_AGENT = (
    "Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 "
    "(KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3"
)


def client_allowed(host: str) -> bool:
    return host.startswith(ALLOW_PREFIXES)


def is_stream_url(url: str) -> bool:
    lower = url.lower()
    return "/live/" in lower or lower.endswith(".ts") or "/movie/" in lower or "/series/" in lower


def relay_sockets(client: socket.socket, remote: socket.socket) -> None:
    sockets = [client, remote]
    try:
        while True:
            readable, _, errored = select.select(sockets, [], sockets, TUNNEL_TIMEOUT)
            if errored or not readable:
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
    timeout = CONNECT_TIMEOUT

    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write("[proxy] %s - %s\n" % (self.client_address[0], fmt % args))

    def handle_one_request(self) -> None:
        try:
            super().handle_one_request()
        except (ConnectionResetError, BrokenPipeError):
            pass
        except OSError as exc:
            winerror = getattr(exc, "winerror", None)
            if winerror not in (10054, 10053, None):
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
            remote = socket.create_connection((host, port), timeout=CONNECT_TIMEOUT)
            remote.settimeout(TUNNEL_TIMEOUT)
        except OSError as exc:
            self.log_message("CONNECT %s:%s failed: %s", host, port, exc)
            self.send_error(502, "Connect failed")
            return

        self.send_response(200, "Connection Established")
        self.send_header("Proxy-Agent", "ea-iptv-bypass/1.2")
        self.end_headers()
        self.connection.settimeout(TUNNEL_TIMEOUT)
        relay_sockets(self.connection, remote)

    def do_GET(self) -> None:
        self._handle()

    def do_POST(self) -> None:
        self._handle()

    def do_HEAD(self) -> None:
        self._handle(head_only=True)

    def _open_upstream(self, url: str):
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https"):
            raise ValueError("unsupported scheme")
        host = parsed.hostname
        if not host:
            raise ValueError("missing host")
        port = parsed.port or (443 if parsed.scheme == "https" else 80)
        path = parsed.path or "/"
        if parsed.query:
            path = "%s?%s" % (path, parsed.query)

        if parsed.scheme == "https":
            conn = http.client.HTTPSConnection(host, port, timeout=CONNECT_TIMEOUT)
        else:
            conn = http.client.HTTPConnection(host, port, timeout=CONNECT_TIMEOUT)
        return conn, host, path

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
            if k.lower() not in ("host", "proxy-connection", "connection", "content-length", "proxy-authorization")
        }
        headers["User-Agent"] = USER_AGENT
        headers["Connection"] = "close"

        stream_mode = is_stream_url(url)
        read_timeout = TUNNEL_TIMEOUT if stream_mode else API_READ_TIMEOUT

        conn = None
        try:
            conn, host, path = self._open_upstream(url)
            conn.request(self.command, path, body=body, headers={**headers, "Host": host})
            upstream = conn.getresponse()

            self.send_response(upstream.status)
            for key, value in upstream.getheaders():
                lower = key.lower()
                if lower in ("transfer-encoding", "connection", "proxy-connection", "keep-alive"):
                    continue
                self.send_header(key, value)
            self.end_headers()

            if head_only:
                upstream.read()
                return

            if conn.sock:
                conn.sock.settimeout(read_timeout)

            total = 0
            while True:
                chunk = upstream.read(RELAY_CHUNK)
                if not chunk:
                    break
                self.wfile.write(chunk)
                self.wfile.flush()
                total += len(chunk)

            if stream_mode:
                self.log_message('streamed %s bytes %s', total, url[:80])

        except TimeoutError as exc:
            self.log_message("timeout %s (%s)", url[:100], exc)
            if not self.wfile.closed:
                try:
                    self.send_error(504, "Upstream timeout")
                except Exception:
                    pass
        except urllib.error.HTTPError as exc:
            payload = exc.read()
            self.send_response(exc.code)
            self.send_header("Content-Type", exc.headers.get("Content-Type", "text/plain"))
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
        except Exception as exc:
            self.log_message("upstream error %s: %s", url[:100], exc)
            try:
                self.send_error(502, "Upstream failed: %s" % exc)
            except Exception:
                pass
        finally:
            if conn:
                try:
                    conn.close()
                except Exception:
                    pass


def main() -> None:
    server = ThreadingHTTPServer((LISTEN_HOST, LISTEN_PORT), ProxyHandler)
    print(
        json.dumps(
            {
                "status": "listening",
                "host": LISTEN_HOST,
                "port": LISTEN_PORT,
                "xtream_base": "line.trxdnscloud.ru",
                "connect_tunnel": True,
                "streaming": True,
                "api_timeout_s": API_READ_TIMEOUT,
                "stream_timeout_s": TUNNEL_TIMEOUT,
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

#!/usr/bin/env python3
"""Proxy HTTP en Windows para bypass Xtream (ZeroTier EA_VPN)."""

from __future__ import annotations

import http.client
import json
import select
import socket
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urljoin, urlparse

LISTEN_HOST = "0.0.0.0"
LISTEN_PORT = 8888
ALLOW_PREFIXES = ("127.", "10.234.232.", "172.", "192.168.")
TUNNEL_TIMEOUT = 600
API_READ_TIMEOUT = 300
CONNECT_TIMEOUT = 45
RELAY_CHUNK = 65536
MAX_REDIRECTS = 5

USER_AGENT = (
    "Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 "
    "(KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3"
)

REDIRECT_CODES = {301, 302, 303, 307, 308}


def client_allowed(host: str) -> bool:
    return host.startswith(ALLOW_PREFIXES)


def is_stream_url(url: str) -> bool:
    lower = url.lower()
    return "/live/" in lower or lower.endswith(".ts") or "/live/play/" in lower


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
        except (ConnectionResetError, BrokenPipeError, TimeoutError):
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
        self.send_header("Proxy-Agent", "ea-iptv-bypass/1.3")
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
        return conn, host, path, parsed.scheme

    def _request_upstream(self, url: str, method: str, headers: dict, body):
        conn, host, path, scheme = self._open_upstream(url)
        req_headers = {**headers, "Host": host, "Connection": "close"}
        conn.request(method, path, body=body, headers=req_headers)
        upstream = conn.getresponse()
        return conn, upstream, scheme

    def _resolve_url(self, url: str, method: str, headers: dict, body, follow: bool):
        current = url
        for hop in range(MAX_REDIRECTS + 1):
            conn, upstream, scheme = self._request_upstream(current, method, headers, body if hop == 0 else None)
            status = upstream.status
            if follow and status in REDIRECT_CODES:
                location = upstream.getheader("Location") or upstream.getheader("location")
                upstream.read()
                conn.close()
                if not location:
                    return None, None, current, status
                if location.startswith("/"):
                    parsed = urlparse(current)
                    location = "%s://%s%s" % (parsed.scheme, parsed.netloc, location)
                elif not location.startswith("http"):
                    location = urljoin(current, location)
                self.log_message("redirect %s -> %s", current[:70], location[:70])
                current = location
                body = None
                continue
            return conn, upstream, current, status
        return None, None, current, 0

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

        stream_mode = is_stream_url(url)
        read_timeout = TUNNEL_TIMEOUT if stream_mode else API_READ_TIMEOUT
        follow_redirects = stream_mode or "/player_api.php" in url

        conn = None
        final_url = url
        try:
            conn, upstream, final_url, status = self._resolve_url(
                url, self.command, headers, body, follow=follow_redirects,
            )
            if conn is None or upstream is None:
                self.send_error(502, "Too many redirects")
                return

            if status not in (200, 206):
                payload = b""
                try:
                    payload = upstream.read(65536)
                except (TimeoutError, OSError):
                    pass
                conn.close()
                conn = None
                self.send_response(status)
                self.send_header("Content-Type", upstream.getheader("Content-Type", "text/plain"))
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                if not head_only and payload:
                    self.wfile.write(payload)
                if status == 509:
                    self.log_message("509 conexion limitada proveedor %s", final_url[:80])
                else:
                    self.log_message("upstream %s %s", status, final_url[:80])
                return

            self.send_response(status)
            for key, value in upstream.getheaders():
                lower = key.lower()
                if lower in ("transfer-encoding", "connection", "proxy-connection", "keep-alive"):
                    continue
                self.send_header(key, value)
            self.end_headers()

            if head_only:
                try:
                    upstream.read(4096)
                except (TimeoutError, OSError):
                    pass
                conn.close()
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

            if stream_mode and total > 0:
                self.log_message("stream OK %s bytes %s", total, final_url[:80])
            elif not stream_mode:
                self.log_message("OK %s bytes %s", total, url[:80])

        except TimeoutError as exc:
            self.log_message("timeout %s (%s)", final_url[:90], exc)
            try:
                self.send_error(504, "Upstream timeout")
            except Exception:
                pass
        except Exception as exc:
            self.log_message("error %s: %s", final_url[:90], exc)
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
                "follow_redirects": True,
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

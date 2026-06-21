FROM debian:bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends tinyproxy curl \
    && rm -rf /var/lib/apt/lists/* \
    && printf '%s\n' \
        'Port 8888' \
        'Listen 0.0.0.0' \
        'Allow 127.0.0.1' \
        'Allow 10.234.232.0/24' \
        'Allow 172.16.0.0/12' \
        'Allow 192.168.0.0/16' \
        'Timeout 600' \
        'MaxClients 64' \
        'ConnectPort 443' \
        'ConnectPort 563' \
        'ConnectPort 80' \
        'ConnectPort 8080' \
        > /etc/tinyproxy/tinyproxy.conf

EXPOSE 8888

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD curl -fsS -x http://127.0.0.1:8888 http://example.com/ >/dev/null || exit 1

CMD ["tinyproxy", "-d"]

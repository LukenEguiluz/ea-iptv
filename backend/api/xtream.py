from django.conf import settings
import logging
import threading
import time
from urllib.parse import urlparse

import requests

from sessions.services import SessionError, get_current_session, start_session

logger = logging.getLogger(__name__)

_CACHE_TTL_SECONDS = 600
_cache: dict[tuple, tuple[float, object]] = {}

# User-Agent de STB (MAG) — lo esperan la mayoría de paneles Xtream.
PROVIDER_USER_AGENT = (
    'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 '
    '(KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3'
)

_thread_local = threading.local()

_PROVIDER_HOST_ALIASES = frozenset({
    'line.trxdnscloud.ru',
    'line.vpntxvpn.ru',
})


def provider_hostnames() -> set[str]:
    hosts = set(_PROVIDER_HOST_ALIASES)
    server = getattr(settings, 'XTREAM_SERVER_URL', '').strip().rstrip('/')
    if server:
        if not server.startswith(('http://', 'https://')):
            server = f'http://{server}'
        hostname = urlparse(server).hostname
        if hostname:
            hosts.add(hostname.lower())
    return hosts


def provider_request_proxies() -> dict[str, str] | None:
    proxy = getattr(settings, 'XTREAM_HTTP_PROXY', '').strip()
    if not proxy:
        return None
    return {'http': proxy, 'https': proxy}


def should_use_provider_proxy(url: str) -> bool:
    if not provider_request_proxies():
        return False
    try:
        hostname = (urlparse(url).hostname or '').lower()
    except ValueError:
        return False
    return hostname in provider_hostnames()


def xtream_request_headers() -> dict[str, str]:
    server = getattr(settings, 'XTREAM_SERVER_URL', '').strip().rstrip('/')
    if server and not server.startswith(('http://', 'https://')):
        server = f'http://{server}'
    return {
        'User-Agent': PROVIDER_USER_AGENT,
        'Accept': '*/*',
        'Accept-Language': 'en-US,*',
        'Connection': 'keep-alive',
        'Referer': f'{server}/',
    }


def _xtream_session() -> requests.Session:
    session = getattr(_thread_local, 'xtream_session', None)
    if session is None:
        session = requests.Session()
        session.headers.update(xtream_request_headers())
        _thread_local.xtream_session = session
    return session


def provider_stream_get(
    url: str,
    *,
    stream: bool = True,
    timeout: float | tuple[float, float] = (10, 300),
    extra_headers: dict[str, str] | None = None,
    allow_redirects: bool = True,
) -> requests.Response:
    """GET al proveedor Xtream (streams/API) con bypass residencial si aplica."""
    headers = xtream_request_headers()
    if extra_headers:
        headers.update(extra_headers)
    return _xtream_session().get(
        url,
        headers=headers,
        stream=stream,
        timeout=timeout,
        allow_redirects=allow_redirects,
        proxies=provider_request_proxies(),
    )


_LIVE_REDIRECT_CACHE: dict[str, tuple[float, str]] = {}
_LIVE_REDIRECT_CACHE_TTL_SECONDS = 50


def resolve_provider_live_url(upstream_url: str) -> str:
    """Resuelve el 302 del panel al CDN sin descargar el stream (evita timeout en proxy legacy)."""
    proxies = provider_request_proxies()
    if not proxies:
        return upstream_url

    now = time.monotonic()
    cached = _LIVE_REDIRECT_CACHE.get(upstream_url)
    if cached and now - cached[0] < _LIVE_REDIRECT_CACHE_TTL_SECONDS:
        return cached[1]

    headers = xtream_request_headers()
    headers['Connection'] = 'close'
    try:
        response = requests.get(
            upstream_url,
            headers=headers,
            stream=True,
            timeout=(10, 15),
            allow_redirects=False,
            proxies=proxies,
        )
        try:
            if response.status_code in (301, 302, 303, 307, 308):
                location = (response.headers.get('Location') or '').strip()
                if location:
                    _LIVE_REDIRECT_CACHE[upstream_url] = (now, location)
                    logger.info('live_redirect %s -> %s', upstream_url[:70], location[:70])
                    return location
        finally:
            response.close()
    except requests.RequestException as exc:
        logger.warning('live_redirect_failed url=%s error=%s', upstream_url[:80], exc)
    return upstream_url


class XtreamError(Exception):
    def __init__(self, message: str, code: str = 'xtream_error'):
        self.message = message
        self.code = code
        super().__init__(message)


def _server_url() -> str:
    url = getattr(settings, 'XTREAM_SERVER_URL', '').strip().rstrip('/')
    if not url:
        raise XtreamError(
            'Servidor Xtream no configurado (XTREAM_SERVER_URL).',
            code='xtream_not_configured',
        )
    return url


def _player_api_url() -> str:
    return f'{_server_url()}/player_api.php'


def _parse_retry_backoff(raw: str | None, default: tuple[float, ...]) -> tuple[float, ...]:
    if not raw:
        return default
    values: list[float] = []
    for part in raw.split(','):
        part = part.strip()
        if not part:
            continue
        try:
            values.append(max(0.0, float(part)))
        except ValueError:
            continue
    return tuple(values) if values else default


def _request_timeout(default: float | tuple[float, float] = 60) -> float | tuple[float, float]:
    connect = float(getattr(settings, 'CATALOG_SYNC_XTREAM_CONNECT_TIMEOUT', 30))
    read = float(getattr(settings, 'CATALOG_SYNC_XTREAM_READ_TIMEOUT', 120))
    if connect > 0 and read > 0:
        return (connect, read)
    return default


def _retry_backoff_seconds() -> tuple[float, ...]:
    raw = getattr(settings, 'CATALOG_SYNC_XTREAM_RETRY_BACKOFF', '1,3,5')
    return _parse_retry_backoff(raw, (1.0, 3.0, 5.0))


def _retry_delay(attempt: int, backoff: tuple[float, ...]) -> float:
    if not backoff:
        return 1.0
    index = min(attempt, len(backoff) - 1)
    return backoff[index]


def _max_retries_for_sync() -> int | None:
    configured = int(getattr(settings, 'CATALOG_SYNC_XTREAM_MAX_RETRIES', -1))
    return None if configured < 0 else configured


def ensure_session(user, ip_address: str | None = None):
    session = get_current_session(user.username)
    if session is None:
        session = start_session(user.username, ip_address=ip_address)
    else:
        session.touch()
    return session


def get_credentials(user, ip_address: str | None = None) -> tuple[str, str]:
    session = ensure_session(user, ip_address=ip_address)
    account = session.account_assigned
    username = account.username
    password = account.get_password()
    if not username or not password:
        raise XtreamError('Cuenta IPTV sin credenciales.', code='missing_credentials')
    return username, password


def xtream_request(user, action: str, ip_address: str | None = None, **params):
    username, password = get_credentials(user, ip_address=ip_address)
    return xtream_raw_request(username, password, action, **params)


def xtream_raw_request(
    username: str,
    password: str,
    action: str,
    *,
    use_cache: bool = True,
    max_retries: int | None = 0,
    retry_backoff: tuple[float, ...] | None = None,
    timeout: float | tuple[float, float] | None = None,
    on_retry=None,
    **params,
):
    cache_key = (username, action, tuple(sorted((k, str(v)) for k, v in params.items())))
    if use_cache:
        cached = _cache.get(cache_key)
        if cached:
            expires_at, payload = cached
            if time.time() < expires_at:
                return payload
            _cache.pop(cache_key, None)

    query = {
        'username': username,
        'password': password,
        'action': action,
        **params,
    }
    request_timeout = timeout if timeout is not None else 60
    backoff = retry_backoff or _retry_backoff_seconds()
    attempt = 0

    while True:
        try:
            response = _xtream_session().get(
                _player_api_url(),
                params=query,
                timeout=request_timeout,
                headers=xtream_request_headers(),
                proxies=provider_request_proxies(),
            )
            response.raise_for_status()
        except requests.RequestException as exc:
            if max_retries is not None and attempt >= max_retries:
                raise XtreamError(f'Error al conectar con Xtream: {exc}', code='xtream_connection_error') from exc
            delay = _retry_delay(attempt, backoff)
            if on_retry:
                on_retry(attempt + 1, delay, exc)
            logger.warning(
                'Xtream %s intento %s falló (%s); reintento en %.1fs',
                action,
                attempt + 1,
                exc,
                delay,
            )
            time.sleep(delay)
            attempt += 1
            continue

        try:
            data = response.json()
        except ValueError as exc:
            raise XtreamError('Respuesta inválida del servidor Xtream.', code='xtream_invalid_response') from exc

        if isinstance(data, dict) and data.get('user_info', {}).get('auth') == 0:
            raise XtreamError('Credenciales Xtream rechazadas.', code='xtream_auth_failed')

        if use_cache:
            _cache[cache_key] = (time.time() + _CACHE_TTL_SECONDS, data)
        return data


def xtream_sync_request(
    username: str,
    password: str,
    action: str,
    *,
    on_retry=None,
    **params,
):
    """Petición Xtream para sincronización: reintenta sin límite hasta obtener respuesta."""
    return xtream_raw_request(
        username,
        password,
        action,
        use_cache=False,
        max_retries=_max_retries_for_sync(),
        retry_backoff=_retry_backoff_seconds(),
        timeout=_request_timeout(),
        on_retry=on_retry,
        **params,
    )


def live_stream_url(username: str, password: str, stream_id: str | int) -> str:
    return f'{_server_url()}/live/{username}/{password}/{stream_id}.ts'


def vod_stream_url(username: str, password: str, stream_id: str | int, ext: str = 'mp4') -> str:
    return f'{_server_url()}/movie/{username}/{password}/{stream_id}.{ext.lstrip(".")}'


def series_stream_url(username: str, password: str, episode_id: str | int, ext: str = 'mp4') -> str:
    return f'{_server_url()}/series/{username}/{password}/{episode_id}.{ext.lstrip(".")}'


def probe_xtream(username: str, password: str, *, timeout: float | tuple[float, float] = (12, 30)) -> None:
    """Comprueba conectividad al panel (una sola petición, sin reintentos)."""
    xtream_raw_request(
        username,
        password,
        'get_live_categories',
        use_cache=False,
        max_retries=0,
        timeout=timeout,
    )


def server_outbound_ip() -> str:
    cached = getattr(_thread_local, 'outbound_ip', None)
    if cached:
        return cached
    try:
        response = requests.get('https://api.ipify.org', timeout=8)
        response.raise_for_status()
        ip = response.text.strip()
        _thread_local.outbound_ip = ip
        return ip
    except requests.RequestException:
        return ''


def limit_results(data, limit: str | None):
    if not limit or not isinstance(data, list):
        return data
    try:
        n = max(1, min(int(limit), 50000))
    except (TypeError, ValueError):
        return data
    return data[:n]

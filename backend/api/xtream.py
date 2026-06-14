from django.conf import settings
import time

import requests

from sessions.services import SessionError, get_current_session, start_session

_CACHE_TTL_SECONDS = 600
_cache: dict[tuple, tuple[float, object]] = {}


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


def xtream_raw_request(username: str, password: str, action: str, **params):
    cache_key = (username, action, tuple(sorted((k, str(v)) for k, v in params.items())))
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
    try:
        response = requests.get(_player_api_url(), params=query, timeout=60)
        response.raise_for_status()
    except requests.RequestException as exc:
        raise XtreamError(f'Error al conectar con Xtream: {exc}', code='xtream_connection_error') from exc

    try:
        data = response.json()
    except ValueError as exc:
        raise XtreamError('Respuesta inválida del servidor Xtream.', code='xtream_invalid_response') from exc

    if isinstance(data, dict) and data.get('user_info', {}).get('auth') == 0:
        raise XtreamError('Credenciales Xtream rechazadas.', code='xtream_auth_failed')

    _cache[cache_key] = (time.time() + _CACHE_TTL_SECONDS, data)
    return data


def live_stream_url(username: str, password: str, stream_id: str | int) -> str:
    return f'{_server_url()}/live/{username}/{password}/{stream_id}.ts'


def vod_stream_url(username: str, password: str, stream_id: str | int, ext: str = 'mp4') -> str:
    return f'{_server_url()}/movie/{username}/{password}/{stream_id}.{ext.lstrip(".")}'


def series_stream_url(username: str, password: str, episode_id: str | int, ext: str = 'mp4') -> str:
    return f'{_server_url()}/series/{username}/{password}/{episode_id}.{ext.lstrip(".")}'


def limit_results(data, limit: str | None):
    if not limit or not isinstance(data, list):
        return data
    try:
        n = max(1, min(int(limit), 500))
    except (TypeError, ValueError):
        return data
    return data[:n]

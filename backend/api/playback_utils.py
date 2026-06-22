from django.conf import settings

from api.catalog_utils import proxy_play_url
from api.xtream import live_stream_url, series_stream_url, vod_stream_url
from sessions.services import get_credentials


def client_direct_playback_enabled() -> bool:
    return getattr(settings, 'CLIENT_DIRECT_PLAYBACK', True)


def provider_stream_url(
    username: str,
    password: str,
    kind: str,
    stream_id: str | int,
    ext: str = '',
) -> str:
    if kind == 'live':
        return live_stream_url(username, password, stream_id)
    if kind == 'vod':
        return vod_stream_url(username, password, stream_id, ext=ext)
    return series_stream_url(username, password, stream_id, ext=ext)


def build_playback_urls(
    request,
    user,
    *,
    kind: str,
    stream_id: str | int,
    ext: str = '',
    audio_index: int | None = None,
    ip: str | None = None,
) -> dict:
    """URLs de reproducción: directa al proveedor (navegador) y proxy (fallback VM)."""
    username, password = get_credentials(user, ip_address=ip)
    direct_url = provider_stream_url(username, password, kind, stream_id, ext=ext)
    proxy_url = proxy_play_url(
        request,
        user,
        kind,
        stream_id,
        ext=ext,
        audio_index=audio_index,
    )

    if client_direct_playback_enabled():
        return {
            'url': direct_url,
            'direct_url': direct_url,
            'proxy_url': proxy_url,
            'playback_mode': 'direct',
        }

    return {
        'url': proxy_url,
        'direct_url': direct_url,
        'proxy_url': proxy_url,
        'playback_mode': 'proxy',
    }

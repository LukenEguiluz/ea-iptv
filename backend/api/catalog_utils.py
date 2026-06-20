import os
import re
from urllib.parse import quote, urljoin, urlparse

from django.conf import settings
from django.core import signing

IMAGE_FIELDS = ('stream_icon', 'cover', 'cover_big')
PLAY_SALT = 'iptv-play'
SEGMENT_SALT = 'iptv-segment'
MEDIA_SALT = 'iptv-media'
SUBTITLE_SALT = 'iptv-subtitle'
PLAY_MAX_AGE = 60 * 60 * 6
MEDIA_MAX_AGE = 60 * 60 * 24


def _is_http_url(value: str | None) -> bool:
    if not value or not isinstance(value, str):
        return False
    parsed = urlparse(value.strip())
    return parsed.scheme in ('http', 'https') and bool(parsed.netloc)


def _token_query(token: str) -> str:
    return f't={quote(token, safe="")}'


def _public_api_url(path: str, request=None) -> str:
    path = path if path.startswith('/') else f'/{path}'
    public = getattr(settings, 'GATEWAY_PUBLIC_URL', '').strip().rstrip('/')
    if public:
        return f'{public}{path}'
    if request is not None:
        return request.build_absolute_uri(path)
    return path


def make_play_token(
    user_id: int,
    kind: str,
    stream_id: str | int,
    ext: str = '',
    audio_index: int | None = None,
) -> str:
    payload = {
        'uid': user_id,
        'kind': kind,
        'id': str(stream_id),
        'ext': ext.lstrip('.'),
    }
    if audio_index is not None:
        payload['audio'] = int(audio_index)
    return signing.dumps(payload, salt=PLAY_SALT)


def make_subtitle_token(
    user_id: int,
    kind: str,
    stream_id: str | int,
    ext: str,
    sub_index: int,
) -> str:
    return signing.dumps(
        {
            'uid': user_id,
            'kind': kind,
            'id': str(stream_id),
            'ext': ext.lstrip('.'),
            'sub': int(sub_index),
        },
        salt=SUBTITLE_SALT,
    )


def load_subtitle_token(token: str) -> dict:
    return signing.loads(token, salt=SUBTITLE_SALT, max_age=PLAY_MAX_AGE)


def load_play_token(token: str) -> dict:
    return signing.loads(token, salt=PLAY_SALT, max_age=PLAY_MAX_AGE)


def make_segment_token(user_id: int, upstream_url: str) -> str:
    return signing.dumps({'uid': user_id, 'url': upstream_url}, salt=SEGMENT_SALT)


def load_segment_token(token: str) -> dict:
    return signing.loads(token, salt=SEGMENT_SALT, max_age=PLAY_MAX_AGE)


def make_media_token(url: str) -> str:
    return signing.dumps({'url': url}, salt=MEDIA_SALT)


def load_media_token(token: str) -> dict:
    return signing.loads(token, salt=MEDIA_SALT, max_age=MEDIA_MAX_AGE)


def proxy_play_url(
    request,
    user,
    kind: str,
    stream_id: str | int,
    ext: str = '',
    audio_index: int | None = None,
) -> str:
    token = make_play_token(user.pk, kind, stream_id, ext, audio_index=audio_index)
    return _public_api_url(f'/api/proxy/play?{_token_query(token)}', request)


def proxy_subtitle_url(
    request,
    user,
    kind: str,
    stream_id: str | int,
    ext: str,
    sub_index: int,
) -> str:
    token = make_subtitle_token(user.pk, kind, stream_id, ext, sub_index)
    return _public_api_url(f'/api/proxy/subtitle?{_token_query(token)}', request)


def proxy_media_url(request, original_url: str) -> str:
    token = make_media_token(original_url)
    return _public_api_url(f'/api/proxy/media?{_token_query(token)}', request)


def rewrite_media_field(request, value: str | None) -> str | None:
    if not _is_http_url(value):
        return value
    return proxy_media_url(request, value.strip())


def rewrite_catalog_item(request, item: dict) -> dict:
    if not isinstance(item, dict):
        return item
    for field in IMAGE_FIELDS:
        if field in item:
            item[field] = rewrite_media_field(request, item.get(field))
    return item


def rewrite_catalog_list(request, data: list) -> list:
    if not isinstance(data, list):
        return data
    return [rewrite_catalog_item(request, dict(item)) for item in data]


def rewrite_series_info(request, data: dict) -> dict:
    if not isinstance(data, dict):
        return data
    info = data.get('info')
    if isinstance(info, dict):
        for field in IMAGE_FIELDS:
            if field in info:
                info[field] = rewrite_media_field(request, info.get(field))
    return data


def _segment_proxy_path(user_id: int, upstream_url: str, request=None) -> str:
    token = make_segment_token(user_id, upstream_url)
    return _public_api_url(f'/api/proxy/segment?{_token_query(token)}', request)


def _resolve_live_segment_url(
    segment_line: str,
    base_url: str,
    server: str,
    username: str,
    password: str,
) -> str:
    absolute = urljoin(base_url, segment_line.strip())
    basename = os.path.basename(absolute)
    if basename.endswith('.ts'):
        return f'{server.rstrip("/")}/live/{username}/{password}/{basename}'
    return absolute


def rewrite_m3u8(
    manifest: str,
    base_url: str,
    user_id: int,
    *,
    username: str | None = None,
    password: str | None = None,
    server: str | None = None,
    kind: str = 'live',
    request=None,
) -> str:
    lines = []
    use_live_rewrite = kind == 'live' and username and password and server

    for line in manifest.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith('#'):
            uri_match = re.search(r'URI="([^"]+)"', stripped)
            if uri_match:
                original = uri_match.group(1)
                if use_live_rewrite:
                    absolute = _resolve_live_segment_url(original, base_url, server, username, password)
                else:
                    absolute = urljoin(base_url, original)
                proxy = _segment_proxy_path(user_id, absolute, request)
                lines.append(stripped.replace(original, proxy))
                continue
            lines.append(line)
            continue

        if use_live_rewrite:
            absolute = _resolve_live_segment_url(stripped, base_url, server, username, password)
        else:
            absolute = urljoin(base_url, stripped)

        lines.append(_segment_proxy_path(user_id, absolute, request))

    return '\n'.join(lines) + '\n'

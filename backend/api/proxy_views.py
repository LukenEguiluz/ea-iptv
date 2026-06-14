import requests
import shutil
from django.contrib.auth import get_user_model
from django.core import signing
from django.http import HttpResponse, StreamingHttpResponse
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from urllib.parse import unquote

from .catalog_utils import (
    load_media_token,
    load_play_token,
    load_segment_token,
    rewrite_m3u8,
)
from .xtream import (
    XtreamError,
    _server_url,
    get_credentials,
    live_stream_url,
    series_stream_url,
    vod_stream_url,
)

User = get_user_model()
STREAM_CHUNK = 64 * 1024
PROVIDER_USER_AGENT = (
    'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 '
    '(KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3'
)
from .stream_utils import (
    analyze_stream,
    ffmpeg_live_h264_stream,
    file_range_response,
    get_or_create_browser_mp4,
    live_needs_transcode,
)

SERIES_EXTENSIONS = ('mkv', 'mp4', 'ts')


def _serve_browser_compatible(
    upstream_url: str,
    request,
    *,
    kind: str,
    stream_id: str | int,
    ext: str,
):
    if not shutil.which('ffmpeg') or not shutil.which('ffprobe'):
        return None
    try:
        analysis = analyze_stream(upstream_url, ext, PROVIDER_USER_AGENT)
        if not analysis['needs_processing']:
            return None
        cached = get_or_create_browser_mp4(
            upstream_url,
            kind,
            stream_id,
            ext,
            PROVIDER_USER_AGENT,
        )
        response = file_range_response(cached, request, content_type='video/mp4')
        response['X-Accel-Buffering'] = 'no'
        return response
    except (OSError, RuntimeError, ValueError):
        return None


def _upstream_headers(request, *, kind: str = '') -> dict:
    headers = {'User-Agent': PROVIDER_USER_AGENT}
    if kind != 'live':
        range_header = request.META.get('HTTP_RANGE')
        if range_header:
            headers['Range'] = range_header
    return headers


def _proxy_response(upstream: requests.Response, extra_headers: dict | None = None) -> HttpResponse | StreamingHttpResponse:
    content_type = upstream.headers.get('Content-Type', 'application/octet-stream')
    passthrough = ('Content-Range', 'Accept-Ranges', 'Content-Length')
    content_length = int(upstream.headers.get('Content-Length', '0') or 0)

    if upstream.status_code in (200, 206) and 0 < content_length < 5_000_000:
        body = upstream.content
        response = HttpResponse(body, status=upstream.status_code, content_type=content_type)
    else:
        response = StreamingHttpResponse(
            upstream.iter_content(chunk_size=STREAM_CHUNK),
            status=upstream.status_code,
            content_type=content_type,
        )

    for header in passthrough:
        if header in upstream.headers:
            response[header] = upstream.headers[header]

    if extra_headers:
        for key, value in extra_headers.items():
            response[key] = value

    response['Cache-Control'] = 'no-cache, no-transform'
    response['X-Accel-Buffering'] = 'no'
    return response


def _fetch_upstream(url: str, request, *, kind: str = '') -> requests.Response:
    return requests.get(
        url,
        headers=_upstream_headers(request, kind=kind),
        stream=True,
        timeout=(10, 120),
        allow_redirects=True,
    )


def _resolve_play_upstream(user, payload: dict) -> str:
    username, password = get_credentials(user)
    kind = payload['kind']
    stream_id = payload['id']
    ext = payload.get('ext') or 'mp4'

    if kind == 'live':
        return live_stream_url(username, password, stream_id)
    if kind == 'vod':
        return vod_stream_url(username, password, stream_id, ext=ext)
    if kind == 'series':
        return series_stream_url(username, password, stream_id, ext=ext)
    raise XtreamError('Tipo de stream no soportado.', code='unsupported_stream')


def resolve_series_extension(username: str, password: str, episode_id: str | int, preferred: str = '') -> str | None:
    extensions: list[str] = []
    if preferred:
        extensions.append(preferred.lstrip('.'))
    for ext in SERIES_EXTENSIONS:
        if ext not in extensions:
            extensions.append(ext)

    probe_headers = {'User-Agent': PROVIDER_USER_AGENT, 'Range': 'bytes=0-0'}
    for ext in extensions:
        url = series_stream_url(username, password, episode_id, ext=ext)
        try:
            response = requests.get(url, headers=probe_headers, timeout=12, stream=True)
            if response.status_code in (200, 206):
                response.close()
                return ext
            response.close()
        except requests.RequestException:
            continue
    return None


def _upstream_error_response(upstream: requests.Response):
    return Response(
        {
            'detail': 'El proveedor no tiene este contenido disponible.',
            'code': 'upstream_error',
            'upstream_status': upstream.status_code,
        },
        status=status.HTTP_502_BAD_GATEWAY,
    )


def _read_token(request) -> str:
    return unquote(request.query_params.get('t', ''))


class MediaProxyView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        token = _read_token(request)
        try:
            payload = load_media_token(token)
        except signing.BadSignature:
            return Response({'detail': 'Enlace de imagen inválido.'}, status=status.HTTP_403_FORBIDDEN)

        url = payload.get('url', '')
        if not url.startswith(('http://', 'https://')):
            return Response({'detail': 'URL no permitida.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            upstream = _fetch_upstream(url, request)
            upstream.raise_for_status()
        except requests.RequestException:
            return HttpResponse(status=404)

        response = _proxy_response(upstream)
        response['Cache-Control'] = 'public, max-age=86400'
        return response


class StreamPlayProxyView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        token = _read_token(request)
        try:
            payload = load_play_token(token)
        except signing.BadSignature:
            return Response({'detail': 'Enlace de reproducción inválido o expirado.'}, status=status.HTTP_403_FORBIDDEN)

        try:
            user = User.objects.get(pk=payload['uid'])
            stream_kind = payload.get('kind', '')
            stream_ext = (payload.get('ext') or '').lower().lstrip('.')
            upstream_url = _resolve_play_upstream(user, payload)
            if stream_kind == 'live' and shutil.which('ffmpeg') and live_needs_transcode(
                upstream_url,
                PROVIDER_USER_AGENT,
            ):
                return ffmpeg_live_h264_stream(upstream_url, PROVIDER_USER_AGENT)
            if stream_kind in ('vod', 'series'):
                processed = _serve_browser_compatible(
                    upstream_url,
                    request,
                    kind=stream_kind,
                    stream_id=payload['id'],
                    ext=stream_ext or 'mp4',
                )
                if processed is not None:
                    return processed
            upstream = _fetch_upstream(upstream_url, request, kind=stream_kind)
        except User.DoesNotExist:
            return Response({'detail': 'Usuario no encontrado.'}, status=status.HTTP_403_FORBIDDEN)
        except XtreamError as exc:
            return Response({'detail': exc.message, 'code': exc.code}, status=status.HTTP_502_BAD_GATEWAY)
        except requests.RequestException as exc:
            return Response({'detail': f'No se pudo conectar al stream: {exc}'}, status=status.HTTP_502_BAD_GATEWAY)

        content_type = upstream.headers.get('Content-Type', '')
        is_manifest = 'mpegurl' in content_type.lower() or upstream_url.endswith('.m3u8')

        if is_manifest:
            if upstream.status_code not in (200, 206):
                return _upstream_error_response(upstream)
            try:
                manifest = upstream.text
                username, password = get_credentials(user)
                rewritten = rewrite_m3u8(
                    manifest,
                    upstream_url,
                    user.pk,
                    username=username,
                    password=password,
                    server=_server_url(),
                    kind=payload['kind'],
                )
                return HttpResponse(
                    rewritten,
                    status=upstream.status_code,
                    content_type='application/vnd.apple.mpegurl',
                )
            except requests.RequestException:
                return HttpResponse(status=upstream.status_code)

        if upstream.status_code not in (200, 206):
            return _upstream_error_response(upstream)

        extra_headers = {} if stream_kind == 'live' else {'Accept-Ranges': 'bytes'}
        return _proxy_response(upstream, extra_headers)


class StreamSegmentProxyView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        token = _read_token(request)
        try:
            payload = load_segment_token(token)
        except signing.BadSignature:
            return Response({'detail': 'Segmento inválido.'}, status=status.HTTP_403_FORBIDDEN)

        url = payload.get('url', '')
        if not url.startswith(('http://', 'https://')):
            return Response({'detail': 'URL no permitida.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            upstream = _fetch_upstream(url, request)
        except requests.RequestException:
            return HttpResponse(status=502)

        content_type = upstream.headers.get('Content-Type', '')
        if 'mpegurl' in content_type.lower() or url.endswith('.m3u8'):
            if upstream.status_code not in (200, 206):
                return _upstream_error_response(upstream)
            try:
                user_id = payload['uid']
                manifest = upstream.text
                rewritten = rewrite_m3u8(manifest, url, user_id)
                return HttpResponse(
                    rewritten,
                    status=upstream.status_code,
                    content_type='application/vnd.apple.mpegurl',
                )
            except requests.RequestException:
                return HttpResponse(status=upstream.status_code)

        if upstream.status_code not in (200, 206):
            return _upstream_error_response(upstream)

        return _proxy_response(upstream)

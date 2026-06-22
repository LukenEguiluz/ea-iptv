import logging
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError

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
    load_subtitle_token,
    rewrite_m3u8,
)
from .xtream import (
    XtreamError,
    PROVIDER_USER_AGENT,
    _server_url,
    get_credentials,
    live_stream_url,
    provider_stream_get,
    series_stream_url,
    vod_stream_url,
)

User = get_user_model()
logger = logging.getLogger(__name__)
STREAM_CHUNK = 64 * 1024
LIVE_FIRST_BYTE_TIMEOUT = 10
LIVE_PROXY_READ_TIMEOUT = 300
from .stream_utils import (
    analyze_stream,
    cache_path,
    ffmpeg_browser_mp4_stream,
    ffmpeg_live_h264_stream,
    ffmpeg_subtitle_vtt_stream,
    file_range_response,
    live_needs_transcode,
    warm_browser_mp4_cache,
)

SERIES_EXTENSIONS = ('mkv', 'mp4', 'ts')


def _serve_browser_compatible(
    upstream_url: str,
    request,
    *,
    kind: str,
    stream_id: str | int,
    ext: str,
    audio_stream_index: int | None = None,
):
    if not shutil.which('ffmpeg') or not shutil.which('ffprobe'):
        return None
    try:
        audio_key = audio_stream_index if audio_stream_index is not None else 0
        cached = cache_path(kind, stream_id, ext, audio_key)
        if cached.exists() and cached.stat().st_size > 0:
            response = file_range_response(cached, request, content_type='video/mp4')
            response['X-Accel-Buffering'] = 'no'
            return response

        analysis = analyze_stream(upstream_url, ext, PROVIDER_USER_AGENT)
        if not analysis['needs_processing']:
            return None

        warm_browser_mp4_cache(
            upstream_url, kind, stream_id, ext, PROVIDER_USER_AGENT, audio_stream_index,
        )
        response = ffmpeg_browser_mp4_stream(
            upstream_url, analysis, PROVIDER_USER_AGENT, audio_stream_index,
        )
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

    if 'Accept-Ranges' not in response and upstream.status_code in (200, 206):
        response['Accept-Ranges'] = 'bytes'

    response['Cache-Control'] = 'no-cache, no-transform'
    response['X-Accel-Buffering'] = 'no'
    return response


def _fetch_upstream(url: str, request, *, kind: str = '') -> requests.Response:
    read_timeout = LIVE_PROXY_READ_TIMEOUT if kind == 'live' else 120
    return provider_stream_get(
        url,
        stream=True,
        timeout=(10, read_timeout),
        extra_headers=_upstream_headers(request, kind=kind),
    )


def _proxy_live_passthrough(
    upstream_url: str,
    request,
    *,
    stream_id: str | int | None = None,
    user_id: int | None = None,
):
    """Proxy live TS con streaming real, timeout al primer byte y logging diagnóstico."""
    started_at = time.monotonic()
    safe_url = upstream_url if len(upstream_url) <= 120 else f'{upstream_url[:120]}…'
    logger.info(
        'live_proxy start url=%s stream_id=%s user_id=%s',
        safe_url,
        stream_id,
        user_id,
    )

    try:
        upstream = _fetch_upstream(upstream_url, request, kind='live')
    except requests.RequestException as exc:
        elapsed_ms = int((time.monotonic() - started_at) * 1000)
        logger.warning(
            'live_proxy connect_failed url=%s error=%s elapsed_ms=%s',
            safe_url,
            exc,
            elapsed_ms,
        )
        return Response(
            {
                'detail': f'No se pudo conectar al canal en vivo: {exc}',
                'code': 'live_connect_failed',
            },
            status=status.HTTP_502_BAD_GATEWAY,
        )

    if upstream.status_code not in (200, 206):
        elapsed_ms = int((time.monotonic() - started_at) * 1000)
        logger.warning(
            'live_proxy upstream_error url=%s status=%s elapsed_ms=%s',
            safe_url,
            upstream.status_code,
            elapsed_ms,
        )
        upstream.close()
        return _upstream_error_response(upstream)

    iterator = upstream.iter_content(chunk_size=STREAM_CHUNK)

    def read_first_chunk():
        for chunk in iterator:
            if chunk:
                return chunk
        return None

    with ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(read_first_chunk)
        try:
            first_chunk = future.result(timeout=LIVE_FIRST_BYTE_TIMEOUT)
        except FuturesTimeoutError:
            upstream.close()
            elapsed_ms = int((time.monotonic() - started_at) * 1000)
            logger.warning(
                'live_proxy first_byte_timeout url=%s timeout_s=%s elapsed_ms=%s',
                safe_url,
                LIVE_FIRST_BYTE_TIMEOUT,
                elapsed_ms,
            )
            return Response(
                {
                    'detail': 'El proveedor no envió datos del canal a tiempo. Intenta de nuevo.',
                    'code': 'live_first_byte_timeout',
                },
                status=status.HTTP_504_GATEWAY_TIMEOUT,
            )

    if not first_chunk:
        upstream.close()
        elapsed_ms = int((time.monotonic() - started_at) * 1000)
        logger.warning(
            'live_proxy empty_stream url=%s elapsed_ms=%s',
            safe_url,
            elapsed_ms,
        )
        return Response(
            {
                'detail': 'El proveedor devolvió un stream vacío.',
                'code': 'live_empty_stream',
            },
            status=status.HTTP_502_BAD_GATEWAY,
        )

    first_byte_ms = int((time.monotonic() - started_at) * 1000)
    logger.info(
        'live_proxy first_byte url=%s first_byte_ms=%s bytes=%s',
        safe_url,
        first_byte_ms,
        len(first_chunk),
    )

    def stream():
        try:
            yield first_chunk
            for chunk in iterator:
                if chunk:
                    yield chunk
        finally:
            upstream.close()

    response = StreamingHttpResponse(
        stream(),
        status=upstream.status_code,
        content_type='video/mp2t',
    )
    response['Cache-Control'] = 'no-cache, no-transform'
    response['X-Accel-Buffering'] = 'no'
    return response


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


class SubtitleProxyView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        token = _read_token(request)
        try:
            payload = load_subtitle_token(token)
        except signing.BadSignature:
            return Response({'detail': 'Enlace de subtítulos inválido.'}, status=status.HTTP_403_FORBIDDEN)

        try:
            user = User.objects.get(pk=payload['uid'])
            upstream_url = _resolve_play_upstream(user, payload)
            sub_index = int(payload['sub'])
            return ffmpeg_subtitle_vtt_stream(upstream_url, sub_index, PROVIDER_USER_AGENT)
        except User.DoesNotExist:
            return Response({'detail': 'Usuario no encontrado.'}, status=status.HTTP_403_FORBIDDEN)
        except XtreamError as exc:
            return Response({'detail': exc.message, 'code': exc.code}, status=status.HTTP_502_BAD_GATEWAY)
        except (OSError, RuntimeError, ValueError):
            return HttpResponse(status=404)


def _client_decode_requested(request) -> bool:
    return str(request.query_params.get('client_decode', '')).lower() in ('1', 'true', 'yes')


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
            audio_stream_index = payload.get('audio')
            if audio_stream_index is not None:
                audio_stream_index = int(audio_stream_index)
            upstream_url = _resolve_play_upstream(user, payload)
            client_decode = _client_decode_requested(request)
            if stream_kind == 'live' and not client_decode:
                if shutil.which('ffmpeg') and live_needs_transcode(upstream_url, PROVIDER_USER_AGENT):
                    logger.info(
                        'live_proxy transcode_start stream_id=%s user_id=%s',
                        payload.get('id'),
                        user.pk,
                    )
                    return ffmpeg_live_h264_stream(upstream_url, PROVIDER_USER_AGENT)
                return _proxy_live_passthrough(
                    upstream_url,
                    request,
                    stream_id=payload.get('id'),
                    user_id=user.pk,
                )
            if stream_kind in ('vod', 'series') and not client_decode:
                processed = _serve_browser_compatible(
                    upstream_url,
                    request,
                    kind=stream_kind,
                    stream_id=payload['id'],
                    ext=stream_ext or 'mp4',
                    audio_stream_index=audio_stream_index,
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
                    request=request,
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
                rewritten = rewrite_m3u8(manifest, url, user_id, request=request)
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

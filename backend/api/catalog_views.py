from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from sessions.services import SessionError

from .epg_utils import normalize_epg_list
from .catalog_utils import (
    proxy_play_url,
    proxy_subtitle_url,
    rewrite_catalog_list,
    rewrite_series_info,
)
from .stream_utils import get_media_playback_info
from .xtream import (
    XtreamError,
    get_credentials,
    limit_results,
    series_stream_url,
    vod_stream_url,
    xtream_request,
)
from .proxy_views import resolve_series_extension


def _parse_audio_index(request) -> int | None:
    raw = request.query_params.get('audio', '').strip()
    if not raw:
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


def _play_payload(request, user, *, kind: str, stream_id: str | int, ext: str, ip: str | None):
    username, password = get_credentials(user, ip_address=ip)
    if kind == 'vod':
        upstream_url = vod_stream_url(username, password, stream_id, ext=ext)
    else:
        upstream_url = series_stream_url(username, password, stream_id, ext=ext)

    audio_index = _parse_audio_index(request)
    media_info = get_media_playback_info(upstream_url, PROVIDER_USER_AGENT)

    subtitles = []
    for track in media_info.get('subtitles', []):
        subtitles.append({
            **track,
            'url': proxy_subtitle_url(
                request, user, kind, stream_id, ext, track['index'],
            ),
        })

    return {
        'type': kind,
        'stream_id': stream_id,
        'ext': ext,
        'url': proxy_play_url(request, user, kind, stream_id, ext=ext, audio_index=audio_index),
        'duration_seconds': media_info.get('duration_seconds'),
        'tracks': {
            'audio': media_info.get('audio', []),
            'subtitles': subtitles,
        },
    }


# Provider user-agent shared with proxy
PROVIDER_USER_AGENT = (
    'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 '
    '(KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3'
)


def _client_ip(request) -> str | None:
    forwarded = request.META.get('HTTP_X_FORWARDED_FOR')
    if forwarded:
        return forwarded.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR')


def _xtream_error_response(exc: XtreamError):
    return Response({'detail': exc.message, 'code': exc.code}, status=status.HTTP_502_BAD_GATEWAY)


def _session_error_response(exc: SessionError):
    status_code = status.HTTP_409_CONFLICT if exc.code == 'no_account_available' else status.HTTP_400_BAD_REQUEST
    return Response({'detail': exc.message, 'code': exc.code}, status=status_code)


def _category_required_response():
    return Response(
        {'detail': 'Selecciona una categoría para cargar el catálogo.', 'code': 'category_required'},
        status=status.HTTP_400_BAD_REQUEST,
    )


class CatalogBaseView(APIView):
    permission_classes = [IsAuthenticated]

    def handle_exception(self, exc):
        if isinstance(exc, SessionError):
            return _session_error_response(exc)
        if isinstance(exc, XtreamError):
            return _xtream_error_response(exc)
        return super().handle_exception(exc)


class LiveCategoriesView(CatalogBaseView):
    def get(self, request):
        data = xtream_request(request.user, 'get_live_categories', ip_address=_client_ip(request))
        return Response(data)


class LiveStreamsView(CatalogBaseView):
    def get(self, request):
        category_id = request.query_params.get('category_id')
        if not category_id:
            return _category_required_response()

        data = xtream_request(
            request.user,
            'get_live_streams',
            ip_address=_client_ip(request),
            category_id=category_id,
        )
        return Response(rewrite_catalog_list(request, limit_results(data, request.query_params.get('limit'))))


class VodCategoriesView(CatalogBaseView):
    def get(self, request):
        data = xtream_request(request.user, 'get_vod_categories', ip_address=_client_ip(request))
        return Response(data)


class VodStreamsView(CatalogBaseView):
    def get(self, request):
        category_id = request.query_params.get('category_id')
        if not category_id:
            return _category_required_response()

        data = xtream_request(
            request.user,
            'get_vod_streams',
            ip_address=_client_ip(request),
            category_id=category_id,
        )
        return Response(rewrite_catalog_list(request, limit_results(data, request.query_params.get('limit'))))


class SeriesCategoriesView(CatalogBaseView):
    def get(self, request):
        data = xtream_request(request.user, 'get_series_categories', ip_address=_client_ip(request))
        return Response(data)


class SeriesListView(CatalogBaseView):
    def get(self, request):
        category_id = request.query_params.get('category_id')
        if not category_id:
            return _category_required_response()

        data = xtream_request(
            request.user,
            'get_series',
            ip_address=_client_ip(request),
            category_id=category_id,
        )
        return Response(rewrite_catalog_list(request, limit_results(data, request.query_params.get('limit'))))


class SeriesInfoView(CatalogBaseView):
    def get(self, request, series_id):
        data = xtream_request(
            request.user,
            'get_series_info',
            ip_address=_client_ip(request),
            series_id=series_id,
        )
        return Response(rewrite_series_info(request, data))


class LiveStreamUrlView(CatalogBaseView):
    def get(self, request, stream_id):
        return Response({
            'type': 'live',
            'stream_id': stream_id,
            'url': proxy_play_url(request, request.user, 'live', stream_id),
        })


class LiveEpgView(CatalogBaseView):
    def get(self, request, stream_id):
        limit = request.query_params.get('limit', '8')
        try:
            limit_value = max(1, min(int(limit), 24))
        except (TypeError, ValueError):
            limit_value = 8
        data = xtream_request(
            request.user,
            'get_short_epg',
            ip_address=_client_ip(request),
            stream_id=stream_id,
            limit=limit_value,
        )
        listings = normalize_epg_list(data)
        current = next((item for item in listings if item.get('now')), None)
        return Response({
            'stream_id': stream_id,
            'listings': listings,
            'current': current,
            'has_epg': bool(listings),
        })


class VodStreamUrlView(CatalogBaseView):
    def get(self, request, vod_id):
        ext = request.query_params.get('ext', 'mp4')
        return Response(_play_payload(
            request,
            request.user,
            kind='vod',
            stream_id=vod_id,
            ext=ext,
            ip=_client_ip(request),
        ))


class SeriesEpisodeStreamUrlView(CatalogBaseView):
    def get(self, request, episode_id):
        username, password = get_credentials(request.user, ip_address=_client_ip(request))
        preferred = request.query_params.get('ext', '').strip()
        ext = resolve_series_extension(username, password, episode_id, preferred=preferred)
        if not ext:
            return Response(
                {'detail': 'Episodio no disponible en el proveedor.', 'code': 'episode_unavailable'},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        return Response(_play_payload(
            request,
            request.user,
            kind='series',
            stream_id=episode_id,
            ext=ext,
            ip=_client_ip(request),
        ))

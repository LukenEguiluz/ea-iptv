from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from sessions.services import SessionError

from library.models import CatalogItem

from .epg_utils import normalize_epg_list
from .playback_utils import build_playback_urls
from .catalog_utils import (
    proxy_subtitle_url,
    rewrite_catalog_list,
    rewrite_series_info,
)
from .catalog_list import (
    _parse_offset,
    _parse_page_limit,
    catalog_index_ready,
    list_catalog_from_index,
    list_categories_from_index,
    paginate_list,
)
from .stream_utils import get_media_playback_info
from .xtream import (
    XtreamError,
    PROVIDER_USER_AGENT,
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
        **build_playback_urls(
            request,
            user,
            kind=kind,
            stream_id=stream_id,
            ext=ext,
            audio_index=audio_index,
            ip=ip,
        ),
        'duration_seconds': media_info.get('duration_seconds'),
        'tracks': {
            'audio': media_info.get('audio', []),
            'subtitles': subtitles,
        },
    }


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
        if catalog_index_ready(CatalogItem.CONTENT_LIVE):
            return Response(list_categories_from_index(CatalogItem.CONTENT_LIVE))
        data = xtream_request(request.user, 'get_live_categories', ip_address=_client_ip(request))
        return Response(data)


def _paginated_catalog_response(request, *, paginated: bool, payload: dict):
    if paginated:
        return Response(payload)
    return Response(payload['items'])


def _fetch_xtream_catalog(request, content_type: str, category_id: str) -> list:
    user = request.user
    ip = _client_ip(request)

    if content_type == 'live':
        categories_action = 'get_live_categories'
        streams_action = 'get_live_streams'
    elif content_type == 'vod':
        categories_action = 'get_vod_categories'
        streams_action = 'get_vod_streams'
    else:
        categories_action = 'get_series_categories'
        streams_action = 'get_series'

    if category_id == 'all':
        categories = xtream_request(user, categories_action, ip_address=ip)
        data = []
        if isinstance(categories, list):
            for cat in categories:
                cat_id = cat.get('category_id')
                if not cat_id:
                    continue
                streams = xtream_request(
                    user,
                    streams_action,
                    ip_address=ip,
                    category_id=cat_id,
                )
                if isinstance(streams, list):
                    data.extend(streams)
        return data

    data = xtream_request(
        user,
        streams_action,
        ip_address=ip,
        category_id=category_id,
    )
    return data if isinstance(data, list) else []


class LiveStreamsView(CatalogBaseView):
    def get(self, request):
        category_id = request.query_params.get('category_id', '').strip()
        if not category_id:
            return _category_required_response()

        paginated = request.query_params.get('paginated', '').strip().lower() in {'1', 'true', 'yes'}
        offset = _parse_offset(request.query_params.get('offset', '0'))
        page_limit = _parse_page_limit(request.query_params.get('limit', '300'))

        if catalog_index_ready(CatalogItem.CONTENT_LIVE):
            payload = list_catalog_from_index(
                request,
                content_type=CatalogItem.CONTENT_LIVE,
                category_id=category_id,
                offset=offset,
                limit=page_limit,
            )
            return _paginated_catalog_response(request, paginated=paginated, payload=payload)

        data = rewrite_catalog_list(
            request,
            _fetch_xtream_catalog(request, 'live', category_id),
        )
        return _paginated_catalog_response(
            request,
            paginated=paginated,
            payload=paginate_list(data, offset, page_limit),
        )


class VodCategoriesView(CatalogBaseView):
    def get(self, request):
        if catalog_index_ready(CatalogItem.CONTENT_VOD):
            return Response(list_categories_from_index(CatalogItem.CONTENT_VOD))
        data = xtream_request(request.user, 'get_vod_categories', ip_address=_client_ip(request))
        return Response(data)


class VodStreamsView(CatalogBaseView):
    def get(self, request):
        category_id = request.query_params.get('category_id', '').strip()
        if not category_id:
            return _category_required_response()

        paginated = request.query_params.get('paginated', '').strip().lower() in {'1', 'true', 'yes'}
        offset = _parse_offset(request.query_params.get('offset', '0'))
        page_limit = _parse_page_limit(request.query_params.get('limit', '300'))

        if catalog_index_ready(CatalogItem.CONTENT_VOD):
            payload = list_catalog_from_index(
                request,
                content_type=CatalogItem.CONTENT_VOD,
                category_id=category_id,
                offset=offset,
                limit=page_limit,
            )
            return _paginated_catalog_response(request, paginated=paginated, payload=payload)

        data = rewrite_catalog_list(
            request,
            _fetch_xtream_catalog(request, 'vod', category_id),
        )
        return _paginated_catalog_response(
            request,
            paginated=paginated,
            payload=paginate_list(data, offset, page_limit),
        )


class SeriesCategoriesView(CatalogBaseView):
    def get(self, request):
        if catalog_index_ready(CatalogItem.CONTENT_SERIES):
            return Response(list_categories_from_index(CatalogItem.CONTENT_SERIES))
        data = xtream_request(request.user, 'get_series_categories', ip_address=_client_ip(request))
        return Response(data)


class SeriesListView(CatalogBaseView):
    def get(self, request):
        category_id = request.query_params.get('category_id', '').strip()
        if not category_id:
            return _category_required_response()

        paginated = request.query_params.get('paginated', '').strip().lower() in {'1', 'true', 'yes'}
        offset = _parse_offset(request.query_params.get('offset', '0'))
        page_limit = _parse_page_limit(request.query_params.get('limit', '300'))

        if catalog_index_ready(CatalogItem.CONTENT_SERIES):
            payload = list_catalog_from_index(
                request,
                content_type=CatalogItem.CONTENT_SERIES,
                category_id=category_id,
                offset=offset,
                limit=page_limit,
            )
            return _paginated_catalog_response(request, paginated=paginated, payload=payload)

        data = rewrite_catalog_list(
            request,
            _fetch_xtream_catalog(request, 'series', category_id),
        )
        return _paginated_catalog_response(
            request,
            paginated=paginated,
            payload=paginate_list(data, offset, page_limit),
        )


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
            **build_playback_urls(
                request,
                request.user,
                kind='live',
                stream_id=stream_id,
                ip=_client_ip(request),
            ),
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

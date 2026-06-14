from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from sessions.services import SessionError

from .epg_utils import normalize_epg_list
from .catalog_utils import (
    proxy_play_url,
    rewrite_catalog_list,
    rewrite_series_info,
)
from .xtream import (
    XtreamError,
    get_credentials,
    limit_results,
    xtream_request,
)
from .proxy_views import resolve_series_extension


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
        return Response({
            'type': 'vod',
            'stream_id': vod_id,
            'url': proxy_play_url(request, request.user, 'vod', vod_id, ext=ext),
        })


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
        return Response({
            'type': 'series',
            'stream_id': episode_id,
            'ext': ext,
            'url': proxy_play_url(request, request.user, 'series', episode_id, ext=ext),
        })

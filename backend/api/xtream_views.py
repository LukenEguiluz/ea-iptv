from django.conf import settings
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from api.catalog_views import CatalogBaseView, _client_ip
from api.xtream import get_credentials, xtream_request

# Acciones permitidas en el forwarder (estilo app IPTV, una petición = una acción).
ALLOWED_XTREAM_ACTIONS = frozenset({
    'get_live_categories',
    'get_live_streams',
    'get_vod_categories',
    'get_vod_streams',
    'get_vod_info',
    'get_series_categories',
    'get_series',
    'get_series_info',
    'get_short_epg',
    'get_simple_data_table',
})


class XtreamCredentialsView(CatalogBaseView):
    """Credenciales Xtream de la sesión activa (para URLs de stream en el navegador)."""

    def get(self, request):
        username, password = get_credentials(request.user, ip_address=_client_ip(request))
        return Response({
            'server': settings.XTREAM_SERVER_URL,
            'username': username,
            'password': password,
        })


class XtreamPlayerApiView(CatalogBaseView):
    """Forwarder on-demand: una acción player_api por petición, credenciales del usuario."""

    def get(self, request):
        action = request.query_params.get('action', '').strip()
        if not action:
            return Response(
                {'detail': 'Parámetro action requerido.', 'code': 'action_required'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if action not in ALLOWED_XTREAM_ACTIONS:
            return Response(
                {'detail': f'Acción no permitida: {action}', 'code': 'action_forbidden'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        params = {
            key: value
            for key, value in request.query_params.items()
            if key != 'action'
        }
        data = xtream_request(
            request.user,
            action,
            ip_address=_client_ip(request),
            **params,
        )
        return Response(data)

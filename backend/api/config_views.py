from django.conf import settings
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView


class AppConfigView(APIView):
    """Configuración visible para el frontend (modo catálogo, reproducción, etc.)."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        use_index = getattr(settings, 'CATALOG_USE_INDEX', False)
        sync_enabled = getattr(settings, 'CATALOG_SYNC_ENABLED', False)
        on_demand = not use_index
        return Response({
            'catalog_mode': 'on_demand' if on_demand else 'indexed',
            'catalog_use_index': use_index,
            'catalog_sync_enabled': sync_enabled,
            'search_enabled': use_index,
            'client_direct_playback': getattr(settings, 'CLIENT_DIRECT_PLAYBACK', True),
            'xtream_server': getattr(settings, 'XTREAM_SERVER_URL', ''),
        })

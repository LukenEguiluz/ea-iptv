import threading

from django.conf import settings
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from api.catalog_utils import rewrite_media_field
from library.catalog_sync import sync_catalog_index, sync_status_payload
from library.models import CatalogItem
from library.search import search_catalog


class CatalogSearchView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not getattr(settings, 'CATALOG_USE_INDEX', False):
            return Response(
                {
                    'detail': (
                        'Búsqueda global desactivada en modo directo. '
                        'Navega por categorías o usa el buscador de categorías.'
                    ),
                    'code': 'search_disabled',
                    'query': request.query_params.get('q', '').strip(),
                    'results': [],
                    'count': 0,
                },
            )

        query = request.query_params.get('q', '').strip()
        content_type = request.query_params.get('type', '').strip().lower() or None
        limit = request.query_params.get('limit', '40')

        payload = sync_status_payload()
        if content_type:
            type_key = content_type if content_type in ('live', 'vod', 'series') else None
            if type_key and not payload['ready_by_type'].get(type_key):
                return Response(
                    {
                        'detail': f'El índice de {type_key} aún no está listo. Sincronízalo desde la sección correspondiente.',
                        'code': 'search_not_ready',
                        'sync': payload,
                    },
                    status=status.HTTP_503_SERVICE_UNAVAILABLE,
                )
        elif not payload['ready']:
            return Response(
                {
                    'detail': 'El índice de TV en vivo se está preparando. Intenta de nuevo en unos minutos.',
                    'code': 'search_not_ready',
                    'sync': payload,
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        if len(query) < 2:
            return Response({'query': query, 'results': [], 'count': 0})

        items = search_catalog(query, content_type=content_type, limit=limit)
        results = []
        for item in items:
            results.append({
                'content_type': item.content_type,
                'item_id': item.item_id,
                'name': item.name,
                'category_id': item.category_id,
                'category_name': item.category_name,
                'image': rewrite_media_field(request, item.image_url) if item.image_url else '',
                'year': item.year,
                'rating': item.rating,
                'container_extension': item.container_extension,
                'cast': item.cast_display,
                'director': (item.extra or {}).get('director', '') if isinstance(item.extra, dict) else '',
                'extra': item.extra,
                'series_id': item.item_id if item.content_type == CatalogItem.CONTENT_SERIES else '',
                'stream_id': item.item_id,
            })

        return Response({
            'query': query,
            'type': content_type,
            'count': len(results),
            'results': results,
        })


class CatalogSearchStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        payload = sync_status_payload()
        return Response(payload)


class CatalogSearchSyncView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        state = sync_status_payload()
        if state['status'] == 'running':
            return Response(state, status=status.HTTP_202_ACCEPTED)

        def run_sync():
            try:
                sync_catalog_index(force=True)
            except Exception:
                pass

        thread = threading.Thread(target=run_sync, daemon=True)
        thread.start()
        return Response(
            {'detail': 'Sincronización iniciada.', 'sync': sync_status_payload()},
            status=status.HTTP_202_ACCEPTED,
        )

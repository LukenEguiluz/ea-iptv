import threading

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from library.catalog_sync import parse_content_types, should_run_scheduled_sync, sync_catalog_index, sync_status_payload


def refresh_status_payload() -> dict:
    payload = sync_status_payload()
    payload['version'] = payload.get('finished_at') or payload.get('started_at') or 'pending'
    return payload


class CatalogRefreshView(APIView):
    """Estado y disparo de sincronización del catálogo (live, VOD, series)."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(refresh_status_payload())

    def post(self, request):
        force = str(request.query_params.get('force', '')).lower() in ('1', 'true', 'yes')
        types_raw = request.query_params.get('types', '')
        if not types_raw and isinstance(request.data, dict):
            body_types = request.data.get('types')
            if body_types is not None:
                types_raw = body_types
        content_types = parse_content_types(types_raw) if types_raw else None
        state = refresh_status_payload()

        if state['status'] == 'running' and not (force and state.get('stale')):
            return Response(state, status=status.HTTP_202_ACCEPTED)

        is_live_only = content_types is None or content_types == ('live',)
        should_sync = force or (
            is_live_only and should_run_scheduled_sync()
        ) or (
            content_types is not None and not is_live_only
        )

        if should_sync:
            selected = content_types

            def run_sync():
                try:
                    sync_catalog_index(force=True, content_types=selected)
                except Exception:
                    pass

            thread = threading.Thread(target=run_sync, daemon=True)
            thread.start()
            state = refresh_status_payload()
            return Response(
                {'detail': 'Sincronización iniciada.', **state},
                status=status.HTTP_202_ACCEPTED,
            )

        return Response({'detail': 'Catálogo actualizado.', **state})

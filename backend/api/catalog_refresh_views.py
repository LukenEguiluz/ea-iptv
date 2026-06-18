import threading

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from library.catalog_sync import should_run_scheduled_sync, sync_catalog_index, sync_status_payload


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
        state = refresh_status_payload()

        if state['status'] == 'running':
            return Response(state, status=status.HTTP_202_ACCEPTED)

        if force or should_run_scheduled_sync():
            def run_sync():
                try:
                    sync_catalog_index(force=True)
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

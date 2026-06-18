from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from api.library_serializers import (
    ViewHistorySerializer,
    ViewHistoryUpsertSerializer,
    WatchProgressSerializer,
    WatchProgressUpsertSerializer,
)
from library.models import ViewHistory, WatchProgress


def _progress_to_item(progress: WatchProgress) -> dict:
    percent = 0
    if progress.duration_seconds and progress.duration_seconds > 0:
        percent = round((progress.position_seconds / progress.duration_seconds) * 100)
    return {
        **WatchProgressSerializer(progress).data,
        'percent': min(100, max(0, percent)),
    }


class ContinueWatchingView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        content_type = request.query_params.get('type', '').strip().lower()
        limit = request.query_params.get('limit', '12')
        try:
            limit_value = max(1, min(int(limit), 30))
        except (TypeError, ValueError):
            limit_value = 12

        qs = WatchProgress.objects.filter(
            user=request.user,
            completed=False,
            content_type__in=['vod', 'series'],
            position_seconds__gt=15,
        )
        if content_type in {'vod', 'series'}:
            qs = qs.filter(content_type=content_type)
        items = qs.order_by('-updated_at')[:limit_value]

        return Response([_progress_to_item(item) for item in items])


class ViewHistoryListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        content_type = request.query_params.get('type', '').strip().lower()
        limit = request.query_params.get('limit', '20')
        try:
            limit_value = max(1, min(int(limit), 50))
        except (TypeError, ValueError):
            limit_value = 20

        qs = ViewHistory.objects.filter(user=request.user)
        if content_type in {'live', 'vod', 'series'}:
            qs = qs.filter(content_type=content_type)
        items = qs.order_by('-viewed_at')[:limit_value]
        return Response(ViewHistorySerializer(items, many=True).data)

    def delete(self, request):
        content_type = request.query_params.get('type', '').strip().lower()
        item_id = request.query_params.get('item_id', '').strip()

        if item_id:
            if content_type not in {'live', 'vod', 'series'}:
                return Response(
                    {'detail': 'Indica type (live, vod o series) junto con item_id.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            deleted, _ = ViewHistory.objects.filter(
                user=request.user,
                content_type=content_type,
                item_id=item_id,
            ).delete()
            if not deleted:
                return Response({'detail': 'No encontrado.'}, status=status.HTTP_404_NOT_FOUND)
            return Response(status=status.HTTP_204_NO_CONTENT)

        if content_type not in {'live', 'vod', 'series'}:
            return Response(
                {'detail': 'Indica type (live, vod o series) o item_id.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        deleted, _ = ViewHistory.objects.filter(
            user=request.user,
            content_type=content_type,
        ).delete()
        return Response({'deleted': deleted}, status=status.HTTP_200_OK)


class WatchProgressDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, content_type, item_id):
        progress = WatchProgress.objects.filter(
            user=request.user,
            content_type=content_type,
            item_id=item_id,
        ).first()
        if not progress:
            return Response({'position_seconds': 0, 'duration_seconds': None, 'completed': False})
        return Response(_progress_to_item(progress))

    def put(self, request, content_type, item_id):
        payload = {
            **request.data,
            'content_type': content_type,
            'item_id': item_id,
        }
        serializer = WatchProgressUpsertSerializer(data=payload)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        duration = data.get('duration_seconds')
        position = data.get('position_seconds', 0)
        completed = data.get('completed', False)
        if duration and duration > 0 and position >= max(duration * 0.92, duration - 120):
            completed = True

        progress, _ = WatchProgress.objects.update_or_create(
            user=request.user,
            content_type=content_type,
            item_id=item_id,
            defaults={
                'series_id': data.get('series_id', ''),
                'title': data.get('title', ''),
                'image': data.get('image', ''),
                'ext': data.get('ext', ''),
                'position_seconds': position,
                'duration_seconds': duration,
                'completed': completed,
            },
        )
        return Response(_progress_to_item(progress))

    def delete(self, request, content_type, item_id):
        deleted, _ = WatchProgress.objects.filter(
            user=request.user,
            content_type=content_type,
            item_id=item_id,
        ).delete()
        if not deleted:
            return Response({'detail': 'No encontrado.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ViewHistoryUpsertView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ViewHistoryUpsertSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        history, _ = ViewHistory.objects.update_or_create(
            user=request.user,
            content_type=data['content_type'],
            item_id=data['item_id'],
            defaults={
                'series_id': data.get('series_id', ''),
                'title': data.get('title', ''),
                'image': data.get('image', ''),
                'category_name': data.get('category_name', ''),
                'ext': data.get('ext', ''),
            },
        )
        return Response(ViewHistorySerializer(history).data, status=status.HTTP_201_CREATED)

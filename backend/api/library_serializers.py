from rest_framework import serializers

from library.models import ViewHistory, WatchProgress


class WatchProgressSerializer(serializers.ModelSerializer):
    class Meta:
        model = WatchProgress
        fields = [
            'content_type',
            'item_id',
            'series_id',
            'title',
            'image',
            'ext',
            'position_seconds',
            'duration_seconds',
            'completed',
            'updated_at',
        ]
        read_only_fields = ['updated_at']


class ViewHistorySerializer(serializers.ModelSerializer):
    class Meta:
        model = ViewHistory
        fields = [
            'content_type',
            'item_id',
            'series_id',
            'title',
            'image',
            'category_name',
            'ext',
            'viewed_at',
        ]
        read_only_fields = ['viewed_at']


class WatchProgressUpsertSerializer(serializers.Serializer):
    content_type = serializers.ChoiceField(choices=['live', 'vod', 'series'])
    item_id = serializers.CharField(max_length=64)
    series_id = serializers.CharField(max_length=64, required=False, allow_blank=True, default='')
    title = serializers.CharField(max_length=512, required=False, allow_blank=True, default='')
    image = serializers.CharField(max_length=2048, required=False, allow_blank=True, default='')
    ext = serializers.CharField(max_length=16, required=False, allow_blank=True, default='')
    position_seconds = serializers.FloatField(min_value=0, required=False, default=0)
    duration_seconds = serializers.FloatField(min_value=0, required=False, allow_null=True)
    completed = serializers.BooleanField(required=False, default=False)


class ViewHistoryUpsertSerializer(serializers.Serializer):
    content_type = serializers.ChoiceField(choices=['live', 'vod', 'series'])
    item_id = serializers.CharField(max_length=64)
    series_id = serializers.CharField(max_length=64, required=False, allow_blank=True, default='')
    title = serializers.CharField(max_length=512, required=False, allow_blank=True, default='')
    image = serializers.CharField(max_length=2048, required=False, allow_blank=True, default='')
    category_name = serializers.CharField(max_length=256, required=False, allow_blank=True, default='')
    ext = serializers.CharField(max_length=16, required=False, allow_blank=True, default='')

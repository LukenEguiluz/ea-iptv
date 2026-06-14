from django.conf import settings
from django.db import models


class CatalogItem(models.Model):
    CONTENT_LIVE = 'live'
    CONTENT_VOD = 'vod'
    CONTENT_SERIES = 'series'
    CONTENT_CHOICES = [
        (CONTENT_LIVE, 'TV en vivo'),
        (CONTENT_VOD, 'Película'),
        (CONTENT_SERIES, 'Serie'),
    ]

    content_type = models.CharField(max_length=16, choices=CONTENT_CHOICES, db_index=True)
    item_id = models.CharField(max_length=64)
    name = models.CharField(max_length=512)
    name_normalized = models.CharField(max_length=512, db_index=True)
    category_id = models.CharField(max_length=64, blank=True, default='', db_index=True)
    category_name = models.CharField(max_length=256, blank=True, default='')
    image_url = models.URLField(max_length=1024, blank=True, default='')
    year = models.CharField(max_length=16, blank=True, default='')
    rating = models.CharField(max_length=32, blank=True, default='')
    container_extension = models.CharField(max_length=16, blank=True, default='')
    cast_display = models.CharField(max_length=512, blank=True, default='')
    search_text = models.TextField(blank=True, default='')
    extra = models.JSONField(default=dict, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['content_type', 'item_id'],
                name='library_catalogitem_unique_type_item',
            ),
        ]
        indexes = [
            models.Index(fields=['content_type', 'name_normalized']),
            models.Index(fields=['content_type', 'category_id']),
            models.Index(fields=['content_type']),
        ]

    def __str__(self):
        return f'{self.content_type}:{self.item_id} {self.name}'


class CatalogSyncState(models.Model):
    key = models.CharField(max_length=64, primary_key=True)
    status = models.CharField(max_length=16, default='idle')
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    live_count = models.PositiveIntegerField(default=0)
    vod_count = models.PositiveIntegerField(default=0)
    series_count = models.PositiveIntegerField(default=0)
    error_message = models.TextField(blank=True, default='')
    updated_at = models.DateTimeField(auto_now=True)


class WatchProgress(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='watch_progress',
    )
    content_type = models.CharField(max_length=16)
    item_id = models.CharField(max_length=64)
    series_id = models.CharField(max_length=64, blank=True, default='')
    title = models.CharField(max_length=512, blank=True, default='')
    image = models.URLField(max_length=1024, blank=True, default='')
    ext = models.CharField(max_length=16, blank=True, default='')
    position_seconds = models.FloatField(default=0)
    duration_seconds = models.FloatField(null=True, blank=True)
    completed = models.BooleanField(default=False)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'content_type', 'item_id'],
                name='library_watchprogress_unique_user_item',
            ),
        ]
        indexes = [
            models.Index(fields=['user', '-updated_at']),
            models.Index(fields=['user', 'content_type', '-updated_at']),
        ]


class ViewHistory(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='view_history',
    )
    content_type = models.CharField(max_length=16)
    item_id = models.CharField(max_length=64)
    series_id = models.CharField(max_length=64, blank=True, default='')
    title = models.CharField(max_length=512, blank=True, default='')
    image = models.URLField(max_length=1024, blank=True, default='')
    category_name = models.CharField(max_length=256, blank=True, default='')
    ext = models.CharField(max_length=16, blank=True, default='')
    viewed_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'content_type', 'item_id'],
                name='library_viewhistory_unique_user_item',
            ),
        ]
        indexes = [
            models.Index(fields=['user', '-viewed_at']),
            models.Index(fields=['user', 'content_type', '-viewed_at']),
        ]

from django.contrib import admin

from .models import CatalogItem, CatalogSyncState, ViewHistory, WatchProgress


@admin.register(CatalogItem)
class CatalogItemAdmin(admin.ModelAdmin):
    list_display = ('content_type', 'name', 'category_name', 'item_id', 'updated_at')
    list_filter = ('content_type',)
    search_fields = ('name', 'item_id', 'category_name')


@admin.register(CatalogSyncState)
class CatalogSyncStateAdmin(admin.ModelAdmin):
    list_display = ('key', 'status', 'live_count', 'vod_count', 'series_count', 'updated_at')


@admin.register(WatchProgress)
class WatchProgressAdmin(admin.ModelAdmin):
    list_display = ('user', 'content_type', 'title', 'position_seconds', 'completed', 'updated_at')
    list_filter = ('content_type', 'completed')


@admin.register(ViewHistory)
class ViewHistoryAdmin(admin.ModelAdmin):
    list_display = ('user', 'content_type', 'title', 'viewed_at')
    list_filter = ('content_type',)

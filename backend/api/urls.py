from django.urls import path
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from .catalog_views import (
    LiveCategoriesView,
    LiveEpgView,
    LiveStreamUrlView,
    LiveStreamsView,
    SeriesCategoriesView,
    SeriesEpisodeStreamUrlView,
    SeriesInfoView,
    SeriesListView,
    VodCategoriesView,
    VodStreamUrlView,
    VodStreamsView,
)
from .diagnostics_views import DiagnosticsConfigView, DiagnosticsView
from .library_views import (
    ContinueWatchingView,
    ViewHistoryListView,
    ViewHistoryUpsertView,
    WatchProgressDetailView,
)
from .proxy_views import MediaProxyView, StreamPlayProxyView, StreamSegmentProxyView, SubtitleProxyView
from .search_views import CatalogSearchStatusView, CatalogSearchSyncView, CatalogSearchView
from .views import (
    SessionCurrentView,
    SessionEndView,
    SessionHeartbeatView,
    SessionStartView,
)

urlpatterns = [
    path('token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('session/start', SessionStartView.as_view(), name='session_start'),
    path('session/heartbeat', SessionHeartbeatView.as_view(), name='session_heartbeat'),
    path('session/end', SessionEndView.as_view(), name='session_end'),
    path('session/current', SessionCurrentView.as_view(), name='session_current'),
    path('catalog/live/categories', LiveCategoriesView.as_view(), name='catalog_live_categories'),
    path('catalog/live/streams', LiveStreamsView.as_view(), name='catalog_live_streams'),
    path('catalog/live/<str:stream_id>/play', LiveStreamUrlView.as_view(), name='catalog_live_play'),
    path('catalog/live/<str:stream_id>/epg', LiveEpgView.as_view(), name='catalog_live_epg'),
    path('catalog/vod/categories', VodCategoriesView.as_view(), name='catalog_vod_categories'),
    path('catalog/vod/streams', VodStreamsView.as_view(), name='catalog_vod_streams'),
    path('catalog/vod/<str:vod_id>/play', VodStreamUrlView.as_view(), name='catalog_vod_play'),
    path('catalog/series/categories', SeriesCategoriesView.as_view(), name='catalog_series_categories'),
    path('catalog/series', SeriesListView.as_view(), name='catalog_series_list'),
    path('catalog/series/<str:series_id>', SeriesInfoView.as_view(), name='catalog_series_info'),
    path('catalog/series/episode/<str:episode_id>/play', SeriesEpisodeStreamUrlView.as_view(), name='catalog_series_play'),
    path('catalog/search', CatalogSearchView.as_view(), name='catalog_search'),
    path('catalog/search/status', CatalogSearchStatusView.as_view(), name='catalog_search_status'),
    path('catalog/search/sync', CatalogSearchSyncView.as_view(), name='catalog_search_sync'),
    path('library/continue', ContinueWatchingView.as_view(), name='library_continue'),
    path('library/history', ViewHistoryListView.as_view(), name='library_history'),
    path('library/history/record', ViewHistoryUpsertView.as_view(), name='library_history_record'),
    path('library/progress/<str:content_type>/<str:item_id>', WatchProgressDetailView.as_view(), name='library_progress'),
    path('diagnostics/run', DiagnosticsView.as_view(), name='diagnostics_run'),
    path('diagnostics/config', DiagnosticsConfigView.as_view(), name='diagnostics_config'),
    path('proxy/media', MediaProxyView.as_view(), name='proxy_media'),
    path('proxy/play', StreamPlayProxyView.as_view(), name='proxy_play'),
    path('proxy/subtitle', SubtitleProxyView.as_view(), name='proxy_subtitle'),
    path('proxy/segment', StreamSegmentProxyView.as_view(), name='proxy_segment'),
]

import logging
import re
import threading
import time
import unicodedata
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import timedelta

from django.conf import settings
from django.db import connection, transaction
from django.utils import timezone

from accounts.models import IPTVAccount
from api.xtream import XtreamError, xtream_raw_request
from library.models import CatalogItem, CatalogSyncState

logger = logging.getLogger(__name__)

SYNC_KEY = 'default'
BATCH_SIZE = 1000
SYNC_ADVISORY_LOCK_ID = 83927401
_scheduler_started = False


def normalize_name(value: str) -> str:
    text = unicodedata.normalize('NFKD', (value or '').strip().lower())
    text = ''.join(ch for ch in text if not unicodedata.combining(ch))
    return re.sub(r'\s+', ' ', text)


def build_search_text(
    name: str,
    *,
    cast: str = '',
    director: str = '',
    genre: str = '',
) -> str:
    parts = [name, cast, director, genre]
    return normalize_name(' '.join(part for part in parts if part))


def _sync_state() -> CatalogSyncState:
    state, _ = CatalogSyncState.objects.get_or_create(pk=SYNC_KEY)
    return state


def _pick_account() -> IPTVAccount:
    account = IPTVAccount.objects.filter(enabled=True).order_by('name').first()
    if account is None:
        raise XtreamError('No hay cuentas IPTV habilitadas para indexar.', code='no_account')
    return account


def _item_from_live(entry: dict, category_id: str, category_name: str) -> CatalogItem:
    name = entry.get('name') or ''
    return CatalogItem(
        content_type=CatalogItem.CONTENT_LIVE,
        item_id=str(entry.get('stream_id') or ''),
        name=name,
        name_normalized=normalize_name(name),
        category_id=str(category_id),
        category_name=category_name or '',
        image_url=(entry.get('stream_icon') or '')[:1024],
        extra={
            'epg_channel_id': entry.get('epg_channel_id') or '',
            'tv_archive': entry.get('tv_archive') or 0,
        },
    )


def _item_from_vod(entry: dict, category_id: str, category_name: str) -> CatalogItem:
    name = entry.get('name') or ''
    genre = entry.get('genre') or ''
    return CatalogItem(
        content_type=CatalogItem.CONTENT_VOD,
        item_id=str(entry.get('stream_id') or ''),
        name=name,
        name_normalized=normalize_name(name),
        category_id=str(category_id),
        category_name=category_name or '',
        image_url=(entry.get('stream_icon') or '')[:1024],
        year=str(entry.get('year') or ''),
        rating=str(entry.get('rating') or ''),
        container_extension=(entry.get('container_extension') or 'mp4')[:16],
        cast_display='',
        search_text=build_search_text(name, genre=genre),
        extra={
            'genre': genre,
            'plot': entry.get('plot') or '',
        },
    )


def _item_from_series(entry: dict, category_id: str, category_name: str) -> CatalogItem:
    name = entry.get('name') or entry.get('title') or ''
    cast = str(entry.get('cast') or '')[:512]
    director = str(entry.get('director') or '')
    genre = entry.get('genre') or ''
    return CatalogItem(
        content_type=CatalogItem.CONTENT_SERIES,
        item_id=str(entry.get('series_id') or ''),
        name=name,
        name_normalized=normalize_name(name),
        category_id=str(category_id),
        category_name=category_name or '',
        image_url=(entry.get('cover') or entry.get('stream_icon') or '')[:1024],
        rating=str(entry.get('rating') or ''),
        cast_display=cast,
        search_text=build_search_text(name, cast=cast, director=director, genre=genre),
        extra={
            'genre': genre,
            'plot': entry.get('plot') or '',
            'director': director,
            'last_modified': entry.get('last_modified') or '',
        },
    )


def _bulk_upsert(items: list[CatalogItem], content_type: str, sync_started) -> int:
    if not items:
        CatalogItem.objects.filter(content_type=content_type, updated_at__lt=sync_started).delete()
        return 0

    saved = 0
    base_fields = [
        'name',
        'name_normalized',
        'category_id',
        'category_name',
        'image_url',
        'year',
        'rating',
        'container_extension',
        'extra',
        'updated_at',
    ]
    if content_type == CatalogItem.CONTENT_SERIES:
        update_fields = base_fields + ['cast_display', 'search_text']
    else:
        update_fields = base_fields

    for offset in range(0, len(items), BATCH_SIZE):
        batch = items[offset:offset + BATCH_SIZE]
        for item in batch:
            item.updated_at = sync_started
        CatalogItem.objects.bulk_create(
            batch,
            update_conflicts=True,
            unique_fields=['content_type', 'item_id'],
            update_fields=update_fields,
            batch_size=BATCH_SIZE,
        )
        saved += len(batch)

    CatalogItem.objects.filter(content_type=content_type, updated_at__lt=sync_started).delete()
    return saved


def _category_workers() -> int:
    return max(1, getattr(settings, 'CATALOG_SYNC_CATEGORY_WORKERS', 10))


def _account_workers(account_count: int) -> int:
    configured = max(1, getattr(settings, 'CATALOG_SYNC_ACCOUNT_WORKERS', 5))
    return min(account_count, configured) if account_count else 1


def _collect_type(username: str, password: str, content_type: str) -> list[CatalogItem]:
    if content_type == CatalogItem.CONTENT_LIVE:
        categories_action = 'get_live_categories'
        streams_action = 'get_live_streams'
        builder = _item_from_live
    elif content_type == CatalogItem.CONTENT_VOD:
        categories_action = 'get_vod_categories'
        streams_action = 'get_vod_streams'
        builder = _item_from_vod
    else:
        categories_action = 'get_series_categories'
        streams_action = 'get_series'
        builder = _item_from_series

    categories = xtream_raw_request(
        username,
        password,
        categories_action,
        use_cache=False,
    )
    if not isinstance(categories, list):
        return []

    def fetch_category(category: dict) -> list[CatalogItem]:
        category_id = str(category.get('category_id') or '')
        if not category_id:
            return []
        category_name = category.get('category_name') or ''
        streams = xtream_raw_request(
            username,
            password,
            streams_action,
            use_cache=False,
            category_id=category_id,
        )
        if not isinstance(streams, list):
            return []

        items: list[CatalogItem] = []
        for entry in streams:
            item_id = (
                entry.get('stream_id')
                if content_type != CatalogItem.CONTENT_SERIES
                else entry.get('series_id')
            )
            if not item_id:
                continue
            items.append(builder(entry, category_id, category_name))
        return items

    collected: list[CatalogItem] = []
    workers = _category_workers()
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = [pool.submit(fetch_category, category) for category in categories]
        for future in as_completed(futures):
            try:
                collected.extend(future.result())
            except Exception as exc:
                logger.warning('Error al leer categoría de %s: %s', content_type, exc)

    return collected


def _sync_type_all_accounts(content_type: str) -> int:
    accounts = list(IPTVAccount.objects.filter(enabled=True).order_by('name'))
    if not accounts:
        raise XtreamError('No hay cuentas IPTV habilitadas para indexar.', code='no_account')

    merged: dict[str, CatalogItem] = {}
    lock = threading.Lock()

    def collect_account(account: IPTVAccount) -> None:
        items = _collect_type(account.username, account.get_password(), content_type)
        if not items:
            return
        with lock:
            for item in items:
                merged[item.item_id] = item

    workers = _account_workers(len(accounts))
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = [pool.submit(collect_account, account) for account in accounts]
        for future in as_completed(futures):
            future.result()

    if not merged:
        return 0

    sync_started = timezone.now()
    return _bulk_upsert(list(merged.values()), content_type, sync_started)


def _fetch_vod_cast(username: str, password: str, item_id: str) -> tuple[str, str]:
    try:
        data = xtream_raw_request(username, password, 'get_vod_info', vod_id=item_id, use_cache=False)
    except XtreamError:
        return '', ''
    info = data.get('info') if isinstance(data, dict) else {}
    if not isinstance(info, dict):
        return '', ''
    cast = str(info.get('cast') or info.get('actors') or '')[:512]
    director = str(info.get('director') or '')
    return cast, director


def enrich_vod_cast(username: str, password: str, workers: int = 4, limit: int | None = None) -> int:
    batch_limit = limit or getattr(settings, 'CATALOG_ENRICH_BATCH_LIMIT', 300)
    pending = list(
        CatalogItem.objects.filter(content_type=CatalogItem.CONTENT_VOD, cast_display='')
        .values_list('item_id', 'name', 'extra')[:batch_limit]
    )
    if not pending:
        return 0

    updated = 0

    def enrich_one(row):
        item_id, name, extra = row
        cast, director = _fetch_vod_cast(username, password, item_id)
        genre = extra.get('genre', '') if isinstance(extra, dict) else ''
        return item_id, cast, build_search_text(name, cast=cast, director=director, genre=genre)

    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = [pool.submit(enrich_one, row) for row in pending]
        for future in as_completed(futures):
            try:
                item_id, cast, search_text = future.result()
            except Exception:
                continue
            CatalogItem.objects.filter(
                content_type=CatalogItem.CONTENT_VOD,
                item_id=item_id,
            ).update(cast_display=cast, search_text=search_text)
            updated += 1

    return updated


def start_vod_cast_enrichment(username: str, password: str) -> None:
    if not getattr(settings, 'CATALOG_ENRICH_CAST_ON_SYNC', True):
        return

    def run():
        try:
            count = enrich_vod_cast(username, password)
            if count:
                logger.info('VOD cast enrichment: %s items actualizados', count)
        except Exception as exc:
            logger.warning('VOD cast enrichment error: %s', exc)

    threading.Thread(target=run, daemon=True).start()


def _sync_interval() -> timedelta:
    hours = getattr(settings, 'CATALOG_SYNC_INTERVAL_HOURS', 4)
    return timedelta(hours=max(0.5, float(hours)))


def _catalog_is_empty() -> bool:
    counts = catalog_counts()
    return counts['live'] + counts['vod'] + counts['series'] == 0


def should_run_scheduled_sync() -> bool:
    state = _sync_state()
    if state.status == 'running':
        return False
    if _catalog_is_empty():
        return True
    if state.finished_at is None:
        return True
    return timezone.now() - state.finished_at >= _sync_interval()


def _try_acquire_scheduler_lock() -> bool:
    with connection.cursor() as cursor:
        cursor.execute('SELECT pg_try_advisory_lock(%s)', [SYNC_ADVISORY_LOCK_ID])
        row = cursor.fetchone()
    return bool(row and row[0])


def _release_scheduler_lock() -> None:
    with connection.cursor() as cursor:
        cursor.execute('SELECT pg_advisory_unlock(%s)', [SYNC_ADVISORY_LOCK_ID])


def _claim_sync_run(force: bool) -> CatalogSyncState | None:
    with transaction.atomic():
        state = CatalogSyncState.objects.select_for_update().get(pk=SYNC_KEY)
        if state.status == 'running' and not force:
            return None
        if not force and not _catalog_is_empty():
            if state.finished_at and timezone.now() - state.finished_at < _sync_interval():
                return None
        state.status = 'running'
        state.started_at = timezone.now()
        state.finished_at = None
        state.error_message = ''
        state.save(update_fields=['status', 'started_at', 'finished_at', 'error_message', 'updated_at'])
        return state


def sync_catalog_index(force: bool = False) -> CatalogSyncState:
    if not force and not should_run_scheduled_sync():
        return _sync_state()

    state = _claim_sync_run(force)
    if state is None:
        return _sync_state()

    account = _pick_account()
    username = account.username
    password = account.get_password()
    started = time.monotonic()

    try:
        content_types = [
            CatalogItem.CONTENT_LIVE,
            CatalogItem.CONTENT_VOD,
            CatalogItem.CONTENT_SERIES,
        ]
        type_workers = max(1, min(
            getattr(settings, 'CATALOG_SYNC_TYPE_WORKERS', 3),
            len(content_types),
        ))
        results: dict[str, int] = {}

        def sync_one(content_type: str) -> tuple[str, int]:
            return content_type, _sync_type_all_accounts(content_type)

        with ThreadPoolExecutor(max_workers=type_workers) as pool:
            futures = [pool.submit(sync_one, content_type) for content_type in content_types]
            for future in as_completed(futures):
                content_type, count = future.result()
                results[content_type] = count

        state.live_count = results.get(CatalogItem.CONTENT_LIVE, 0)
        state.vod_count = results.get(CatalogItem.CONTENT_VOD, 0)
        state.series_count = results.get(CatalogItem.CONTENT_SERIES, 0)
        state.status = 'ready'
        state.finished_at = timezone.now()
        state.save()
        elapsed = time.monotonic() - started
        logger.info(
            'Catálogo sincronizado en %.1fs: live=%s vod=%s series=%s',
            elapsed,
            state.live_count,
            state.vod_count,
            state.series_count,
        )
        start_vod_cast_enrichment(username, password)
    except Exception as exc:
        state.status = 'error'
        state.error_message = str(exc)[:2000]
        state.finished_at = timezone.now()
        state.save(update_fields=['status', 'error_message', 'finished_at', 'updated_at'])
        logger.exception('Error al sincronizar catálogo')
        raise

    return state


def catalog_counts() -> dict:
    return {
        'live': CatalogItem.objects.filter(content_type=CatalogItem.CONTENT_LIVE).count(),
        'vod': CatalogItem.objects.filter(content_type=CatalogItem.CONTENT_VOD).count(),
        'series': CatalogItem.objects.filter(content_type=CatalogItem.CONTENT_SERIES).count(),
    }


def sync_status_payload() -> dict:
    state = _sync_state()
    counts = catalog_counts()
    interval = _sync_interval()
    next_sync_at = None
    if state.finished_at and state.status == 'ready':
        next_sync_at = (state.finished_at + interval).isoformat()
    return {
        'status': state.status,
        'started_at': state.started_at.isoformat() if state.started_at else None,
        'finished_at': state.finished_at.isoformat() if state.finished_at else None,
        'next_sync_at': next_sync_at,
        'interval_hours': interval.total_seconds() / 3600,
        'counts': counts,
        'error': state.error_message or None,
        'ready': counts['live'] + counts['vod'] + counts['series'] > 0,
    }


def _scheduler_loop() -> None:
    poll_seconds = 300
    time.sleep(10)

    while True:
        try:
            connection.close_if_unusable_or_obsolete()
            if not _try_acquire_scheduler_lock():
                time.sleep(poll_seconds)
                continue
            try:
                if should_run_scheduled_sync():
                    sync_catalog_index(force=False)
            finally:
                _release_scheduler_lock()
        except Exception as exc:
            logger.exception('Catalog sync scheduler error: %s', exc)
        time.sleep(poll_seconds)


def start_catalog_sync_scheduler() -> None:
    global _scheduler_started
    if _scheduler_started:
        return
    _scheduler_started = True
    thread = threading.Thread(target=_scheduler_loop, name='catalog-sync-scheduler', daemon=True)
    thread.start()
    logger.info(
        'Programador de catálogo activo (cada %.1f h)',
        getattr(settings, 'CATALOG_SYNC_INTERVAL_HOURS', 4),
    )

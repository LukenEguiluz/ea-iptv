import re
import threading
import unicodedata
from concurrent.futures import ThreadPoolExecutor, as_completed

from django.db import transaction
from django.utils import timezone

from accounts.models import IPTVAccount
from api.xtream import XtreamError, xtream_raw_request
from library.models import CatalogItem, CatalogSyncState

SYNC_KEY = 'default'
BATCH_SIZE = 1000


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


def _sync_type(username: str, password: str, content_type: str) -> int:
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

    categories = xtream_raw_request(username, password, categories_action)
    if not isinstance(categories, list):
        return 0

    collected: list[CatalogItem] = []
    sync_started = timezone.now()
    for category in categories:
        category_id = str(category.get('category_id') or '')
        if not category_id:
            continue
        category_name = category.get('category_name') or ''
        streams = xtream_raw_request(
            username,
            password,
            streams_action,
            category_id=category_id,
        )
        if not isinstance(streams, list):
            continue
        for entry in streams:
            item_id = (
                entry.get('stream_id')
                if content_type != CatalogItem.CONTENT_SERIES
                else entry.get('series_id')
            )
            if not item_id:
                continue
            collected.append(builder(entry, category_id, category_name))

    return _bulk_upsert(collected, content_type, sync_started)


def _fetch_vod_cast(username: str, password: str, item_id: str) -> tuple[str, str]:
    try:
        data = xtream_raw_request(username, password, 'get_vod_info', vod_id=item_id)
    except XtreamError:
        return '', ''
    info = data.get('info') if isinstance(data, dict) else {}
    if not isinstance(info, dict):
        return '', ''
    cast = str(info.get('cast') or info.get('actors') or '')[:512]
    director = str(info.get('director') or '')
    return cast, director


def enrich_vod_cast(username: str, password: str, workers: int = 4) -> int:
    pending = list(
        CatalogItem.objects.filter(content_type=CatalogItem.CONTENT_VOD, cast_display='')
        .values_list('item_id', 'name', 'extra')[:5000]
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
    def run():
        try:
            total = 0
            while True:
                count = enrich_vod_cast(username, password)
                total += count
                if count == 0:
                    break
            if total:
                print(f'VOD cast enrichment complete: {total} items')
        except Exception as exc:
            print(f'VOD cast enrichment error: {exc}')

    threading.Thread(target=run, daemon=True).start()


def sync_catalog_index(force: bool = False) -> CatalogSyncState:
    state = _sync_state()
    if state.status == 'running' and not force:
        return state

    account = _pick_account()
    username = account.username
    password = account.get_password()

    state.status = 'running'
    state.started_at = timezone.now()
    state.finished_at = None
    state.error_message = ''
    state.save(update_fields=['status', 'started_at', 'finished_at', 'error_message', 'updated_at'])

    try:
        with transaction.atomic():
            state.live_count = _sync_type(username, password, CatalogItem.CONTENT_LIVE)
            state.vod_count = _sync_type(username, password, CatalogItem.CONTENT_VOD)
            state.series_count = _sync_type(username, password, CatalogItem.CONTENT_SERIES)
        state.status = 'ready'
        state.finished_at = timezone.now()
        state.save()
        start_vod_cast_enrichment(username, password)
    except Exception as exc:
        state.status = 'error'
        state.error_message = str(exc)[:2000]
        state.finished_at = timezone.now()
        state.save(update_fields=['status', 'error_message', 'finished_at', 'updated_at'])
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
    return {
        'status': state.status,
        'started_at': state.started_at.isoformat() if state.started_at else None,
        'finished_at': state.finished_at.isoformat() if state.finished_at else None,
        'counts': counts,
        'error': state.error_message or None,
        'ready': counts['live'] + counts['vod'] + counts['series'] > 0,
    }

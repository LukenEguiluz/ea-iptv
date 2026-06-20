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
from api.xtream import XtreamError, xtream_raw_request, xtream_sync_request
from library.models import CatalogItem, CatalogSyncState

logger = logging.getLogger(__name__)

SYNC_KEY = 'default'
BATCH_SIZE = 1000
SYNC_ADVISORY_LOCK_ID = 83927401
STALE_SYNC_MINUTES = 180
TYPE_LABELS = {
    CatalogItem.CONTENT_LIVE: 'TV en vivo',
    CatalogItem.CONTENT_VOD: 'Películas',
    CatalogItem.CONTENT_SERIES: 'Series',
}
TYPE_WEIGHTS = {
    CatalogItem.CONTENT_LIVE: 0.12,
    CatalogItem.CONTENT_VOD: 0.63,
    CatalogItem.CONTENT_SERIES: 0.25,
}
_scheduler_started = False
_progress_save_lock = threading.Lock()
_last_progress_save = 0.0


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


def _is_stale_running(state: CatalogSyncState) -> bool:
    if state.status != 'running':
        return False
    last_activity = state.updated_at or state.started_at
    if not last_activity:
        return False
    return timezone.now() - last_activity > timedelta(minutes=STALE_SYNC_MINUTES)


def _mark_stale_sync_failed(state: CatalogSyncState) -> CatalogSyncState:
    if not _is_stale_running(state):
        return state
    state.status = 'error'
    state.error_message = (
        'Sincronización interrumpida (superó el tiempo máximo). '
        'Pulsa «Actualizar catálogo ahora» para reintentar.'
    )
    state.progress_percent = 0
    state.progress_phase = ''
    state.progress_detail = ''
    state.finished_at = timezone.now()
    state.save(
        update_fields=[
            'status',
            'error_message',
            'progress_percent',
            'progress_phase',
            'progress_detail',
            'finished_at',
            'updated_at',
        ],
    )
    logger.warning('Sync de catálogo marcada como obsoleta (iniciada %s)', state.started_at)
    return state


def _short_xtream_error(exc: Exception) -> str:
    text = str(exc)
    if 'ConnectTimeout' in text or 'connect timeout' in text.lower():
        return 'Timeout de conexión con el proveedor'
    if 'ReadTimeout' in text or 'read timeout' in text.lower():
        return 'Timeout leyendo respuesta del proveedor'
    if 'Connection refused' in text:
        return 'Conexión rechazada por el proveedor'
    if 'Name or service not known' in text or 'Failed to resolve' in text:
        return 'No se pudo resolver el servidor del proveedor'
    if len(text) > 120:
        return text[:117] + '…'
    return text


def _save_sync_progress(
    state: CatalogSyncState,
    *,
    percent: int | None = None,
    phase: str | None = None,
    detail: str | None = None,
    last_error: str | None = None,
    retry_attempt: int | None = None,
    force: bool = False,
) -> None:
    global _last_progress_save
    now = time.monotonic()
    with _progress_save_lock:
        if not force and now - _last_progress_save < 2.0:
            return
        _last_progress_save = now

    update_fields = ['updated_at']
    if percent is not None:
        state.progress_percent = max(0, min(100, int(percent)))
        update_fields.append('progress_percent')
    if phase is not None:
        state.progress_phase = phase[:64]
        update_fields.append('progress_phase')
    if detail is not None:
        state.progress_detail = detail[:256]
        update_fields.append('progress_detail')
    if last_error is not None:
        state.progress_last_error = last_error[:256]
        update_fields.append('progress_last_error')
    if retry_attempt is not None:
        state.progress_retry_attempt = max(0, int(retry_attempt))
        update_fields.append('progress_retry_attempt')
    state.save(update_fields=update_fields)


def _sync_xtream(
    username: str,
    password: str,
    action: str,
    *,
    sync_state: CatalogSyncState | None = None,
    **params,
):
    def on_retry(attempt: int, delay: float, exc: Exception) -> None:
        error_text = _short_xtream_error(exc)
        logger.warning(
            'Sync Xtream %s intento %s falló (%s); reintento en %.1fs',
            action,
            attempt,
            error_text,
            delay,
        )
        if sync_state is None:
            return
        _save_sync_progress(
            sync_state,
            phase='Reconectando con proveedor…',
            detail=f'{action} · intento {attempt} · espera {int(delay)}s',
            last_error=error_text,
            retry_attempt=attempt,
            force=True,
        )

    return xtream_sync_request(
        username,
        password,
        action,
        on_retry=on_retry,
        **params,
    )


class _SyncProgressTracker:
    def __init__(self, state: CatalogSyncState):
        self.state = state
        self.lock = threading.Lock()
        self.types: dict[str, dict[int, tuple[int, int]]] = {}
        self.completed: set[str] = set()

    def category_progress(self, content_type: str, account_id: int, done: int, total: int) -> None:
        with self.lock:
            bucket = self.types.setdefault(content_type, {})
            bucket[account_id] = (done, total)
            percent, phase, detail = self._compute()
        _save_sync_progress(self.state, percent=percent, phase=phase, detail=detail)

    def type_completed(self, content_type: str) -> None:
        with self.lock:
            self.completed.add(content_type)
            self.types.setdefault(content_type, {})
            for account_id in list(self.types[content_type].keys()):
                done, total = self.types[content_type][account_id]
                if total:
                    self.types[content_type][account_id] = (total, total)
            percent, phase, detail = self._compute()
        _save_sync_progress(self.state, percent=percent, phase=phase, detail=detail, force=True)

    def _compute(self) -> tuple[int, str, str]:
        overall = 0.0
        active_phases: list[str] = []
        details: list[str] = []

        for content_type, weight in TYPE_WEIGHTS.items():
            acc_map = self.types.get(content_type, {})
            if content_type in self.completed:
                type_pct = 100.0
            elif not acc_map:
                type_pct = 0.0
            else:
                sum_done = sum(values[0] for values in acc_map.values())
                sum_total = sum(values[1] for values in acc_map.values())
                type_pct = (sum_done / sum_total * 100.0) if sum_total else 0.0

            overall += weight * type_pct

            label = TYPE_LABELS.get(content_type, content_type)
            if content_type in self.completed:
                continue
            if type_pct > 0:
                active_phases.append(label)
                if acc_map:
                    sum_done = sum(values[0] for values in acc_map.values())
                    sum_total = sum(values[1] for values in acc_map.values())
                    if sum_total:
                        details.append(f'{label} {int(type_pct)}%')

        if len(self.completed) == len(TYPE_WEIGHTS):
            return 99, 'Guardando índice…', ''

        phase = ', '.join(active_phases) if active_phases else 'Iniciando…'
        detail = ' · '.join(details[:3])
        return min(99, max(0, int(overall))), phase, detail


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


def _bulk_upsert(items: list[CatalogItem], content_type: str, sync_started, *, finalize: bool = False) -> int:
    if not items:
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

    if finalize:
        CatalogItem.objects.filter(content_type=content_type, updated_at__lt=sync_started).delete()
    return saved


def _category_workers() -> int:
    return max(1, getattr(settings, 'CATALOG_SYNC_CATEGORY_WORKERS', 10))


def _account_workers(account_count: int) -> int:
    configured = max(1, getattr(settings, 'CATALOG_SYNC_ACCOUNT_WORKERS', 5))
    return min(account_count, configured) if account_count else 1


def _collect_type(
    username: str,
    password: str,
    content_type: str,
    progress_cb=None,
    sync_state: CatalogSyncState | None = None,
) -> list[CatalogItem]:
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

    categories = _sync_xtream(
        username,
        password,
        categories_action,
        sync_state=sync_state,
    )
    if not isinstance(categories, list):
        return []

    def fetch_category(category: dict) -> list[CatalogItem]:
        category_id = str(category.get('category_id') or '')
        if not category_id:
            return []
        category_name = category.get('category_name') or ''
        try:
            streams = _sync_xtream(
                username,
                password,
                streams_action,
                sync_state=sync_state,
                category_id=category_id,
            )
        except XtreamError as exc:
            logger.error(
                'Error al leer categoría %s de %s: %s',
                category_id,
                content_type,
                exc.message,
            )
            return []
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
    total_categories = len(categories)
    if progress_cb and total_categories:
        progress_cb(0, total_categories)
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = [pool.submit(fetch_category, category) for category in categories]
        done_categories = 0
        for future in as_completed(futures):
            try:
                collected.extend(future.result())
            except Exception as exc:
                logger.warning('Error al leer categoría de %s: %s', content_type, exc)
            done_categories += 1
            if progress_cb and total_categories:
                progress_cb(done_categories, total_categories)

    return collected


def _sync_type_all_accounts(content_type: str, tracker: _SyncProgressTracker | None = None) -> int:
    accounts = list(IPTVAccount.objects.filter(enabled=True).order_by('name'))
    if not accounts:
        raise XtreamError('No hay cuentas IPTV habilitadas para indexar.', code='no_account')

    merged: dict[str, CatalogItem] = {}
    lock = threading.Lock()

    def collect_account(account: IPTVAccount) -> None:
        def on_category_progress(done: int, total: int) -> None:
            if tracker is not None:
                tracker.category_progress(content_type, account.pk, done, total)

        try:
            items = _collect_type(
                account.username,
                account.get_password(),
                content_type,
                progress_cb=on_category_progress if tracker else None,
                sync_state=tracker.state if tracker else None,
            )
        except Exception as exc:
            logger.exception(
                'Error indexando %s para cuenta %s: %s',
                content_type,
                account.name,
                exc,
            )
            return
        if not items:
            return
        with lock:
            for item in items:
                merged[item.item_id] = item

    workers = _account_workers(len(accounts))
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = [pool.submit(collect_account, account) for account in accounts]
        for future in as_completed(futures):
            try:
                future.result()
            except Exception as exc:
                logger.warning('Error en cuenta durante sync %s: %s', content_type, exc)

    if not merged:
        return 0

    sync_started = timezone.now()
    before_count = CatalogItem.objects.filter(content_type=content_type).count()
    items = list(merged.values())
    saved = _bulk_upsert(items, content_type, sync_started, finalize=False)
    should_finalize = not before_count or saved >= before_count * 0.95
    if should_finalize:
        CatalogItem.objects.filter(content_type=content_type, updated_at__lt=sync_started).delete()
        return saved

    logger.warning(
        'Sync %s incompleta (%s -> %s ítems); se conserva el índice anterior',
        content_type,
        before_count,
        saved,
    )
    return before_count


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
        if state.status == 'running':
            if not force:
                return None
            if not _is_stale_running(state):
                return None
            logger.warning('Reclamando sincronización obsoleta iniciada %s', state.started_at)
        if not force and not _catalog_is_empty():
            if state.finished_at and timezone.now() - state.finished_at < _sync_interval():
                return None
        state.status = 'running'
        state.started_at = timezone.now()
        state.finished_at = None
        state.error_message = ''
        state.progress_percent = 0
        state.progress_phase = 'Iniciando…'
        state.progress_detail = ''
        state.progress_last_error = ''
        state.progress_retry_attempt = 0
        state.save(
            update_fields=[
                'status',
                'started_at',
                'finished_at',
                'error_message',
                'progress_percent',
                'progress_phase',
                'progress_detail',
                'progress_last_error',
                'progress_retry_attempt',
                'updated_at',
            ],
        )
        return state


def sync_catalog_index(force: bool = False) -> CatalogSyncState:
    if not force and not should_run_scheduled_sync():
        return _sync_state()

    state = _claim_sync_run(force)
    if state is None:
        return _sync_state()

    logger.info('Iniciando sincronización de catálogo (force=%s)', force)
    account = _pick_account()
    username = account.username
    password = account.get_password()
    started = time.monotonic()
    tracker = _SyncProgressTracker(state)

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
            try:
                return content_type, _sync_type_all_accounts(content_type, tracker)
            except Exception as exc:
                logger.exception('Error sincronizando tipo %s: %s', content_type, exc)
                existing = CatalogItem.objects.filter(content_type=content_type).count()
                return content_type, existing

        with ThreadPoolExecutor(max_workers=type_workers) as pool:
            futures = [pool.submit(sync_one, content_type) for content_type in content_types]
            for future in as_completed(futures):
                try:
                    content_type, count = future.result()
                except Exception as exc:
                    logger.exception('Error inesperado en sync de tipo: %s', exc)
                    continue
                results[content_type] = count
                tracker.type_completed(content_type)

        state.live_count = results.get(CatalogItem.CONTENT_LIVE, 0)
        state.vod_count = results.get(CatalogItem.CONTENT_VOD, 0)
        state.series_count = results.get(CatalogItem.CONTENT_SERIES, 0)
        state.status = 'ready'
        state.progress_percent = 100
        state.progress_phase = 'Completado'
        state.progress_detail = ''
        state.progress_last_error = ''
        state.progress_retry_attempt = 0
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
        message = str(exc)[:2000]
        if 'xtream_connection_error' in message or 'ConnectTimeout' in message or 'timed out' in message.lower():
            message = (
                'Proveedor Xtream no alcanzable desde este servidor. '
                'El catálogo indexado sigue disponible; la reproducción requiere conexión al proveedor. '
                f'Detalle: {message[:500]}'
            )
        state.error_message = message
        state.progress_percent = 0
        state.progress_phase = ''
        state.progress_detail = ''
        state.finished_at = timezone.now()
        state.save(
            update_fields=[
                'status',
                'error_message',
                'progress_percent',
                'progress_phase',
                'progress_detail',
                'finished_at',
                'updated_at',
            ],
        )
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
    state = _mark_stale_sync_failed(_sync_state())
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
        'progress_percent': state.progress_percent,
        'progress_phase': state.progress_phase or None,
        'progress_detail': state.progress_detail or None,
        'progress_last_error': state.progress_last_error or None,
        'progress_retry_attempt': state.progress_retry_attempt or None,
        'stale': _is_stale_running(state),
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

from api.catalog_utils import rewrite_media_field
from library.catalog_sync import sync_status_payload
from library.models import CatalogItem

CATALOG_PAGE_MAX = 5000


def _parse_offset(value) -> int:
    try:
        return max(0, int(value))
    except (TypeError, ValueError):
        return 0


def _parse_page_limit(value, default: int = 300) -> int:
    try:
        return max(1, min(int(value), CATALOG_PAGE_MAX))
    except (TypeError, ValueError):
        return default


def catalog_index_ready() -> bool:
    return sync_status_payload()['ready']


def _item_payload(request, item: CatalogItem) -> dict:
    image = rewrite_media_field(request, item.image_url) if item.image_url else ''
    extra = item.extra if isinstance(item.extra, dict) else {}
    base = {
        'item_id': item.item_id,
        'category_id': item.category_id,
        'category_name': item.category_name,
    }

    if item.content_type == CatalogItem.CONTENT_LIVE:
        return {
            **base,
            'stream_id': item.item_id,
            'name': item.name,
            'stream_icon': image,
            'num': extra.get('num') or '',
        }

    if item.content_type == CatalogItem.CONTENT_SERIES:
        return {
            **base,
            'series_id': item.item_id,
            'name': item.name,
            'cover': image,
            'cover_big': image,
            'genre': extra.get('genre') or '',
            'rating': item.rating,
        }

    return {
        **base,
        'stream_id': item.item_id,
        'name': item.name,
        'stream_icon': image,
        'rating': item.rating,
        'year': item.year,
        'container_extension': item.container_extension or 'mp4',
    }


def list_categories_from_index(content_type: str) -> list[dict]:
    from django.db.models import Count

    rows = (
        CatalogItem.objects.filter(content_type=content_type)
        .values('category_id', 'category_name')
        .annotate(count=Count('id'))
        .order_by('category_name')
    )
    return [
        {
            'category_id': row['category_id'],
            'category_name': row['category_name'] or row['category_id'],
            'parent_id': 0,
        }
        for row in rows
        if row['category_id']
    ]


def list_catalog_from_index(
    request,
    *,
    content_type: str,
    category_id: str,
    offset: int = 0,
    limit: int = 300,
) -> dict:
    qs = CatalogItem.objects.filter(content_type=content_type)
    if category_id and category_id != 'all':
        qs = qs.filter(category_id=str(category_id))
    total = qs.count()
    items = list(qs.order_by('name')[offset:offset + limit])
    return {
        'total': total,
        'offset': offset,
        'limit': limit,
        'items': [_item_payload(request, item) for item in items],
    }


def paginate_list(items: list, offset: int, limit: int) -> dict:
    total = len(items)
    return {
        'total': total,
        'offset': offset,
        'limit': limit,
        'items': items[offset:offset + limit],
    }

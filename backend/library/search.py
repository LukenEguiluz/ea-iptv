import re

from django.db import connection
from django.db.models import Q

from library.models import CatalogItem

SEARCH_MIN_LENGTH = 2
SEARCH_MAX_LIMIT = 80


def _parse_limit(value) -> int:
    try:
        return max(1, min(int(value), SEARCH_MAX_LIMIT))
    except (TypeError, ValueError):
        return 40


def _tokenize(query: str) -> list[str]:
    normalized = re.sub(r'[^\w\s]', ' ', (query or '').strip().lower())
    return [token for token in normalized.split() if len(token) >= 2]


def search_catalog(query: str, content_type: str | None = None, limit: int = 40) -> list[CatalogItem]:
    query = (query or '').strip()
    if len(query) < SEARCH_MIN_LENGTH:
        return []

    limit = _parse_limit(limit)
    tokens = _tokenize(query)
    if not tokens:
        return []

    qs = CatalogItem.objects.all()
    if content_type in {
        CatalogItem.CONTENT_LIVE,
        CatalogItem.CONTENT_VOD,
        CatalogItem.CONTENT_SERIES,
    }:
        qs = qs.filter(content_type=content_type)

    for token in tokens:
        qs = qs.filter(
            Q(search_text__icontains=token)
            | Q(name_normalized__icontains=token)
            | Q(cast_display__icontains=token)
            | Q(category_name__icontains=token)
        )

    if connection.vendor == 'postgresql':
        prefix = tokens[0]
        qs = qs.extra(
            select={
                'rank': (
                    "CASE WHEN name_normalized LIKE %s THEN 0 "
                    "WHEN name_normalized LIKE %s THEN 1 "
                    "ELSE 2 END"
                ),
            },
            select_params=[f'{prefix}%', f'%{prefix}%'],
            order_by=['rank', 'name'],
        )
    else:
        qs = qs.order_by('name')

    return list(qs[:limit])

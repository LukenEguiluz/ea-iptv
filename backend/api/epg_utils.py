import base64
from datetime import datetime


def decode_epg_text(value: str | None) -> str:
    if not value or not isinstance(value, str):
        return ''
    raw = value.strip()
    if not raw:
        return ''
    try:
        decoded = base64.b64decode(raw, validate=False).decode('utf-8')
        if decoded:
            return decoded
    except (ValueError, UnicodeDecodeError):
        pass
    return raw


def normalize_epg_listing(item: dict) -> dict:
    if not isinstance(item, dict):
        return {}
    start = item.get('start') or ''
    end = item.get('end') or ''
    now = datetime.now()
    is_now = False
    try:
        start_dt = datetime.strptime(start, '%Y-%m-%d %H:%M:%S')
        end_dt = datetime.strptime(end, '%Y-%m-%d %H:%M:%S')
        is_now = start_dt <= now <= end_dt
    except ValueError:
        pass
    return {
        'id': item.get('id'),
        'title': decode_epg_text(item.get('title')),
        'description': decode_epg_text(item.get('description')),
        'start': start,
        'end': end,
        'start_timestamp': item.get('start_timestamp'),
        'stop_timestamp': item.get('stop_timestamp'),
        'now': is_now,
    }


def normalize_epg_list(data) -> list[dict]:
    if isinstance(data, dict):
        listings = data.get('epg_listings') or []
    elif isinstance(data, list):
        listings = data
    else:
        listings = []
    return [normalize_epg_listing(item) for item in listings if isinstance(item, dict)]

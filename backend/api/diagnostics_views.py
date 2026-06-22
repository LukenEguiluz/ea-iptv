from time import perf_counter

from django.conf import settings
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from sessions.services import SessionError, get_current_session

from .catalog_views import CatalogBaseView
from .xtream import (
    XtreamError,
    get_credentials,
    live_stream_url,
    _player_api_url,
    _server_url,
    xtream_request,
)


def _client_ip(request) -> str | None:
    forwarded = request.META.get('HTTP_X_FORWARDED_FOR')
    if forwarded:
        return forwarded.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR')


def _count(data) -> int | None:
    if isinstance(data, list):
        return len(data)
    if isinstance(data, dict):
        if 'episodes' in data:
            return sum(len(eps) for eps in data['episodes'].values())
        return len(data)
    return None


def _run_check(name: str, fn) -> dict:
    started = perf_counter()
    try:
        data = fn()
        elapsed_ms = round((perf_counter() - started) * 1000)
        return {
            'name': name,
            'ok': True,
            'ms': elapsed_ms,
            'count': _count(data),
            'detail': 'OK',
        }
    except XtreamError as exc:
        elapsed_ms = round((perf_counter() - started) * 1000)
        return {
            'name': name,
            'ok': False,
            'ms': elapsed_ms,
            'count': None,
            'detail': exc.message,
            'code': exc.code,
        }
    except SessionError as exc:
        elapsed_ms = round((perf_counter() - started) * 1000)
        return {
            'name': name,
            'ok': False,
            'ms': elapsed_ms,
            'count': None,
            'detail': exc.message,
            'code': exc.code,
        }


class DiagnosticsView(CatalogBaseView):
    def get(self, request):
        ip = _client_ip(request)
        session = get_current_session(request.user.username)
        username, password = get_credentials(request.user, ip_address=ip)
        server = _server_url()

        checks = [
            _run_check(
                'auth',
                lambda: xtream_request(request.user, 'get_account_info', ip_address=ip),
            ),
            _run_check(
                'live_categories',
                lambda: xtream_request(request.user, 'get_live_categories', ip_address=ip),
            ),
            _run_check(
                'live_streams',
                lambda: xtream_request(request.user, 'get_live_streams', ip_address=ip),
            ),
            _run_check(
                'vod_categories',
                lambda: xtream_request(request.user, 'get_vod_categories', ip_address=ip),
            ),
            _run_check(
                'vod_streams',
                lambda: xtream_request(request.user, 'get_vod_streams', ip_address=ip),
            ),
            _run_check(
                'series_categories',
                lambda: xtream_request(request.user, 'get_series_categories', ip_address=ip),
            ),
            _run_check(
                'series',
                lambda: xtream_request(request.user, 'get_series', ip_address=ip),
            ),
        ]

        sample_live_id = None
        try:
            live = xtream_request(request.user, 'get_live_streams', ip_address=ip)
            if isinstance(live, list) and live:
                sample_live_id = live[0].get('stream_id')
        except (XtreamError, SessionError):
            pass

        commands = [
            {
                'label': 'API del reproductor',
                'url': f'{_player_api_url()}?username={username}&password={password}',
            },
            {
                'label': 'Lista M3U Plus',
                'url': f'{server}/get.php?username={username}&password={password}&type=m3u_plus&output=ts',
            },
            {
                'label': 'Lista M3U simple',
                'url': f'{server}/get.php?username={username}&password={password}&type=m3u&output=ts',
            },
            {
                'label': 'Guía EPG (XMLTV)',
                'url': f'{server}/xmltv.php?username={username}&password={password}',
            },
        ]
        if sample_live_id:
            commands.append({
                'label': 'Ejemplo canal en vivo (HLS)',
                'url': live_stream_url(username, password, sample_live_id),
            })
            commands.append({
                'label': 'Ejemplo película (formato)',
                'url': f'{server}/movie/{username}/{password}/{{vod_id}}.{{ext}}',
            })
            commands.append({
                'label': 'Ejemplo serie (formato)',
                'url': f'{server}/series/{username}/{password}/{{episode_id}}.{{ext}}',
            })

        return Response({
            'server_url': server,
            'configured_server': getattr(settings, 'XTREAM_SERVER_URL', ''),
            'gateway_user': request.user.username,
            'session': {
                'active': session is not None,
                'account_name': session.account_assigned.name if session else None,
                'account_username': username,
            },
            'checks': checks,
            'summary': {
                'passed': sum(1 for c in checks if c['ok']),
                'failed': sum(1 for c in checks if not c['ok']),
                'total_ms': sum(c['ms'] for c in checks),
            },
            'commands': commands,
        })


from .xtream import server_outbound_ip


class DiagnosticsConfigView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({
            'server_url': getattr(settings, 'XTREAM_SERVER_URL', ''),
            'server_outbound_ip': server_outbound_ip(),
            'session_inactivity_minutes': getattr(settings, 'SESSION_INACTIVITY_MINUTES', 5),
            'client_direct_playback': getattr(settings, 'CLIENT_DIRECT_PLAYBACK', True),
            'catalog_use_index': getattr(settings, 'CATALOG_USE_INDEX', False),
            'catalog_sync_enabled': getattr(settings, 'CATALOG_SYNC_ENABLED', False),
            'catalog_mode': 'indexed' if getattr(settings, 'CATALOG_USE_INDEX', False) else 'on_demand',
        })

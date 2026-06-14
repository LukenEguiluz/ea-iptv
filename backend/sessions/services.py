from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from accounts.models import IPTVAccount

from .models import UserSession


class SessionError(Exception):
    def __init__(self, message: str, code: str = 'session_error'):
        self.message = message
        self.code = code
        super().__init__(message)


class NoAccountAvailableError(SessionError):
    def __init__(self):
        super().__init__(
            'No hay cuentas IPTV disponibles con capacidad.',
            code='no_account_available',
        )


def inactivity_threshold():
    minutes = getattr(settings, 'SESSION_INACTIVITY_MINUTES', 5)
    return timezone.now() - timedelta(minutes=minutes)


def release_inactive_sessions() -> int:
    cutoff = inactivity_threshold()
    expired = UserSession.objects.filter(
        status=UserSession.Status.ACTIVE,
        last_seen__lt=cutoff,
    )
    count = expired.count()
    expired.update(
        status=UserSession.Status.EXPIRED,
        ended_at=timezone.now(),
    )
    return count


def _select_account(user_identifier: str) -> IPTVAccount | None:
    dedicated = IPTVAccount.objects.filter(
        enabled=True,
        name__iexact=user_identifier,
    ).first()
    if dedicated and dedicated.has_capacity():
        return dedicated

    candidates = IPTVAccount.objects.filter(enabled=True).order_by('name')
    best = None
    best_load = None
    for account in candidates:
        if not account.has_capacity():
            continue
        load = account.active_connections
        if best is None or load < best_load:
            best = account
            best_load = load
    return best


@transaction.atomic
def start_session(user_identifier: str, ip_address: str | None = None) -> UserSession:
    release_inactive_sessions()

    existing = UserSession.objects.filter(
        user_identifier=user_identifier,
        status=UserSession.Status.ACTIVE,
    ).select_for_update().first()
    if existing:
        existing.touch()
        return existing

    account = _select_account(user_identifier)
    if account is None:
        raise NoAccountAvailableError()

    account_locked = IPTVAccount.objects.select_for_update().get(pk=account.pk)
    if not account_locked.has_capacity():
        raise NoAccountAvailableError()

    return UserSession.objects.create(
        user_identifier=user_identifier,
        ip_address=ip_address,
        account_assigned=account_locked,
    )


def heartbeat_session(user_identifier: str, session_id: int | None = None) -> UserSession:
    release_inactive_sessions()

    qs = UserSession.objects.filter(
        user_identifier=user_identifier,
        status=UserSession.Status.ACTIVE,
    )
    if session_id is not None:
        qs = qs.filter(pk=session_id)

    session = qs.first()
    if session is None:
        raise SessionError('No hay sesión activa.', code='session_not_found')
    session.touch()
    return session


def end_session(user_identifier: str, session_id: int | None = None) -> UserSession | None:
    qs = UserSession.objects.filter(
        user_identifier=user_identifier,
        status=UserSession.Status.ACTIVE,
    )
    if session_id is not None:
        qs = qs.filter(pk=session_id)

    session = qs.first()
    if session is None:
        return None
    session.mark_ended()
    return session


def get_current_session(user_identifier: str) -> UserSession | None:
    release_inactive_sessions()
    return UserSession.objects.filter(
        user_identifier=user_identifier,
        status=UserSession.Status.ACTIVE,
    ).select_related('account_assigned').first()


def force_disconnect(session_id: int) -> UserSession | None:
    session = UserSession.objects.filter(
        pk=session_id,
        status=UserSession.Status.ACTIVE,
    ).first()
    if session is None:
        return None
    session.mark_ended()
    return session

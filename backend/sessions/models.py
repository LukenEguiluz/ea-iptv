from django.db import models
from django.utils import timezone

from accounts.models import IPTVAccount


class UserSession(models.Model):
    class Status(models.TextChoices):
        ACTIVE = 'active', 'Activa'
        ENDED = 'ended', 'Finalizada'
        EXPIRED = 'expired', 'Expirada'

    user_identifier = models.CharField(max_length=150, db_index=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    started_at = models.DateTimeField(default=timezone.now)
    last_seen = models.DateTimeField(default=timezone.now)
    account_assigned = models.ForeignKey(
        IPTVAccount,
        on_delete=models.PROTECT,
        related_name='user_sessions',
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.ACTIVE,
        db_index=True,
    )
    ended_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = 'Sesión de usuario'
        verbose_name_plural = 'Sesiones de usuario'
        ordering = ['-started_at']
        indexes = [
            models.Index(fields=['user_identifier', 'status']),
            models.Index(fields=['status', 'last_seen']),
        ]

    def __str__(self):
        return f'{self.user_identifier} → {self.account_assigned.name} ({self.status})'

    def mark_ended(self):
        self.status = self.Status.ENDED
        self.ended_at = timezone.now()
        self.save(update_fields=['status', 'ended_at'])

    def mark_expired(self):
        self.status = self.Status.EXPIRED
        self.ended_at = timezone.now()
        self.save(update_fields=['status', 'ended_at'])

    def touch(self):
        self.last_seen = timezone.now()
        self.save(update_fields=['last_seen'])

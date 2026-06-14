from django.db import models

from .encryption import decrypt_secret, encrypt_secret


class IPTVAccount(models.Model):
    name = models.CharField(max_length=100, unique=True)
    username = models.CharField(max_length=255)
    password_encrypted = models.TextField(blank=True, default='')
    max_connections = models.PositiveIntegerField(default=2)
    enabled = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Cuenta IPTV'
        verbose_name_plural = 'Cuentas IPTV'
        ordering = ['name']

    def __str__(self):
        return self.name

    @property
    def active_connections(self) -> int:
        from sessions.models import UserSession

        return UserSession.objects.filter(
            account_assigned=self,
            status=UserSession.Status.ACTIVE,
        ).count()

    @property
    def available_slots(self) -> int:
        return max(0, self.max_connections - self.active_connections)

    def set_password(self, plain: str) -> None:
        self.password_encrypted = encrypt_secret(plain)

    def get_password(self) -> str:
        return decrypt_secret(self.password_encrypted)

    def has_capacity(self) -> bool:
        return self.enabled and self.active_connections < self.max_connections

import os

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from accounts.encryption import encrypt_secret
from accounts.models import IPTVAccount

ACCOUNT_NAMES = ['Luken', 'Rebe', 'Helios', 'Carmen', 'Arturo']


class Command(BaseCommand):
    help = 'Sincroniza cuentas IPTV y usuarios API desde variables de entorno.'

    def handle(self, *args, **options):
        User = get_user_model()
        accounts = 0
        users = 0

        for name in ACCOUNT_NAMES:
            prefix = name.upper()
            username = os.environ.get(f'IPTV_ACCOUNT_{prefix}_USERNAME', '').strip()
            password = os.environ.get(f'IPTV_ACCOUNT_{prefix}_PASSWORD', '').strip()
            configured = bool(username and password)

            account, _ = IPTVAccount.objects.get_or_create(
                name=name,
                defaults={
                    'username': username,
                    'max_connections': 2,
                    'enabled': configured,
                },
            )
            if configured:
                account.username = username
                account.password_encrypted = encrypt_secret(password)
                account.max_connections = 2
                account.enabled = True
                account.save()
                accounts += 1

            user_password = os.environ.get(f'IPTV_USER_{prefix}_PASSWORD', '').strip() or password
            if user_password:
                user, created = User.objects.get_or_create(
                    username=name.lower(),
                    defaults={'first_name': name},
                )
                user.set_password(user_password)
                user.save()
                users += 1

        self.stdout.write(self.style.SUCCESS(
            f'Cuentas actualizadas: {accounts}, usuarios API: {users}'
        ))

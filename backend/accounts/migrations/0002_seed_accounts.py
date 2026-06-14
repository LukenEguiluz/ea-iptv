import os

from django.db import migrations

from accounts.encryption import encrypt_secret


ACCOUNT_NAMES = ['Luken', 'Rebe', 'Helios', 'Carmen', 'Arturo']


def seed_accounts(apps, schema_editor):
    IPTVAccount = apps.get_model('accounts', 'IPTVAccount')
    User = apps.get_model('auth', 'User')

    for name in ACCOUNT_NAMES:
        env_key = f'IPTV_ACCOUNT_{name.upper()}_PASSWORD'
        password = os.environ.get(env_key, '').strip()
        username = os.environ.get(f'IPTV_ACCOUNT_{name.upper()}_USERNAME', name.lower()).strip()

        account, _ = IPTVAccount.objects.get_or_create(
            name=name,
            defaults={
                'username': username,
                'max_connections': 2,
                'enabled': bool(password),
            },
        )
        if password:
            account.username = username
            account.password_encrypted = encrypt_secret(password)
            account.max_connections = 2
            account.enabled = True
            account.save()

        user_password = (
            os.environ.get(f'IPTV_USER_{name.upper()}_PASSWORD', '').strip()
            or password
        )
        if user_password:
            user, user_created = User.objects.get_or_create(
                username=name.lower(),
                defaults={'first_name': name},
            )
            if user_created or not user.has_usable_password():
                user.set_password(user_password)
                user.save()


def unseed(apps, schema_editor):
    IPTVAccount = apps.get_model('accounts', 'IPTVAccount')
    User = apps.get_model('auth', 'User')
    IPTVAccount.objects.filter(name__in=ACCOUNT_NAMES).delete()
    User.objects.filter(username__in=[n.lower() for n in ACCOUNT_NAMES]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0001_initial'),
        ('auth', '0012_alter_user_first_name_max_length'),
    ]

    operations = [
        migrations.RunPython(seed_accounts, unseed),
    ]

# Generated manually for IPTV Gateway

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name='IPTVAccount',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=100, unique=True)),
                ('username', models.CharField(max_length=255)),
                ('password_encrypted', models.TextField(blank=True, default='')),
                ('max_connections', models.PositiveIntegerField(default=2)),
                ('enabled', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'verbose_name': 'Cuenta IPTV',
                'verbose_name_plural': 'Cuentas IPTV',
                'ordering': ['name'],
            },
        ),
    ]

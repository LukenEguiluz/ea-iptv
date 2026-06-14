# Generated manually for IPTV Gateway

import django.db.models.deletion
import django.utils.timezone
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('accounts', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='UserSession',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('user_identifier', models.CharField(db_index=True, max_length=150)),
                ('ip_address', models.GenericIPAddressField(blank=True, null=True)),
                ('started_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('last_seen', models.DateTimeField(default=django.utils.timezone.now)),
                ('status', models.CharField(choices=[('active', 'Activa'), ('ended', 'Finalizada'), ('expired', 'Expirada')], db_index=True, default='active', max_length=20)),
                ('ended_at', models.DateTimeField(blank=True, null=True)),
                ('account_assigned', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='user_sessions', to='accounts.iptvaccount')),
            ],
            options={
                'verbose_name': 'Sesión de usuario',
                'verbose_name_plural': 'Sesiones de usuario',
                'ordering': ['-started_at'],
                'indexes': [
                    models.Index(fields=['user_identifier', 'status'], name='iptv_sessio_user_id_8a1f0d_idx'),
                    models.Index(fields=['status', 'last_seen'], name='iptv_sessio_status_4b2c1a_idx'),
                ],
            },
        ),
    ]

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('library', '0003_catalogsyncstate_progress'),
    ]

    operations = [
        migrations.AddField(
            model_name='catalogsyncstate',
            name='progress_last_error',
            field=models.CharField(blank=True, default='', max_length=256),
        ),
        migrations.AddField(
            model_name='catalogsyncstate',
            name='progress_retry_attempt',
            field=models.PositiveSmallIntegerField(default=0),
        ),
    ]

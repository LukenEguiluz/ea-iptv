from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('library', '0004_catalogsyncstate_progress_error'),
    ]

    operations = [
        migrations.AddField(
            model_name='catalogsyncstate',
            name='sync_scope',
            field=models.CharField(blank=True, default='', max_length=32),
        ),
    ]

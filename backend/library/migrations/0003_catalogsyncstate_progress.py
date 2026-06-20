from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('library', '0002_catalogitem_cast_display_catalogitem_search_text_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='catalogsyncstate',
            name='progress_detail',
            field=models.CharField(blank=True, default='', max_length=256),
        ),
        migrations.AddField(
            model_name='catalogsyncstate',
            name='progress_percent',
            field=models.PositiveSmallIntegerField(default=0),
        ),
        migrations.AddField(
            model_name='catalogsyncstate',
            name='progress_phase',
            field=models.CharField(blank=True, default='', max_length=64),
        ),
    ]

from django.core.management.base import BaseCommand

from accounts.models import IPTVAccount
from library.catalog_sync import enrich_vod_cast, start_vod_cast_enrichment


class Command(BaseCommand):
    help = 'Enriquece películas con reparto y directores para búsqueda por actor.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--workers',
            type=int,
            default=4,
            help='Hilos paralelos (menos = menos RAM, default 4).',
        )

    def handle(self, *args, **options):
        workers = max(1, min(options['workers'], 16))
        account = IPTVAccount.objects.filter(enabled=True).order_by('name').first()
        if account is None:
            self.stderr.write('No hay cuentas IPTV habilitadas.')
            return
        self.stdout.write(f'Enriqueciendo reparto de películas ({workers} hilos)…')
        total = 0
        while True:
            count = enrich_vod_cast(account.username, account.get_password(), workers=workers)
            total += count
            self.stdout.write(f'  +{count} (total {total})')
            if count == 0:
                break
        self.stdout.write(self.style.SUCCESS(f'Listo: {total} películas con reparto.'))

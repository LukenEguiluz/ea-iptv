from django.core.management.base import BaseCommand

from library.catalog_sync import sync_catalog_index, sync_status_payload


class Command(BaseCommand):
    help = 'Sincroniza el índice local de búsqueda con el catálogo Xtream.'

    def add_arguments(self, parser):
        parser.add_argument('--force', action='store_true', help='Forzar sincronización aunque ya esté en curso')
        parser.add_argument(
            '--types',
            default='live',
            help='Tipos a sincronizar: live, vod, series (separados por coma). Por defecto: live',
        )

    def handle(self, *args, **options):
        self.stdout.write('Iniciando sincronización del catálogo…')
        sync_catalog_index(force=options['force'], content_types=options['types'])
        state = sync_status_payload()
        self.stdout.write(self.style.SUCCESS(
            f"Listo: live={state['counts']['live']} vod={state['counts']['vod']} series={state['counts']['series']}"
        ))

from django.apps import AppConfig


class LibraryConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'library'
    verbose_name = 'Biblioteca'

    def ready(self):
        import sys

        if 'migrate' in sys.argv or 'makemigrations' in sys.argv:
            return
        if 'test' in sys.argv:
            return

        from library.catalog_sync import start_catalog_sync_scheduler

        start_catalog_sync_scheduler()

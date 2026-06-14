from django.core.management.base import BaseCommand

from sessions.services import release_inactive_sessions


class Command(BaseCommand):
    help = 'Libera sesiones inactivas según SESSION_INACTIVITY_MINUTES.'

    def handle(self, *args, **options):
        count = release_inactive_sessions()
        self.stdout.write(self.style.SUCCESS(f'Sesiones expiradas: {count}'))

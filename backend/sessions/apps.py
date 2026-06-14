from django.apps import AppConfig


class IptvSessionsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'sessions'
    label = 'iptv_sessions'
    verbose_name = 'Sesiones IPTV'

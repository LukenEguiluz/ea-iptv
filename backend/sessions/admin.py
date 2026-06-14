from django.contrib import admin
from django.utils import timezone

from .models import UserSession
from .services import force_disconnect


@admin.register(UserSession)
class UserSessionAdmin(admin.ModelAdmin):
    list_display = (
        'id',
        'user_identifier',
        'account_assigned',
        'status',
        'ip_address',
        'started_at',
        'last_seen',
        'duration_display',
    )
    list_filter = ('status', 'account_assigned')
    search_fields = ('user_identifier', 'ip_address')
    readonly_fields = (
        'user_identifier',
        'ip_address',
        'started_at',
        'last_seen',
        'account_assigned',
        'status',
        'ended_at',
    )
    actions = ['disconnect_selected']

    def duration_display(self, obj):
        end = obj.ended_at or timezone.now()
        delta = end - obj.started_at
        minutes = int(delta.total_seconds() // 60)
        return f'{minutes} min'

    duration_display.short_description = 'Duración'

    @admin.action(description='Forzar desconexión de sesiones seleccionadas')
    def disconnect_selected(self, request, queryset):
        count = 0
        for session in queryset.filter(status=UserSession.Status.ACTIVE):
            force_disconnect(session.pk)
            count += 1
        self.message_user(request, f'{count} sesión(es) desconectada(s).')

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

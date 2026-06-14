from django.contrib import admin

from .models import IPTVAccount


@admin.register(IPTVAccount)
class IPTVAccountAdmin(admin.ModelAdmin):
    list_display = (
        'name',
        'username',
        'max_connections',
        'active_connections_display',
        'enabled',
        'updated_at',
    )
    list_filter = ('enabled',)
    search_fields = ('name', 'username')
    readonly_fields = ('active_connections_display', 'created_at', 'updated_at')

    fieldsets = (
        (None, {
            'fields': ('name', 'username', 'password_plain', 'max_connections', 'enabled'),
        }),
        ('Estado', {
            'fields': ('active_connections_display', 'created_at', 'updated_at'),
        }),
    )

    def active_connections_display(self, obj):
        return obj.active_connections

    active_connections_display.short_description = 'Conexiones activas'

    def get_readonly_fields(self, request, obj=None):
        readonly = list(super().get_readonly_fields(request, obj))
        if obj:
            readonly.append('name')
        return readonly

    def save_model(self, request, obj, form, change):
        plain = form.cleaned_data.get('password_plain')
        if plain:
            obj.set_password(plain)
        super().save_model(request, obj, form, change)

    def get_form(self, request, obj=None, **kwargs):
        form = super().get_form(request, obj, **kwargs)
        from django import forms

        class IPTVAccountForm(form):
            password_plain = forms.CharField(
                label='Contraseña Xtream',
                required=False,
                widget=forms.PasswordInput(render_value=False),
                help_text='Dejar vacío para mantener la contraseña actual.',
            )

        return IPTVAccountForm

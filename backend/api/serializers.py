from rest_framework import serializers

from accounts.models import IPTVAccount
from sessions.models import UserSession


class IPTVAccountCredentialsSerializer(serializers.ModelSerializer):
    password = serializers.SerializerMethodField()
    active_connections = serializers.IntegerField(read_only=True)

    class Meta:
        model = IPTVAccount
        fields = (
            'id',
            'name',
            'username',
            'password',
            'max_connections',
            'active_connections',
        )

    def get_password(self, obj):
        return obj.get_password()


class UserSessionSerializer(serializers.ModelSerializer):
    account = IPTVAccountCredentialsSerializer(source='account_assigned', read_only=True)

    class Meta:
        model = UserSession
        fields = (
            'id',
            'user_identifier',
            'ip_address',
            'started_at',
            'last_seen',
            'status',
            'account',
        )


class SessionStartSerializer(serializers.Serializer):
    pass


class SessionHeartbeatSerializer(serializers.Serializer):
    session_id = serializers.IntegerField(required=False)


class SessionEndSerializer(serializers.Serializer):
    session_id = serializers.IntegerField(required=False)

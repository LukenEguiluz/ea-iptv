from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from sessions.services import (
    SessionError,
    end_session,
    get_current_session,
    heartbeat_session,
    start_session,
)

from .serializers import (
    SessionEndSerializer,
    SessionHeartbeatSerializer,
    UserSessionSerializer,
)


def _client_ip(request) -> str | None:
    forwarded = request.META.get('HTTP_X_FORWARDED_FOR')
    if forwarded:
        return forwarded.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR')


class SessionStartView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user_id = request.user.username
        try:
            session = start_session(user_id, ip_address=_client_ip(request))
        except SessionError as exc:
            return Response({'detail': exc.message, 'code': exc.code}, status=status.HTTP_409_CONFLICT)
        return Response(UserSessionSerializer(session).data, status=status.HTTP_201_CREATED)


class SessionHeartbeatView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = SessionHeartbeatSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user_id = request.user.username
        try:
            session = heartbeat_session(user_id, serializer.validated_data.get('session_id'))
        except SessionError as exc:
            return Response({'detail': exc.message, 'code': exc.code}, status=status.HTTP_404_NOT_FOUND)
        return Response(UserSessionSerializer(session).data)


class SessionEndView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = SessionEndSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user_id = request.user.username
        session = end_session(user_id, serializer.validated_data.get('session_id'))
        if session is None:
            return Response({'detail': 'No hay sesión activa.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(UserSessionSerializer(session).data)


class SessionCurrentView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        session = get_current_session(request.user.username)
        if session is None:
            return Response({'detail': 'No hay sesión activa.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(UserSessionSerializer(session).data)

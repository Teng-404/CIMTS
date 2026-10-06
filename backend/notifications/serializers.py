from rest_framework import serializers

from .models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    at = serializers.SerializerMethodField()
    incident = serializers.CharField(source="incident.code", read_only=True, default=None)
    isRead = serializers.BooleanField(source="is_read", read_only=True)

    class Meta:
        model = Notification
        fields = ["id", "incident", "kind", "message", "isRead", "at"]

    def get_at(self, obj):
        return int(obj.created_at.timestamp() * 1000)

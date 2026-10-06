from django.db.models import Count, ProtectedError
from rest_framework import status, viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.permissions import IsAdminOrReadOnly

from .models import IncidentType, Priority, Zone
from .serializers import (IncidentTypeSerializer, PrioritySerializer,
                          ReferenceDataSerializer, ZoneSerializer)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def reference(request):
    """ข้อมูลอ้างอิงทั้งหมดใน request เดียว — shared.js โหลดครั้งเดียวตอนเปิดหน้า"""
    return Response(ReferenceDataSerializer.build())


class ProtectedDeleteMixin:
    """
    ข้อมูลอ้างอิงที่มีเหตุอ้างถึงอยู่จะลบไม่ได้ (FK เป็น PROTECT)
    แทนที่จะปล่อยให้เป็น error 500 ให้ตอบข้อความที่ผู้ใช้เข้าใจ
    และแนะนำให้ปิดการใช้งานแทนการลบ เพื่อรักษาประวัติเดิมไว้
    """

    def destroy(self, request, *args, **kwargs):
        try:
            return super().destroy(request, *args, **kwargs)
        except ProtectedError:
            return Response(
                {"detail": "ลบไม่ได้เพราะมีรายการแจ้งเหตุใช้ข้อมูลนี้อยู่ "
                           "แนะนำให้ปิดการใช้งานแทน เพื่อไม่ให้เลือกใหม่ได้แต่ยังเก็บประวัติเดิมไว้"},
                status=status.HTTP_409_CONFLICT,
            )


class IncidentTypeViewSet(ProtectedDeleteMixin, viewsets.ModelViewSet):
    queryset = IncidentType.objects.annotate(incident_count=Count("incidents"))
    serializer_class = IncidentTypeSerializer
    permission_classes = [IsAdminOrReadOnly]


class ZoneViewSet(ProtectedDeleteMixin, viewsets.ModelViewSet):
    queryset = Zone.objects.annotate(incident_count=Count("incidents"))
    serializer_class = ZoneSerializer
    permission_classes = [IsAdminOrReadOnly]


class PriorityViewSet(ProtectedDeleteMixin, viewsets.ModelViewSet):
    queryset = Priority.objects.all()
    serializer_class = PrioritySerializer
    permission_classes = [IsAdminOrReadOnly]

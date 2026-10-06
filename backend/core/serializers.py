from rest_framework import serializers

from .models import IncidentType, Priority, Zone


class IncidentTypeSerializer(serializers.ModelSerializer):
    """ตรงกับรูปแบบ CATEGORIES ใน shared.js: { key: { label, dept, color } }"""

    isActive = serializers.BooleanField(source="is_active", required=False)
    # จำนวนเหตุที่ใช้ประเภทนี้อยู่ — ใช้เตือนก่อนลบ (annotate มาจาก ViewSet)
    incidentCount = serializers.IntegerField(source="incident_count", read_only=True, default=0)

    class Meta:
        model = IncidentType
        fields = ["key", "label", "dept", "color", "isActive", "order", "incidentCount"]


class ZoneSerializer(serializers.ModelSerializer):
    isActive = serializers.BooleanField(source="is_active", required=False)
    incidentCount = serializers.IntegerField(source="incident_count", read_only=True, default=0)

    class Meta:
        model = Zone
        fields = ["name", "isActive", "order", "incidentCount"]


class PrioritySerializer(serializers.ModelSerializer):
    """ตรงกับ PRIORITIES ใน shared.js — รวม SLA (ฝั่ง admin/officer) และ examples/note (ฝั่งผู้แจ้ง)"""

    assignSec = serializers.IntegerField(source="assign_sec", read_only=True)
    resolveSec = serializers.IntegerField(source="resolve_sec", read_only=True)
    autoAssign = serializers.BooleanField(source="auto_assign", read_only=True)

    class Meta:
        model = Priority
        fields = ["key", "label", "rank", "assignSec", "resolveSec", "autoAssign", "note", "examples"]


class ReferenceDataSerializer(serializers.Serializer):
    """
    รวมข้อมูลอ้างอิงทั้งหมดใน request เดียว เพื่อให้ shared.js โหลดครั้งเดียวตอนเปิดหน้า
    คืนค่าเป็น dict แบบเดียวกับค่าคงที่เดิม จึงนำไปแทน CATEGORIES/PRIORITIES/ZONES ได้ตรงๆ
    """

    @staticmethod
    def build():
        return {
            "categories": {
                t.key: {"label": t.label, "dept": t.dept, "color": t.color}
                for t in IncidentType.objects.filter(is_active=True)
            },
            "priorities": {
                p.key: {
                    "label": p.label,
                    "rank": p.rank,
                    "assignSec": p.assign_sec,
                    "resolveSec": p.resolve_sec,
                    "autoAssign": p.auto_assign,
                    "note": p.note,
                    "examples": p.examples,
                }
                for p in Priority.objects.all()
            },
            "zones": list(Zone.objects.filter(is_active=True).values_list("name", flat=True)),
        }

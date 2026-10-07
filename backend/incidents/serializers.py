"""
Serializer ของเหตุ — ตั้งใจให้ JSON ที่ออกมาหน้าตาตรงกับ object ที่ shared.js ใช้อยู่แล้ว
โดยเฉพาะ:
  - id เป็น "INC-0687" ไม่ใช่ UUID
  - cat / pri / zone เป็น key สั้นๆ ตรงกับ CATEGORIES / PRIORITIES / ZONES
  - เวลาเป็น epoch milliseconds เพราะ frontend คำนวณ Date.now() - i.reportedAt
"""

from rest_framework import serializers

from core.models import IncidentType, Priority, Zone

from .models import Incident, IncidentPhoto, IncidentUpdate


def ms(dt):
    """datetime -> epoch milliseconds (None ถ้ายังไม่มีค่า)"""
    return int(dt.timestamp() * 1000) if dt else None


class IncidentPhotoSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()

    class Meta:
        model = IncidentPhoto
        fields = ["id", "url"]

    def get_url(self, obj):
        request = self.context.get("request")
        return request.build_absolute_uri(obj.file.url) if request else obj.file.url


class IncidentUpdateSerializer(serializers.ModelSerializer):
    """ตรงกับ updates: [{ at, note, photos }] ใน shared.js
    photos เป็นรายการ [{ id, url }] เหมือนรูปตอนแจ้งเหตุ (เดิมส่งมาแค่จำนวน)"""

    at = serializers.SerializerMethodField()
    photos = serializers.SerializerMethodField()
    author = serializers.CharField(source="author.full_name", read_only=True, default="")

    class Meta:
        model = IncidentUpdate
        fields = ["id", "at", "note", "photos", "author"]

    def get_at(self, obj):
        return ms(obj.created_at)

    def get_photos(self, obj):
        # ส่ง URL มาด้วย ไม่ใช่แค่จำนวน มิฉะนั้นผู้ประสานงานจะกดดูรูปหลังดำเนินการ
        # เพื่อตรวจก่อนปิดงานไม่ได้เลย (เห็นแค่ข้อความ "แนบรูป 2 รูป")
        return IncidentPhotoSerializer(
            obj.photos.all(), many=True, context=self.context
        ).data


class IncidentSerializer(serializers.ModelSerializer):
    """
    รูปแบบกลางที่ทุกพอร์ทัลใช้ได้
    status ที่ส่งออกขึ้นกับบทบาทของผู้เรียก (ดู to_representation)
    """

    id = serializers.CharField(source="code", read_only=True)
    uuid = serializers.UUIDField(source="pk", read_only=True)
    cat = serializers.CharField(source="cat_id", read_only=True)
    pri = serializers.CharField(source="pri_id", read_only=True)
    zone = serializers.CharField(source="zone_id", read_only=True)

    reporter = serializers.SerializerMethodField()
    phone = serializers.CharField(source="reporter_phone", read_only=True)
    assignee = serializers.CharField(source="assignee.username", read_only=True, default=None)
    officer = serializers.CharField(source="assignee.full_name", read_only=True, default=None)

    reminders = serializers.IntegerField(source="reminder_count", read_only=True)
    lastReminderAt = serializers.SerializerMethodField()
    reportedAt = serializers.SerializerMethodField()
    assignedAt = serializers.SerializerMethodField()
    ackAt = serializers.SerializerMethodField()
    submittedAt = serializers.SerializerMethodField()
    closedAt = serializers.SerializerMethodField()

    updates = IncidentUpdateSerializer(many=True, read_only=True)
    photos = serializers.SerializerMethodField()

    class Meta:
        model = Incident
        fields = [
            "id", "uuid", "title", "cat", "pri", "zone", "place", "note", "status",
            "reporter", "phone", "assignee", "officer",
            "reportedAt", "assignedAt", "ackAt", "submittedAt", "closedAt",
            "reminders", "lastReminderAt", "updates", "photos",
        ]

    def get_reporter(self, obj):
        return obj.reporter_name or (obj.reporter.full_name if obj.reporter else "")

    def get_lastReminderAt(self, obj):
        return ms(obj.last_reminder_at)

    def get_reportedAt(self, obj):
        return ms(obj.reported_at)

    def get_assignedAt(self, obj):
        return ms(obj.assigned_at)

    def get_ackAt(self, obj):
        return ms(obj.ack_at)

    def get_submittedAt(self, obj):
        return ms(obj.submitted_at)

    def get_closedAt(self, obj):
        return ms(obj.closed_at)

    def get_photos(self, obj):
        # เฉพาะรูปตอนแจ้งเหตุ (ไม่รวมรูปที่แนบมากับการบันทึกผล)
        return IncidentPhotoSerializer(
            obj.photos.filter(update__isnull=True), many=True, context=self.context
        ).data

    def to_representation(self, instance):
        """แปลงสถานะให้ตรงกับมุมมองของบทบาทที่เรียก (ดูคำอธิบายใน incidents/models.py)"""
        data = super().to_representation(instance)
        request = self.context.get("request")
        role = getattr(request.user, "role", None) if request else None

        if role == "officer":
            data["status"] = instance.officer_status
        elif role == "user":
            data["status"] = instance.reporter_status
            # ผู้แจ้งไม่ต้องเห็นเบอร์ตัวเองซ้ำ และไม่ควรเห็น username ภายในของช่าง
            data.pop("phone", None)
            data.pop("assignee", None)
        return data


class IncidentCreateSerializer(serializers.ModelSerializer):
    """
    แจ้งเหตุใหม่ — ใช้ได้ทั้งฝั่งผู้แจ้ง (user) และผู้ประสานงานที่รับแจ้งแทน (admin)
    รับรูปได้หลายไฟล์ผ่าน multipart field ชื่อ photos
    """

    cat = serializers.PrimaryKeyRelatedField(queryset=IncidentType.objects.filter(is_active=True))
    pri = serializers.PrimaryKeyRelatedField(queryset=Priority.objects.all())
    zone = serializers.PrimaryKeyRelatedField(queryset=Zone.objects.filter(is_active=True))
    photos = serializers.ListField(child=serializers.ImageField(), write_only=True, required=False)

    class Meta:
        model = Incident
        fields = ["title", "cat", "pri", "zone", "place", "note",
                  "reporter_name", "reporter_phone", "photos"]

    def create(self, validated_data):
        photos = validated_data.pop("photos", [])
        user = self.context["request"].user

        if user.role == "user":
            validated_data["reporter"] = user
            validated_data.setdefault("reporter_name", user.full_name)
            if not validated_data.get("reporter_phone"):
                validated_data["reporter_phone"] = user.phone

        incident = Incident.objects.create(**validated_data)
        for f in photos:
            IncidentPhoto.objects.create(incident=incident, file=f)
        return incident

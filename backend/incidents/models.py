"""
เหตุและการดำเนินงาน

สถานะใน DB มี 4 ค่าตามที่ฝั่งผู้ดูแลนิยาม ส่วนอีกสองพอร์ทัลเป็น "มุมมอง"
ที่คำนวณจาก status + timestamp ไม่ได้เก็บซ้ำ:

  DB        เงื่อนไข        ผู้แจ้งเห็น          ช่างเห็น
  pending   —               รอดำเนินการ         (ไม่เห็น)
  progress  ack_at = null   มอบหมายแล้ว         รอรับทราบ
  progress  ack_at ≠ null   กำลังดำเนินการ      กำลังดำเนินการ
  review    —               กำลังดำเนินการ      รอตรวจสอบผล
  done      —               เสร็จสิ้น           เสร็จสิ้น
"""

import uuid
from datetime import timedelta

from django.conf import settings
from django.db import models
from django.utils import timezone


class Incident(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "รอมอบหมาย"
        PROGRESS = "progress", "กำลังดำเนินการ"
        REVIEW = "review", "รอตรวจผล"
        DONE = "done", "ดำเนินการเสร็จสิ้น"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    # เลขที่แสดงผล เช่น 687 -> "INC-0687" ให้ตรงกับที่ frontend ใช้อ้างอิง
    number = models.PositiveIntegerField(unique=True, editable=False)

    title = models.CharField(max_length=200)
    cat = models.ForeignKey("core.IncidentType", on_delete=models.PROTECT, related_name="incidents")
    pri = models.ForeignKey("core.Priority", on_delete=models.PROTECT, related_name="incidents")
    zone = models.ForeignKey("core.Zone", on_delete=models.PROTECT, related_name="incidents")
    place = models.CharField(max_length=200, help_text="สถานที่แบบละเอียด เช่น อาคารเรียนรวม 2 ห้อง 304")
    note = models.TextField(blank=True, help_text="รายละเอียดเพิ่มเติมจากผู้แจ้ง")

    reporter = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="reported_incidents",
    )
    # เก็บแยกจาก reporter เพราะผู้ประสานงานอาจรับแจ้งทางโทรศัพท์แทนคนที่ไม่มีบัญชี
    reporter_name = models.CharField(max_length=120, blank=True)
    reporter_phone = models.CharField(max_length=20, blank=True)

    assignee = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="assigned_incidents", limit_choices_to={"role": "officer"},
    )

    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)

    reported_at = models.DateTimeField(default=timezone.now)
    assigned_at = models.DateTimeField(null=True, blank=True)
    ack_at = models.DateTimeField(null=True, blank=True, help_text="เวลาที่ช่างกดรับทราบงาน")
    submitted_at = models.DateTimeField(null=True, blank=True, help_text="เวลาที่ช่างส่งผลให้ตรวจ")
    closed_at = models.DateTimeField(null=True, blank=True, help_text="เวลาที่ผู้ประสานงานปิดงาน")

    # การแจ้งเตือนซ้ำไปยังเจ้าหน้าที่ที่ยังไม่รับทราบงาน
    reminder_count = models.PositiveSmallIntegerField(default=0)
    last_reminder_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-reported_at"]
        indexes = [
            models.Index(fields=["status", "reported_at"]),
            models.Index(fields=["assignee", "status"]),
        ]

    def __str__(self):
        return f"{self.code} {self.title}"

    def save(self, *args, **kwargs):
        if self.number is None:
            last = Incident.objects.order_by("-number").values_list("number", flat=True).first()
            self.number = (last or 600) + 1
        super().save(*args, **kwargs)

    # ---------- ค่าที่คำนวณได้ ----------

    @property
    def code(self):
        return f"INC-{self.number:04d}"

    @property
    def is_active(self):
        return self.status != self.Status.DONE

    @property
    def assign_deadline(self):
        return self.reported_at + timedelta(seconds=self.pri.assign_sec)

    @property
    def resolve_deadline(self):
        return self.reported_at + timedelta(seconds=self.pri.resolve_sec)

    @property
    def is_overdue(self):
        return self.is_active and timezone.now() > self.resolve_deadline

    @property
    def officer_status(self):
        """สถานะในมุมมองของเจ้าหน้าที่ภาคสนาม"""
        if self.status == self.Status.PROGRESS and self.ack_at is None:
            return "pending_ack"
        return self.status

    @property
    def reporter_status(self):
        """สถานะในมุมมองของผู้แจ้ง — ยุบ review รวมกับ progress"""
        if self.status == self.Status.PROGRESS and self.ack_at is None:
            return "assigned"
        if self.status == self.Status.REVIEW:
            return "progress"
        return self.status


def incident_photo_path(instance, filename):
    incident_id = instance.update.incident_id if instance.update_id else instance.incident_id
    return f"incidents/{incident_id}/{filename}"


class IncidentPhoto(models.Model):
    """
    รูปประกอบ — แนบได้ทั้งตอนแจ้งเหตุ (update = null)
    และตอนช่างบันทึกผลการดำเนินงาน (update ชี้ไปที่รอบนั้น)
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    incident = models.ForeignKey(Incident, on_delete=models.CASCADE, related_name="photos")
    update = models.ForeignKey(
        "IncidentUpdate", on_delete=models.CASCADE, related_name="photos",
        null=True, blank=True,
    )
    file = models.ImageField(upload_to=incident_photo_path)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["uploaded_at"]

    def __str__(self):
        return f"{self.incident.code} photo"


class IncidentUpdate(models.Model):
    """
    บันทึกผลการดำเนินงานของช่าง — ส่งได้หลายรอบ
    รอบแรกดันสถานะเป็น review รอบถัดไปเป็นข้อมูลเพิ่มเติม
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    incident = models.ForeignKey(Incident, on_delete=models.CASCADE, related_name="updates")
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="incident_updates"
    )
    note = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.incident.code} update @ {self.created_at:%Y-%m-%d %H:%M}"


class StatusLog(models.Model):
    """ประวัติการเปลี่ยนสถานะ ใช้แสดง timeline ในหน้ารายละเอียด"""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    incident = models.ForeignKey(Incident, on_delete=models.CASCADE, related_name="status_logs")
    status = models.CharField(max_length=20, choices=Incident.Status.choices)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True
    )
    note = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.incident.code} -> {self.status}"

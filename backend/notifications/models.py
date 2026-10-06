import uuid

from django.conf import settings
from django.db import models


class Notification(models.Model):
    """
    การแจ้งเตือนภายในระบบ (In-app)
    ช่องทางเสริม (Web Push / Telegram Bot) ต่อยอดได้ที่ notifications/utils.py
    """

    class Kind(models.TextChoices):
        NEW_INCIDENT = "new_incident", "มีเหตุใหม่"
        ASSIGNED = "assigned", "ได้รับมอบหมายงาน"
        ACKNOWLEDGED = "acknowledged", "เจ้าหน้าที่รับทราบงาน"
        SUBMITTED = "submitted", "ส่งผลให้ตรวจสอบ"
        CLOSED = "closed", "ปิดงานแล้ว"
        OVERDUE = "overdue", "งานเกิน SLA"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications"
    )
    incident = models.ForeignKey(
        "incidents.Incident", on_delete=models.CASCADE, related_name="notifications",
        null=True, blank=True,
    )
    kind = models.CharField(max_length=30, choices=Kind.choices, default=Kind.NEW_INCIDENT)
    message = models.CharField(max_length=255)
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["recipient", "is_read"])]

    def __str__(self):
        return f"-> {self.recipient}: {self.message[:40]}"

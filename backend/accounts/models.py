"""
ผู้ใช้งาน 3 บทบาท ตรงกับ 3 พอร์ทัลของ frontend
  user    -> user/     (ผู้แจ้งเหตุ)
  officer -> officer/  (เจ้าหน้าที่ภาคสนาม)
  admin   -> admin/    (ผู้ดูแล/ผู้ประสานงาน)
"""

from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils import timezone


class User(AbstractUser):
    class Role(models.TextChoices):
        USER = "user", "ผู้แจ้งเหตุ"
        OFFICER = "officer", "เจ้าหน้าที่"
        ADMIN = "admin", "ผู้ดูแลระบบ"

    # สมัครเองได้เฉพาะบทบาท user เท่านั้น — บทบาทอื่นต้องให้ผู้ดูแลเลื่อนสิทธิ์
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.USER)
    phone = models.CharField(max_length=20, blank=True)
    title = models.CharField(max_length=20, blank=True, help_text="คำนำหน้า เช่น นาย")
    affiliation = models.CharField(
        max_length=120, blank=True, help_text="สังกัด/รหัสนักศึกษา แสดงใต้ชื่อในเมนู"
    )

    # อีเมลต้องไม่ซ้ำ เพราะ login/register ใช้อีเมลเป็นตัวระบุตัวตนได้
    email = models.EmailField(unique=True)

    class Meta:
        ordering = ["first_name", "last_name"]

    def __str__(self):
        return self.full_name

    @property
    def full_name(self):
        name = f"{self.first_name} {self.last_name}".strip()
        return name or self.username

    @property
    def display_role(self):
        """ข้อความใต้ชื่อในเมนู — ช่างแสดงหน่วยงานที่รับผิดชอบ"""
        if self.role == self.Role.OFFICER and hasattr(self, "officer"):
            return f"เจ้าหน้าที่ซ่อมบำรุง · {self.officer.cat.dept}"
        if self.role == self.Role.ADMIN:
            return "ผู้ประสานงาน"
        return self.affiliation or "ผู้แจ้งเหตุ"


class OfficerProfile(models.Model):
    """
    ข้อมูลเฉพาะของเจ้าหน้าที่ภาคสนาม — ตรงกับ OFFICERS ใน admin/shared.js
    ใช้ประกอบการคัดกรอง/แนะนำผู้รับผิดชอบในหน้ามอบหมายงาน
    """

    user = models.OneToOneField(
        User, on_delete=models.CASCADE, related_name="officer", primary_key=True
    )
    cat = models.ForeignKey(
        "core.IncidentType", on_delete=models.PROTECT, related_name="officers",
        help_text="ประเภทงานที่เชี่ยวชาญ",
    )
    zone = models.ForeignKey(
        "core.Zone", on_delete=models.PROTECT, related_name="officers",
        help_text="พื้นที่รับผิดชอบหลัก",
    )
    capacity = models.PositiveSmallIntegerField(
        default=3, help_text="จำนวนงานสูงสุดที่รับพร้อมกันได้"
    )
    on_duty = models.BooleanField(default=True, help_text="อยู่ในเวรตอนนี้หรือไม่")
    shift_start = models.TimeField(default="08:00")
    shift_end = models.TimeField(default="16:00")

    class Meta:
        ordering = ["user__first_name"]
        verbose_name = "โปรไฟล์เจ้าหน้าที่"
        verbose_name_plural = "โปรไฟล์เจ้าหน้าที่"

    def __str__(self):
        return f"{self.user.full_name} ({self.cat.label})"

    @property
    def active_count(self):
        """จำนวนงานที่ยังไม่ปิด — ใช้คำนวณภาระงาน"""
        return self.user.assigned_incidents.exclude(status="done").count()

    @property
    def free_slots(self):
        return max(0, self.capacity - self.active_count)

    @property
    def load_pct(self):
        return self.active_count / self.capacity if self.capacity else 1.0

    def is_on_shift(self, at=None):
        """อยู่ในช่วงเวลาเข้าเวรหรือไม่ (รองรับเวรข้ามเที่ยงคืน เช่น 16:00-00:00)"""
        now = (at or timezone.localtime()).time()
        if self.shift_start <= self.shift_end:
            return self.shift_start <= now < self.shift_end
        return now >= self.shift_start or now < self.shift_end

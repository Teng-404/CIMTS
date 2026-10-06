"""
ข้อมูลอ้างอิงของระบบ — ตรงกับค่าคงที่ใน shared.js ของ frontend
(CATEGORIES, ZONES, PRIORITIES) แต่ย้ายมาเก็บใน DB เพื่อให้ผู้ดูแลแก้ไขได้
"""

from django.db import models


class IncidentType(models.Model):
    """ประเภทเหตุ — ตรงกับ CATEGORIES ใน shared.js"""

    key = models.SlugField(
        primary_key=True, max_length=30,
        help_text="คีย์ที่ frontend ใช้ เช่น electric, plumbing",
    )
    label = models.CharField(max_length=60, help_text="ชื่อที่แสดง เช่น ไฟฟ้า")
    dept = models.CharField(max_length=80, help_text="ชื่อหน่วยงาน เช่น งานไฟฟ้า")
    color = models.CharField(max_length=7, default="#5b6b7f", help_text="สีฮex เช่น #f26522")
    is_active = models.BooleanField(default=True)
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["order", "key"]
        verbose_name = "ประเภทเหตุ"
        verbose_name_plural = "ประเภทเหตุ"

    def __str__(self):
        return self.label


class Zone(models.Model):
    """พื้นที่/อาคาร — ตรงกับ ZONES ใน shared.js"""

    name = models.CharField(primary_key=True, max_length=80)
    is_active = models.BooleanField(default=True)
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["order", "name"]
        verbose_name = "พื้นที่"
        verbose_name_plural = "พื้นที่"

    def __str__(self):
        return self.name


class Priority(models.Model):
    """
    ระดับความเร่งด่วน + SLA — ตรงกับ PRIORITIES ใน shared.js
    assign_sec = เวลาสูงสุดที่ควรมอบหมายงาน
    resolve_sec = เวลาสูงสุดที่ควรแก้ไขเสร็จ
    เก็บใน DB เพื่อให้ผู้ดูแลปรับ SLA ได้โดยไม่ต้องแก้โค้ด
    """

    key = models.SlugField(primary_key=True, max_length=20, help_text="emergency / urgent / normal")
    label = models.CharField(max_length=40)
    rank = models.PositiveSmallIntegerField(
        default=0, help_text="เลขน้อย = เร่งด่วนกว่า ใช้เรียงคิว"
    )
    assign_sec = models.PositiveIntegerField(help_text="SLA: ต้องมอบหมายภายใน (วินาที)")
    resolve_sec = models.PositiveIntegerField(help_text="SLA: ต้องแก้ไขเสร็จภายใน (วินาที)")
    auto_assign = models.BooleanField(
        default=False, help_text="มอบหมายอัตโนมัติโดยไม่รอผู้ประสานงานยืนยัน"
    )
    note = models.TextField(blank=True, help_text="คำอธิบายที่แสดงให้ผู้แจ้งตอนเลือกระดับ")
    examples = models.JSONField(
        default=list, blank=True, help_text="ตัวอย่างเหตุ แสดงให้ผู้แจ้งเลือกระดับได้ถูก"
    )

    class Meta:
        ordering = ["rank"]
        verbose_name = "ระดับความเร่งด่วน"
        verbose_name_plural = "ระดับความเร่งด่วน"

    def __str__(self):
        return self.label

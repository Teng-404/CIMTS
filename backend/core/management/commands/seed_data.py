"""
สร้างข้อมูลอ้างอิงและข้อมูลตัวอย่าง ให้ตรงกับค่าคงที่ใน shared.js ของ frontend
รันซ้ำได้ (idempotent) — ใช้ --fresh เพื่อล้างเหตุทั้งหมดก่อนสร้างใหม่
"""

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.utils import timezone

from accounts.models import OfficerProfile
from core.models import IncidentType, Priority, Zone
from incidents.models import Incident, IncidentUpdate, StatusLog

User = get_user_model()

MIN, HOUR, DAY = 60, 3600, 86400

CATEGORIES = [
    ("electric", "ไฟฟ้า", "งานไฟฟ้า", "#f26522"),
    ("plumbing", "ประปา", "งานประปา", "#298adf"),
    ("network", "เครือข่าย", "งานเครือข่าย", "#5b6b7f"),
    ("building", "อาคาร/โครงสร้าง", "งานอาคารและโครงสร้าง", "#f2b800"),
    ("security", "ความปลอดภัย", "งานรักษาความปลอดภัย", "#f43e31"),
    ("grounds", "ภูมิทัศน์/ความสะอาด", "งานภูมิทัศน์และความสะอาด", "#5cc10a"),
]

ZONES = [
    "อาคารเรียนรวม 1", "อาคารเรียนรวม 2", "หอสมุด", "โรงอาหารกลาง",
    "อาคารกิจกรรม", "หอพักนักศึกษา", "ลานจอดรถ", "สนามกีฬา",
]

PRIORITIES = [
    {
        "key": "emergency", "label": "ฉุกเฉิน", "rank": 0,
        "assign_sec": 5 * MIN, "resolve_sec": 2 * HOUR, "auto_assign": True,
        "note": "อันตรายต่อชีวิตหรือทรัพย์สินทันที — หากรุนแรงถึงขั้นเป็นอันตรายถึงชีวิต "
                "ให้โทรแจ้งเบอร์ฉุกเฉินควบคู่ไปด้วย",
        "examples": ["เพลิงไหม้หรือมีควันไฟ", "ไฟฟ้าลัดวงจร มีประกายไฟ",
                     "มีผู้บาดเจ็บหรือเจ็บป่วยฉุกเฉิน", "กลิ่นแก๊สรั่ว"],
    },
    {
        "key": "urgent", "label": "เร่งด่วน", "rank": 1,
        "assign_sec": 15 * MIN, "resolve_sec": 4 * HOUR, "auto_assign": False,
        "note": "กระทบการใช้งานเป็นวงกว้างหรือมีความเสี่ยง ควรได้รับการแก้ไขภายในไม่กี่ชั่วโมง",
        "examples": ["ไฟฟ้าดับทั้งอาคารหรือทั้งชั้น", "น้ำท่วมขังในอาคาร",
                     "ลิฟต์ค้างมีคนติดอยู่ข้างใน"],
    },
    {
        "key": "normal", "label": "ปกติ", "rank": 2,
        "assign_sec": HOUR, "resolve_sec": DAY, "auto_assign": False,
        "note": "ไม่กระทบความปลอดภัยหรือการใช้งานเร่งด่วน สามารถรอคิวดำเนินการตามปกติได้",
        "examples": ["หลอดไฟดับดวงเดียว", "ก๊อกน้ำหยดหรือรั่วซึมเล็กน้อย", "Wi-Fi ช้าหรือหลุดบ่อย"],
    },
]

OFFICERS = [
    ("o1", "สมชาย", "แสงทอง", "electric", "อาคารเรียนรวม 2", 3, True, "08:00", "16:00"),
    ("o2", "วิภาวี", "อินทรา", "network", "หอสมุด", 5, True, "08:00", "16:00"),
    ("o3", "ธวัชชัย", "บุญศรี", "plumbing", "โรงอาหารกลาง", 2, True, "08:00", "16:00"),
    ("o4", "นภัสสร", "ใจดี", "building", "หอพักนักศึกษา", 4, True, "08:00", "16:00"),
    ("o5", "อนุชา", "พิทักษ์", "security", "ลานจอดรถ", 4, True, "16:00", "23:59"),
    ("o6", "ปริญญา", "สุขเจริญ", "grounds", "สนามกีฬา", 4, False, "08:00", "16:00"),
    ("o7", "กิตติศักดิ์", "มั่งมี", "electric", "อาคารเรียนรวม 1", 3, True, "08:00", "16:00"),
    ("o8", "สุนิสา", "ทองแท้", "electric", "หอพักนักศึกษา", 3, False, "08:00", "16:00"),
]

# (number, title, cat, pri, zone, place, status, ago_sec, reporter_name, phone, note)
INCIDENTS = [
    (687, "ไฟฟ้าลัดวงจร มีกลิ่นไหม้", "electric", "emergency", "อาคารเรียนรวม 2",
     "อาคารเรียนรวม 2 ห้อง 304", "pending", 2 * MIN + 41, "ณัฐชา พรหมดี", "0891231240",
     "พบประกายไฟและมีกลิ่นไหม้บริเวณตู้ควบคุมไฟฟ้าหน้าห้อง 304 ผู้แจ้งได้ปิดสวิตช์หลักเบื้องต้นแล้ว"),
    (686, "น้ำรั่วซึมบริเวณฝ้าเพดาน", "plumbing", "normal", "หอสมุด",
     "หอสมุด ชั้น 2", "pending", 18 * MIN, "กร เก่งแก้ว", "0891231241", ""),
    (685, "ท่อน้ำรั่วบริเวณทางเดิน", "plumbing", "urgent", "อาคารกิจกรรม",
     "อาคารปฏิบัติการ ชั้น 1", "progress", 18 * MIN, "วีระพงษ์ ทองดี", "0891231242",
     "น้ำไหลเอ่อบนทางเดิน เสี่ยงลื่นล้ม"),
    (683, "เครื่องปรับอากาศไม่ทำงาน", "building", "normal", "อาคารเรียนรวม 1",
     "อาคารเรียนรวม 1 ห้อง 215", "progress", 45 * MIN, "กร เก่งแก้ว", "0891231243",
     "เปิดเครื่องแล้วไม่มีลมเย็นออกมา"),
    (679, "หลอดไฟทางเดินชำรุด", "electric", "normal", "อาคารกิจกรรม",
     "อาคารปฏิบัติการ ชั้น 1", "review", 90 * MIN, "ปิยะนุช แก้วมณี", "0891231244",
     "หลอดไฟกระพริบและดับเป็นบางช่วง"),
    (674, "ปลั๊กไฟชำรุด ไฟช็อตเล็กน้อย", "electric", "urgent", "หอสมุด",
     "หอสมุด ชั้น 1 โซนอ่านหนังสือ", "done", 6 * HOUR, "กิตติพัฒน์ ศรีสุข", "0891231245", ""),
    (668, "โปรเจกเตอร์ห้องบรรยายไม่ติด", "electric", "normal", "อาคารเรียนรวม 1",
     "อาคารเรียนรวม 1 ห้อง 401", "done", 20 * HOUR, "อรทัย บุญมา", "0891231246", ""),
    (661, "ไฟทางเดินหน้าหอพักดับ", "electric", "urgent", "หอพักนักศึกษา",
     "หอพักนักศึกษา อาคาร B", "done", DAY + 10 * HOUR, "ชลธิชา เพ็งดี", "0891231247", ""),
    (648, "ไฟฟ้าดับครึ่งอาคาร", "electric", "emergency", "อาคารเรียนรวม 2",
     "อาคารเรียนรวม 2", "done", 3 * DAY, "สุกัญญา มั่นคง", "0891231248", ""),
]

PASSWORD = "Passw0rd!"


class Command(BaseCommand):
    help = "สร้างข้อมูลอ้างอิงและข้อมูลตัวอย่างให้ตรงกับ frontend"

    def add_arguments(self, parser):
        parser.add_argument("--fresh", action="store_true", help="ล้างเหตุทั้งหมดก่อนสร้างใหม่")

    def handle(self, *args, **options):
        if options["fresh"]:
            Incident.objects.all().delete()
            self.stdout.write("ล้างข้อมูลเหตุเดิมแล้ว")

        # ---------- ข้อมูลอ้างอิง ----------
        for order, (key, label, dept, color) in enumerate(CATEGORIES):
            IncidentType.objects.update_or_create(
                key=key, defaults={"label": label, "dept": dept, "color": color, "order": order}
            )
        for order, name in enumerate(ZONES):
            Zone.objects.update_or_create(name=name, defaults={"order": order})
        for p in PRIORITIES:
            Priority.objects.update_or_create(key=p["key"], defaults=p)

        # ---------- ผู้ใช้งาน ----------
        admin, created = User.objects.get_or_create(
            username="admin",
            defaults={
                "email": "admin@campus.ac.th", "first_name": "กร", "last_name": "ดีปรี",
                "title": "นาย", "role": User.Role.ADMIN, "phone": "0891112200",
                "is_staff": True, "is_superuser": True,
            },
        )
        if created:
            admin.set_password("admin1234")  # ตรงกับบัญชีทดสอบใน login.js
            admin.save()

        reporter, created = User.objects.get_or_create(
            username="student",
            defaults={
                "email": "student@campus.ac.th", "first_name": "ธีรภัทร", "last_name": "เก่งแก้ว",
                "title": "นาย", "role": User.Role.USER, "phone": "0891231240",
                "affiliation": "นักศึกษา · รหัส 6501012345",
            },
        )
        if created:
            reporter.set_password(PASSWORD)
            reporter.save()

        officers = {}
        for code, first, last, cat, zone, cap, on_duty, start, end in OFFICERS:
            user, created = User.objects.get_or_create(
                username=code,
                defaults={
                    "email": f"{code}@campus.ac.th", "first_name": first, "last_name": last,
                    "title": "นาย", "role": User.Role.OFFICER,
                    "phone": f"08911122{code[1:].zfill(2)}",
                },
            )
            if created:
                user.set_password(PASSWORD)
                user.save()
            OfficerProfile.objects.update_or_create(
                user=user,
                defaults={
                    "cat_id": cat, "zone_id": zone, "capacity": cap,
                    "on_duty": on_duty, "shift_start": start, "shift_end": end,
                },
            )
            officers[code] = user

        # ---------- เหตุตัวอย่าง ----------
        now = timezone.now()
        assign_delay = {"emergency": 2, "urgent": 6, "normal": 12}
        submit_delay = {"emergency": 25, "urgent": 60, "normal": 120}

        for (num, title, cat, pri, zone, place, status, ago,
             rep_name, phone, note) in INCIDENTS:
            if Incident.objects.filter(number=num).exists():
                continue

            reported_at = now - timedelta(seconds=ago)
            assignee = None if status == "pending" else officers["o1"]

            ack = assign_delay[pri] + (num % 5)
            sub = ack + submit_delay[pri] + (num % 6) * 4
            close = sub + 15 + (num % 4) * 5

            inc = Incident(
                number=num, title=title, cat_id=cat, pri_id=pri, zone_id=zone,
                place=place, note=note, status=status,
                reporter=reporter, reporter_name=rep_name, reporter_phone=phone,
                assignee=assignee, reported_at=reported_at,
                assigned_at=None if status == "pending" else reported_at + timedelta(minutes=1),
                ack_at=(reported_at + timedelta(minutes=ack)
                        if status in ("progress", "review", "done") and num != 683 else None),
                submitted_at=(reported_at + timedelta(minutes=sub)
                              if status in ("review", "done") else None),
                closed_at=reported_at + timedelta(minutes=close) if status == "done" else None,
            )
            inc.save()

            StatusLog.objects.create(incident=inc, status="pending", actor=reporter,
                                     note="ผู้แจ้งส่งเรื่องเข้าระบบ")
            if status in ("review", "done"):
                IncidentUpdate.objects.create(
                    incident=inc, author=assignee, note="ดำเนินการแก้ไขเรียบร้อยแล้ว"
                )

        self.stdout.write(self.style.SUCCESS(
            f"เสร็จสิ้น — ประเภท {IncidentType.objects.count()} · พื้นที่ {Zone.objects.count()} · "
            f"ระดับ {Priority.objects.count()} · เจ้าหน้าที่ {OfficerProfile.objects.count()} · "
            f"เหตุ {Incident.objects.count()}"
        ))
        self.stdout.write("บัญชี: admin/admin1234 · student/Passw0rd! · o1..o8/Passw0rd!")

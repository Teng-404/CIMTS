"""
ตัวช่วยสร้างการแจ้งเตือน In-app
จุดต่อยอดสำหรับ Web Push / Telegram Bot อยู่ท้ายฟังก์ชัน notify()
"""

from django.contrib.auth import get_user_model

from .models import Notification


def notify(message, kind, incident=None, recipient=None, to_admins=False):
    User = get_user_model()

    recipients = []
    if to_admins:
        recipients.extend(User.objects.filter(role="admin", is_active=True))
    if recipient is not None:
        recipients.append(recipient)

    # กันส่งซ้ำคนเดิมเมื่อผู้รับเป็นแอดมินอยู่แล้ว
    seen, unique = set(), []
    for r in recipients:
        if r.pk not in seen:
            seen.add(r.pk)
            unique.append(r)

    notifications = Notification.objects.bulk_create([
        Notification(recipient=r, incident=incident, kind=kind, message=message)
        for r in unique
    ])

    # TODO: ส่งต่อผ่าน Web Push / Telegram Bot ที่นี่ (ขอบเขตภาคเรียนที่ 2)
    return notifications

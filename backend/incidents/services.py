"""
คัดกรองและจัดอันดับเจ้าหน้าที่สำหรับเหตุหนึ่งๆ
ย้ายมาจาก rankOfficers() ใน admin/assign.js เพราะต้องรู้ภาระงานของทุกคน
ซึ่งเป็นข้อมูลที่อยู่ฝั่งเซิร์ฟเวอร์

เกณฑ์ (มากไปน้อย): ตรงประเภทงาน > อยู่ในเวร > อยู่ในพื้นที่ > มีคิวว่าง
"""

from accounts.models import OfficerProfile

WEIGHT_SAME_DEPT = 100
WEIGHT_ON_DUTY = 40
WEIGHT_SAME_ZONE = 25
WEIGHT_FREE_SLOT = 8


def rank_officers(incident, limit=None):
    """คืน list ของ OfficerProfile ที่ติด attribute เพิ่ม: same_dept, same_zone, score"""
    profiles = (
        OfficerProfile.objects
        .select_related("user", "cat", "zone")
        .filter(user__is_active=True)
    )

    ranked = []
    for p in profiles:
        same_dept = p.cat_id == incident.cat_id
        same_zone = p.zone_id == incident.zone_id
        on_shift = p.on_duty and p.is_on_shift()

        score = (
            WEIGHT_SAME_DEPT * same_dept
            + WEIGHT_ON_DUTY * on_shift
            + WEIGHT_SAME_ZONE * same_zone
            + WEIGHT_FREE_SLOT * p.free_slots
        )

        p.same_dept = same_dept
        p.same_zone = same_zone
        p.score = score
        ranked.append(p)

    # คนที่ตรงประเภทงานขึ้นก่อนเสมอ แล้วค่อยเรียงตามคะแนนรวม
    ranked.sort(key=lambda p: (-p.same_dept, -p.score, p.active_count))
    return ranked[:limit] if limit else ranked


def best_officer(incident):
    """
    เจ้าหน้าที่ที่เหมาะที่สุด สำหรับการมอบหมายอัตโนมัติของเหตุฉุกเฉิน
    คืน None ถ้าไม่มีใครตรงประเภทงานและว่างเลย — ให้ผู้ประสานงานตัดสินใจเอง
    """
    for p in rank_officers(incident):
        if p.same_dept and p.free_slots > 0 and p.on_duty:
            return p
    return None

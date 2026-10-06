#!/usr/bin/env bash
# สคริปต์ที่ Render เรียกตอน deploy แต่ละครั้ง
# หยุดทันทีเมื่อมีคำสั่งไหนล้มเหลว จะได้ไม่ deploy ทั้งที่ migrate ไม่ผ่าน
set -o errexit

pip install -r requirements.txt

# รวมไฟล์ static ของ Django admin ไว้ให้ WhiteNoise เสิร์ฟ
python manage.py collectstatic --no-input

python manage.py migrate

# สร้างข้อมูลอ้างอิงและบัญชีตัวอย่าง (รันซ้ำได้ ไม่สร้างข้อมูลซ้ำ)
# ลบบรรทัดนี้ออกเมื่อเริ่มใช้งานจริงกับข้อมูลจริงแล้ว
python manage.py seed_data

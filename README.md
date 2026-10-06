# CampusCare — ระบบบริหารจัดการการแจ้งเหตุและติดตามการดำเนินงานภายในมหาวิทยาลัย
### Campus Incident Management and Tracking System (CIMTS)

โปรเจกต์วิศวกรรมคอมพิวเตอร์ สจล. วิทยาเขตชุมพรเขตรอุดมศักดิ์

## โครงสร้างโปรเจกต์

```
CIMTS-Project/
├── backend/              Django + Django REST Framework + PostgreSQL
│   ├── config/           settings.py · urls.py
│   ├── accounts/         User (3 บทบาท) · OfficerProfile
│   ├── core/             IncidentType · Zone · Priority (SLA) · seed_data
│   ├── incidents/        Incident · IncidentUpdate · IncidentPhoto · StatusLog
│   ├── notifications/
│   ├── media/            รูปที่อัปโหลด (ไม่เก็บใน Git)
│   └── manage.py · .env · .env.example · requirements.txt
│
└── frontend/             HTML + CSS + JavaScript (ไม่มี build step)
    ├── login/            เข้าสู่ระบบ · สมัครสมาชิก · ลืมรหัสผ่าน
    ├── admin/            พอร์ทัลผู้ดูแล/ผู้ประสานงาน (8 หน้า)
    ├── officer/          พอร์ทัลเจ้าหน้าที่ภาคสนาม (4 หน้า)
    ├── user/             พอร์ทัลผู้แจ้งเหตุ (4 หน้า)
    └── assets/           logo.png
```

แต่ละพอร์ทัลมี `shared.js` ของตัวเอง (คนละไฟล์กัน) ทำหน้าที่สร้างเมนู เรียก API และเก็บ state ส่วนสคริปต์ของแต่ละหน้าประกาศ `render()` ของตนเองแล้วเรียก `boot()` หนึ่งครั้งตอนเปิดหน้า

## บทบาทผู้ใช้งาน

| บทบาท | หน้าแรก | ความสามารถหลัก |
|---|---|---|
| ผู้แจ้งเหตุ (`user`) | `user/report.html` | แจ้งเหตุ แนบรูป ติดตามสถานะ ดูเบอร์ฉุกเฉิน ดูสถิติของตน |
| เจ้าหน้าที่ (`officer`) | `officer/jobs.html` | ดูงานที่ได้รับมอบหมาย รับทราบงาน บันทึกผล แนบรูปหลังแก้ไข ดูตารางเวร |
| ผู้ดูแล/ผู้ประสานงาน (`admin`) | `admin/admin.html` | รับแจ้งเหตุ มอบหมายงาน ปิดงาน จัดการผู้ใช้/เจ้าหน้าที่/ข้อมูลพื้นฐาน ดูรายงาน |

หลังเข้าสู่ระบบ เซิร์ฟเวอร์จะส่งหน้าปลายทางกลับมาตามบทบาท ผู้ใช้จึงถูกพาไปพอร์ทัลที่ถูกต้องอัตโนมัติ

## แนวคิดเรื่องสถานะ

ฐานข้อมูลเก็บสถานะเพียง **4 ค่า** ส่วนอีกสองพอร์ทัลเห็นเป็น "มุมมอง" ที่คำนวณจากสถานะและ timestamp ไม่ได้เก็บซ้ำ

| ในฐานข้อมูล | เงื่อนไข | ผู้แจ้งเห็น | เจ้าหน้าที่เห็น |
|---|---|---|---|
| `pending` | — | รอดำเนินการ | (ไม่เห็น) |
| `progress` | ยังไม่กดรับทราบ | มอบหมายแล้ว | **รอรับทราบ** |
| `progress` | กดรับทราบแล้ว | กำลังดำเนินการ | กำลังดำเนินการ |
| `review` | — | กำลังดำเนินการ | รอตรวจสอบผล |
| `done` | — | เสร็จสิ้น | เสร็จสิ้น |

ผู้แจ้งไม่เห็นขั้น "รอตรวจผล" โดยตั้งใจ เพราะเป็นขั้นตอนภายในระหว่างเจ้าหน้าที่กับผู้ประสานงาน

---

## การติดตั้ง

### ขั้นที่ 1 — ติดตั้ง PostgreSQL

ดาวน์โหลดจาก https://www.postgresql.org/download/windows/ ติดตั้งแล้วจำรหัสผ่านของผู้ใช้ `postgres` ไว้

เปิด **SQL Shell (psql)** จาก Start Menu (กด Enter ผ่านค่าเริ่มต้นจนถึงช่องรหัสผ่าน) แล้วรัน

```sql
CREATE USER cimts WITH PASSWORD 'cimts123';
CREATE DATABASE cimts OWNER cimts;
ALTER USER cimts CREATEDB;
```

### ขั้นที่ 2 — ตั้งค่า Backend

```powershell
cd E:\CIMTS-Project\backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt

copy .env.example .env
```

เปิด `.env` แล้วแก้ `POSTGRES_PASSWORD` ให้ตรงกับที่ตั้งไว้ จากนั้น

```powershell
python manage.py makemigrations
python manage.py migrate
python manage.py seed_data
python manage.py runserver
```

> PowerShell: ถ้าขึ้น error "running scripts is disabled" ให้รัน
> `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` ก่อน activate

### ขั้นที่ 3 — เปิดใช้งาน

**ไม่ต้องรัน npm หรือเปิด terminal ที่สอง** — Django เสิร์ฟไฟล์ frontend ให้ด้วยตอน `DEBUG=True`

เปิดเบราว์เซอร์ที่

```
http://127.0.0.1:8000/login/login.html
```

> ⚠️ ต้องเข้าผ่าน `http://127.0.0.1:8000/...` เท่านั้น **ห้ามดับเบิลคลิกไฟล์ HTML เปิดแบบ `file://`**
> เพราะระบบใช้ session cookie กับ CSRF ซึ่งใช้ข้าม origin ไม่ได้

### บัญชีตัวอย่าง (จาก `seed_data`)

| บัญชี | รหัสผ่าน | บทบาท |
|---|---|---|
| `admin` | `admin1234` | ผู้ดูแล/ผู้ประสานงาน |
| `o1` – `o8` | `Passw0rd!` | เจ้าหน้าที่ (คนละประเภทงานและพื้นที่) |
| `student` | `Passw0rd!` | ผู้แจ้งเหตุ |

`seed_data` รันซ้ำได้โดยไม่สร้างข้อมูลซ้ำ ใช้ `python manage.py seed_data --fresh` เพื่อล้างเหตุทั้งหมดแล้วสร้างใหม่

### ครั้งต่อไปที่เปิดเครื่อง

```powershell
cd E:\CIMTS-Project\backend
venv\Scripts\activate
python manage.py runserver
```

ไม่ต้อง migrate หรือ seed ซ้ำ ข้อมูลอยู่ใน PostgreSQL ครบ

---

## การยืนยันตัวตน

ระบบใช้ **session cookie** (ไม่ใช่ JWT) เพราะ frontend เป็น multi-page ธรรมดา คุกกี้จึงติดไปกับทุกคำขอเองโดยไม่ต้องเขียนโค้ดแนบ header ทุกหน้า

ทุกคำขอที่ไม่ใช่ GET ต้องแนบ header `X-CSRFToken` ซึ่ง `shared.js` จัดการให้อัตโนมัติผ่านฟังก์ชัน `api()` และหากเซสชันหมดอายุ (401/403) จะพากลับไปหน้าเข้าสู่ระบบเอง

การสมัครสมาชิกผ่านหน้าเว็บจะได้บทบาท `user` เสมอ บทบาทอื่นต้องให้ผู้ดูแลเป็นผู้กำหนดในหน้าจัดการผู้ใช้งาน

---

## การตั้งค่าผ่าน .env

| ตัวแปร | ความหมาย |
|---|---|
| `DB_ENGINE` | `postgresql` (ค่าเริ่มต้น) หรือ `sqlite` |
| `POSTGRES_*` | ข้อมูลเชื่อมต่อฐานข้อมูล |
| `POSTGRES_SSLMODE` | `prefer` สำหรับเครื่องตัวเอง, `require` เมื่อใช้คลาวด์ |
| `CLOUDINARY_*` | เว้นว่าง = เก็บรูปใน `backend/media/`, ใส่ค่า = เก็บขึ้น Cloudinary |
| `DJANGO_DEBUG` | ตั้ง `False` เมื่อขึ้นเซิร์ฟเวอร์จริง |
| `DJANGO_ALLOWED_HOSTS` | โดเมน/IP ที่อนุญาต คั่นด้วยจุลภาค |
| `CSRF_TRUSTED_ORIGINS` | โดเมนที่อนุญาตให้ส่งฟอร์ม (จำเป็นเมื่อขึ้น production) |
| `SESSION_HOURS` | อายุเซสชัน (ค่าเริ่มต้น 12 ชั่วโมง) |

**ตอน deploy จริง** แก้เฉพาะ `.env` — ตั้ง `DJANGO_DEBUG=False`, ใส่ `DJANGO_SECRET_KEY` ใหม่, เปลี่ยน `POSTGRES_HOST`, เพิ่มโดเมนใน `DJANGO_ALLOWED_HOSTS` และ `CSRF_TRUSTED_ORIGINS` โค้ดไม่ต้องแก้

> เมื่อ `DEBUG=False` Django จะ **ไม่เสิร์ฟไฟล์ frontend ให้อีก** ต้องใช้ Nginx เสิร์ฟโฟลเดอร์ `frontend/` และ proxy `/api/` ไปที่ Django
>
> ⚠️ ห้าม commit ไฟล์ `.env` ขึ้น Git (อยู่ใน `.gitignore` แล้ว)

---

## API

ทุก endpoint ต้องเข้าสู่ระบบก่อน ยกเว้นที่ระบุว่าเปิดสาธารณะ

**การยืนยันตัวตน**

| Method | Path | หมายเหตุ |
|---|---|---|
| GET | `/api/auth/csrf` | เปิดสาธารณะ — วาง cookie `csrftoken` |
| POST | `/api/auth/login` | เปิดสาธารณะ — ใส่ชื่อผู้ใช้หรืออีเมลก็ได้ · คืน `{user, home}` |
| POST | `/api/auth/register` | เปิดสาธารณะ — อีเมลซ้ำคืน 409 |
| POST | `/api/auth/logout` | |
| GET | `/api/auth/me` | ข้อมูลผู้ใช้ปัจจุบัน (เจ้าหน้าที่ได้ข้อมูลเวรมาด้วย) |
| POST | `/api/auth/my-duty` | เจ้าหน้าที่สลับสถานะพร้อมปฏิบัติงานของตนเอง |

**เหตุ** — ขอบเขตข้อมูลกรองตามบทบาทอัตโนมัติ

| Method | Path |
|---|---|
| GET · POST | `/api/incidents/` — query: `q cat pri zone status owner` · POST แนบรูปผ่าน `photos` (multipart) |
| GET | `/api/incidents/{number}/` — ใช้เลขเหตุ เช่น `687` |
| GET | `/api/incidents/{number}/recommend/` — เจ้าหน้าที่ที่ระบบแนะนำพร้อมคะแนน |
| POST | `/api/incidents/{number}/assign/` · `close/` · `reopen/` · `remind/` |
| POST | `/api/incidents/{number}/acknowledge/` · `update-result/` |
| GET | `/api/incidents/dashboard/` · `monthly/?year=2569` · `monthly-years/` |

**จัดการข้อมูล (เฉพาะผู้ดูแล)**

| Method | Path |
|---|---|
| GET · POST · PATCH · DELETE | `/api/users/` — DELETE = ปิดใช้งาน ไม่ลบจริง |
| POST | `/api/users/{username}/reset-password/` · `restore/` |
| GET · PATCH | `/api/officers/` · `/api/officers/{username}/duty/` |
| GET · POST · PATCH · DELETE | `/api/incident-types/` · `/api/zones/` · `/api/priorities/` |

**อื่นๆ**

| Method | Path |
|---|---|
| GET | `/api/reference` — ประเภทเหตุ ระดับความเร่งด่วน (พร้อม SLA) และพื้นที่ ในคำขอเดียว |
| GET | `/api/notifications/` · `unread-count/` |
| POST | `/api/notifications/read-all/` · `{id}/read/` |

หน้าจัดการฐานข้อมูลของ Django อยู่ที่ `/django-admin/` (ย้ายจาก `/admin/` เพราะชนกับพอร์ทัลผู้ดูแล)

### รูปแบบ JSON ของเหตุ

```
id: "INC-0687"              cat / pri / zone: คีย์สั้น เช่น "electric"
status: มุมมองตามบทบาทของผู้เรียก
reportedAt: 1790261319451   ← epoch milliseconds (ใช้กับ Date.now() ได้ตรงๆ)
assignedAt · ackAt · submittedAt · closedAt: epoch ms หรือ null
assignee: "o7"              officer: "กิตติศักดิ์ มั่งมี"
updates: [{ at, note, photos }]    photos: [{ id, url }]
```

---

## สถานะงานตามขอบเขตโครงงาน

### ภาคเรียนที่ 1 — เสร็จครบ

1. **ระบบจัดการผู้ใช้งานและการยืนยันตัวตน** — เข้าสู่ระบบ สมัครสมาชิก สิทธิ์ 3 ระดับ และหน้าจัดการบัญชีผู้ใช้งาน (เพิ่ม/แก้ไข/กำหนดบทบาท/รีเซ็ตรหัสผ่าน/ปิดใช้งาน)
2. **ระบบจัดการข้อมูลพื้นฐาน** — หน้าจัดการประเภทเหตุ พื้นที่ และโปรไฟล์เจ้าหน้าที่ (ประเภทงาน พื้นที่รับผิดชอบ ความจุงาน ตารางเวร)
3. **ระบบแจ้งเหตุและติดตามสถานะ** — เลือกประเภท ระบุสถานที่ แนบรูป และติดตามความคืบหน้า
4. **ระบบคัดกรองและมอบหมายงาน** — จัดอันดับเจ้าหน้าที่จากประเภทงาน พื้นที่ ตารางเวร และคิวงานคงเหลือ · เจ้าหน้าที่รับทราบงาน บันทึกผล และแนบรูปหลังแก้ไข

### ภาคเรียนที่ 2 — ยังไม่ได้ทำ

- **ส่งต่ออัตโนมัติเมื่อไม่รับทราบงานในเวลาที่กำหนด** — มีค่า `EMERGENCY_ESCALATION_MINUTES` ใน settings แล้ว แต่ยังไม่มีตัวรันตามเวลา
- **Web Push / Telegram Bot** — จุดเชื่อมต่ออยู่ที่ `backend/notifications/utils.py::notify()` ปัจจุบันสร้างเฉพาะการแจ้งเตือนในระบบ
- **ระบบโทรฉุกเฉินและบันทึกผลการติดต่อ** — ยังไม่มีทั้งโมเดลและหน้าจอ
- **เบอร์ติดต่อฉุกเฉินแก้ไขผ่านระบบ** — ปัจจุบันยังกำหนดไว้ในไฟล์ `user/contacts.js`
- **ลืมรหัสผ่าน** — หน้าเว็บพร้อมแล้วแต่ยังเป็นโหมดจำลอง ต้องตั้งค่า SMTP ก่อน
- **ประเมินความพึงพอใจ** — เป็นวัตถุประสงค์ข้อ 5 ในเอกสาร แต่ยังไม่มีในส่วนต่อประสานปัจจุบัน ควรหารือกับอาจารย์ที่ปรึกษาว่าจะเพิ่มหรือปรับขอบเขต
- **Docker Compose + Nginx** — สำหรับติดตั้งบนเซิร์ฟเวอร์ สจล. ชุมพร

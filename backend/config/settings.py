"""
Django settings for CIMTS (Campus Incident Management and Tracking System)
ระบบบริหารจัดการการแจ้งเหตุและติดตามการดำเนินงานภายในมหาวิทยาลัย

การตั้งค่าทั้งหมดอ่านจากไฟล์ .env (หรือ environment variables บนเซิร์ฟเวอร์)
เพื่อให้สลับระหว่างเครื่องพัฒนากับเซิร์ฟเวอร์จริงได้โดยไม่ต้องแก้ไฟล์นี้
"""

import os
from pathlib import Path

import dj_database_url
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent

# โหลดค่าจาก backend/.env (บนเซิร์ฟเวอร์จะไม่มีไฟล์นี้ ใช้ environment variables แทน)
load_dotenv(BASE_DIR / ".env")


def env(key, default=None):
    return os.environ.get(key, default)


def env_bool(key, default=False):
    val = os.environ.get(key)
    if val is None:
        return default
    return val.strip().lower() in ("1", "true", "yes", "on")


def env_list(key, default=""):
    raw = os.environ.get(key, default)
    return [item.strip() for item in raw.split(",") if item.strip()]


SECRET_KEY = env("DJANGO_SECRET_KEY", "django-insecure-dev-only-change-in-production")

DEBUG = env_bool("DJANGO_DEBUG", True)

ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1,[::1]")

# Render ตั้งค่านี้ให้อัตโนมัติ เพิ่มโดเมนของแอปเข้าไปเองโดยไม่ต้องพิมพ์ซ้ำ
if render_host := env("RENDER_EXTERNAL_HOSTNAME"):
    ALLOWED_HOSTS.append(render_host)


# --- Cloudinary ---
# ถ้ามี CLOUDINARY_URL หรือ CLOUDINARY_CLOUD_NAME ระบบจะเก็บรูปขึ้น Cloudinary อัตโนมัติ
# ถ้าไม่มี จะเก็บลงโฟลเดอร์ media/ ในเครื่องตามเดิม
#
# สำคัญเมื่อ deploy: ดิสก์ของเซิร์ฟเวอร์ฟรีหายทุกครั้งที่ deploy ใหม่
# จึงต้องตั้งค่า Cloudinary ไม่งั้นรูปที่ผู้ใช้อัปโหลดจะหายหมด
USE_CLOUDINARY = bool(env("CLOUDINARY_URL") or env("CLOUDINARY_CLOUD_NAME"))

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # 3rd party
    "rest_framework",
    "corsheaders",
    "django_filters",
    # local apps
    "accounts",
    "core",
    "incidents",
    "notifications",
]

if USE_CLOUDINARY:
    # ต้องอยู่ก่อน staticfiles ตามคำแนะนำของ django-cloudinary-storage
    INSTALLED_APPS.insert(
        INSTALLED_APPS.index("django.contrib.staticfiles"),
        "cloudinary_storage",
    )
    INSTALLED_APPS.append("cloudinary")

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    # WhiteNoise เสิร์ฟไฟล์ frontend และ static ของ Django admin
    # ทำให้ไม่ต้องติดตั้ง Nginx แยก และหน้าเว็บอยู่โดเมนเดียวกับ API
    # (จำเป็นสำหรับ session cookie — ถ้าคนละโดเมนคุกกี้จะไม่ติดไป)
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"


# --- Database ---
# ลำดับความสำคัญ:
#   1. DATABASE_URL  — เซิร์ฟเวอร์คลาวด์ (Render/Neon) ส่งมาให้เป็น URL เส้นเดียว
#   2. DB_ENGINE=sqlite — ใช้ชั่วคราวตอนยังไม่ได้ติดตั้ง PostgreSQL
#   3. POSTGRES_* — PostgreSQL บนเครื่องตัวเอง (ค่าเริ่มต้นตอนพัฒนา)
if env("DATABASE_URL"):
    DATABASES = {"default": dj_database_url.config(conn_max_age=600)}
elif env("DB_ENGINE", "postgresql").lower() == "sqlite":
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": env("POSTGRES_DB", "cimts"),
            "USER": env("POSTGRES_USER", "cimts"),
            "PASSWORD": env("POSTGRES_PASSWORD", ""),
            "HOST": env("POSTGRES_HOST", "127.0.0.1"),
            "PORT": env("POSTGRES_PORT", "5432"),
            "CONN_MAX_AGE": int(env("POSTGRES_CONN_MAX_AGE", "60")),
            "OPTIONS": {
                "sslmode": env("POSTGRES_SSLMODE", "prefer"),
            },
        }
    }

AUTH_USER_MODEL = "accounts.User"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "th"
TIME_ZONE = "Asia/Bangkok"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

MEDIA_URL = "media/"
MEDIA_ROOT = BASE_DIR / "media"

# โฟลเดอร์ frontend (login/ admin/ officer/ user/)
FRONTEND_DIR = Path(env("FRONTEND_DIR", str(BASE_DIR.parent / "frontend")))

# ให้ WhiteNoise เสิร์ฟไฟล์ใน frontend/ ที่ path ราก
# เช่น /login/login.html -> frontend/login/login.html
# ใช้ได้ทั้งตอน DEBUG=True และ False จึงเทสต์ในเครื่องได้เหมือนบนเซิร์ฟเวอร์จริง
if FRONTEND_DIR.exists():
    WHITENOISE_ROOT = FRONTEND_DIR

WHITENOISE_INDEX_FILE = True
# ไฟล์ frontend แก้บ่อยระหว่างพัฒนา จึงไม่ให้เบราว์เซอร์แคชนาน
WHITENOISE_MAX_AGE = 0 if DEBUG else 3600

# --- Storage backend สำหรับรูปภาพประกอบการแจ้งเหตุ ---
if USE_CLOUDINARY:
    CLOUDINARY_STORAGE = {
        "CLOUD_NAME": env("CLOUDINARY_CLOUD_NAME", ""),
        "API_KEY": env("CLOUDINARY_API_KEY", ""),
        "API_SECRET": env("CLOUDINARY_API_SECRET", ""),
    }
    STORAGES = {
        "default": {
            "BACKEND": "cloudinary_storage.storage.MediaCloudinaryStorage",
        },
        "staticfiles": {
            "BACKEND": "whitenoise.storage.CompressedStaticFilesStorage",
        },
    }
else:
    STORAGES = {
        "default": {
            "BACKEND": "django.core.files.storage.FileSystemStorage",
        },
        "staticfiles": {
            "BACKEND": "whitenoise.storage.CompressedStaticFilesStorage",
        },
    }

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# --- Django REST Framework ---
# ใช้ session cookie (ไม่ใช่ JWT) เพราะ frontend เป็น multi-page ธรรมดา
# คุกกี้ติดไปกับทุก request เองโดยไม่ต้องเขียนโค้ดแนบ header ทุกหน้า
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework.authentication.SessionAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",),
    "DEFAULT_FILTER_BACKENDS": (
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ),
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 50,
}

SESSION_COOKIE_AGE = int(env("SESSION_HOURS", "12")) * 3600
SESSION_SAVE_EVERY_REQUEST = True
CSRF_COOKIE_HTTPONLY = False  # ให้ JavaScript อ่าน csrftoken ไปแนบใน header ได้

# --- CORS ---
CORS_ALLOWED_ORIGINS = env_list(
    "CORS_ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
)
CORS_ALLOW_CREDENTIALS = True

CSRF_TRUSTED_ORIGINS = env_list("CSRF_TRUSTED_ORIGINS", "")

# Render ให้โดเมนมาตอนรันจริง เพิ่มเข้า CSRF ให้เองจะได้ไม่ต้องตั้งซ้ำ
if render_host := env("RENDER_EXTERNAL_HOSTNAME"):
    CSRF_TRUSTED_ORIGINS.append(f"https://{render_host}")

# --- ความปลอดภัยเมื่อขึ้นเซิร์ฟเวอร์จริง (DEBUG=False) ---
if not DEBUG:
    # เซิร์ฟเวอร์อยู่หลัง proxy ที่ทำ HTTPS ให้ ต้องบอก Django ว่าคำขอนี้เป็น https
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SESSION_COOKIE_SECURE = env_bool("SECURE_COOKIES", True)
    CSRF_COOKIE_SECURE = env_bool("SECURE_COOKIES", True)
    SECURE_SSL_REDIRECT = env_bool("SECURE_SSL_REDIRECT", True)
    SECURE_CONTENT_TYPE_NOSNIFF = True

# เหตุฉุกเฉินที่ยังไม่มีการรับทราบภายในกี่นาที ให้ส่งต่อไปยังผู้รับผิดชอบสำรอง
EMERGENCY_ESCALATION_MINUTES = int(env("EMERGENCY_ESCALATION_MINUTES", "5"))

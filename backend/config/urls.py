"""
เส้นทางของระบบ CIMTS

หมายเหตุสำคัญ: Django admin ถูกย้ายไป /django-admin/ เพราะ /admin/ ถูกใช้
โดยพอร์ทัลผู้ดูแลของ frontend (frontend/admin/admin.html)

ตอน DEBUG=True Django จะเสิร์ฟไฟล์ frontend ให้ด้วย ทำให้ทุกอย่างอยู่ origin
เดียวกัน (http://127.0.0.1:8000) — session cookie จึงทำงานโดยไม่ต้องตั้ง CORS
"""

from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from django.views.generic import RedirectView
from django.views.static import serve
from rest_framework.routers import DefaultRouter

from accounts.views import (OfficerViewSet, UserViewSet, csrf, login_view, logout_view, me,
                            my_duty, register_view)
from core.views import IncidentTypeViewSet, PriorityViewSet, ZoneViewSet, reference
from incidents.views import IncidentViewSet
from notifications.views import NotificationViewSet

router = DefaultRouter()
router.register("incidents", IncidentViewSet, basename="incident")
router.register("users", UserViewSet, basename="user")
router.register("officers", OfficerViewSet, basename="officer")
router.register("incident-types", IncidentTypeViewSet, basename="incident-type")
router.register("zones", ZoneViewSet, basename="zone")
router.register("priorities", PriorityViewSet, basename="priority")
router.register("notifications", NotificationViewSet, basename="notification")

urlpatterns = [
    path("django-admin/", admin.site.urls),

    # --- Authentication ---
    path("api/auth/csrf", csrf),
    path("api/auth/login", login_view),
    path("api/auth/logout", logout_view),
    path("api/auth/register", register_view),
    path("api/auth/me", me),
    path("api/auth/my-duty", my_duty),

    path("api/reference", reference),
    path("api/", include(router.urls)),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

    # เสิร์ฟไฟล์ frontend เพื่อให้อยู่ origin เดียวกับ API
    if settings.FRONTEND_DIR.exists():
        urlpatterns += [
            path("", RedirectView.as_view(url="/login/login.html", permanent=False)),
            path("<path:path>", serve, {"document_root": str(settings.FRONTEND_DIR)}),
        ]

from django.contrib.auth import authenticate, get_user_model, login, logout
from django.db.models import Q
from django.middleware.csrf import get_token
from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from .models import OfficerProfile
from .permissions import IsAdmin, IsOfficer
from .serializers import (OfficerSerializer, RegisterSerializer, UserAdminSerializer,
                          UserSerializer)

User = get_user_model()

# หน้าแรกของแต่ละบทบาท — login.js ใช้ค่านี้ตัดสินใจว่าจะพาไปหน้าไหน
HOME_BY_ROLE = {
    "admin": "../admin/admin.html",
    "officer": "../officer/jobs.html",
    "user": "../user/report.html",
}


@api_view(["GET"])
@permission_classes([AllowAny])
def csrf(request):
    """
    เรียกครั้งแรกเพื่อให้เซิร์ฟเวอร์วาง cookie ชื่อ csrftoken
    จากนั้น JavaScript อ่านค่าไปแนบใน header X-CSRFToken ของทุก POST
    """
    return Response({"csrfToken": get_token(request)})


@api_view(["POST"])
@permission_classes([AllowAny])
def login_view(request):
    """
    เข้าสู่ระบบด้วยชื่อผู้ใช้หรืออีเมล — ตรงกับฟอร์มใน login.html
    ตอบ 401 เมื่อข้อมูลไม่ถูกต้อง (login.js แปลงเป็นข้อความภาษาไทยเอง)
    """
    identifier = (request.data.get("username") or "").strip()
    password = request.data.get("password") or ""

    if not identifier or not password:
        return Response({"detail": "กรุณากรอกข้อมูลให้ครบ"}, status=status.HTTP_400_BAD_REQUEST)

    # อนุญาตให้กรอกอีเมลแทนชื่อผู้ใช้ได้
    username = identifier
    if "@" in identifier:
        match = User.objects.filter(email__iexact=identifier).values_list("username", flat=True).first()
        username = match or identifier

    user = authenticate(request, username=username, password=password)
    if user is None or not user.is_active:
        return Response({"detail": "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง"},
                        status=status.HTTP_401_UNAUTHORIZED)

    login(request, user)
    return Response({
        "user": UserSerializer(user).data,
        "home": HOME_BY_ROLE.get(user.role, "../user/report.html"),
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def logout_view(request):
    logout(request)
    return Response({"detail": "ออกจากระบบแล้ว"})


@api_view(["POST"])
@permission_classes([AllowAny])
def register_view(request):
    """สมัครสมาชิก — ได้บทบาท user เสมอ"""
    serializer = RegisterSerializer(data=request.data)
    if not serializer.is_valid():
        # register.js ดู status 409 เพื่อแสดงข้อความ "อีเมลนี้ถูกใช้งานแล้ว"
        email_errors = serializer.errors.get("email", [])
        if any(getattr(e, "code", None) == "taken" for e in email_errors):
            return Response({"detail": "อีเมลนี้ถูกใช้งานแล้ว"}, status=status.HTTP_409_CONFLICT)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    user = serializer.save()
    return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def me(request):
    """ข้อมูลผู้ใช้ปัจจุบัน — shared.js ใช้แทน CONFIG.user ที่เคย hardcode"""
    data = {
        "user": UserSerializer(request.user).data,
        "home": HOME_BY_ROLE.get(request.user.role),
    }
    # เจ้าหน้าที่ภาคสนามต้องรู้สถานะเวรของตัวเองเพื่อแสดงสวิตช์ "พร้อมปฏิบัติงาน"
    if request.user.role == "officer" and hasattr(request.user, "officer"):
        data["officer"] = OfficerSerializer(request.user.officer).data
    return Response(data)


@api_view(["POST"])
@permission_classes([IsOfficer])
def my_duty(request):
    """
    เจ้าหน้าที่สลับสถานะพร้อมปฏิบัติงานของตัวเอง
    body: { onDuty: true|false } — ถ้าไม่ส่งมาจะสลับค่าเดิม
    """
    profile = request.user.officer
    profile.on_duty = bool(request.data.get("onDuty", not profile.on_duty))
    profile.save(update_fields=["on_duty"])
    return Response(OfficerSerializer(profile).data)


class UserViewSet(viewsets.ModelViewSet):
    """
    จัดการบัญชีผู้ใช้งาน — เพิ่ม ลบ แก้ไข ตรวจสอบ (ขอบเขตภาคเรียนที่ 1 ข้อ 1)
    เข้าถึงได้เฉพาะผู้ดูแลระบบ
    """

    serializer_class = UserAdminSerializer
    permission_classes = [IsAdmin]
    lookup_field = "username"

    def get_queryset(self):
        qs = User.objects.select_related("officer__cat", "officer__zone").all()
        params = self.request.query_params

        if role := params.get("role"):
            qs = qs.filter(role=role)
        if (active := params.get("active")) in ("true", "false"):
            qs = qs.filter(is_active=(active == "true"))
        if q := params.get("q"):
            qs = qs.filter(
                Q(first_name__icontains=q) | Q(last_name__icontains=q)
                | Q(username__icontains=q) | Q(email__icontains=q) | Q(phone__icontains=q)
            )
        return qs.order_by("role", "first_name")

    def perform_destroy(self, instance):
        """
        ไม่ลบบัญชีออกจากฐานข้อมูลจริง เพราะยังถูกอ้างอิงจากประวัติการแจ้งเหตุ
        ใช้วิธีปิดการใช้งานแทน เพื่อรักษาประวัติไว้ตรวจสอบย้อนหลังได้
        """
        instance.is_active = False
        instance.save(update_fields=["is_active"])

    @action(detail=True, methods=["post"], url_path="reset-password")
    def reset_password(self, request, username=None):
        user = self.get_object()
        password = request.data.get("password") or ""
        if len(password) < 8:
            return Response({"detail": "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร"},
                            status=status.HTTP_400_BAD_REQUEST)
        user.set_password(password)
        user.save(update_fields=["password"])
        return Response({"detail": f"ตั้งรหัสผ่านใหม่ให้ {user.full_name} แล้ว"})


class OfficerViewSet(viewsets.ModelViewSet):
    """
    รายชื่อเจ้าหน้าที่พร้อมภาระงาน — ใช้ในหน้าจัดการเจ้าหน้าที่และหน้ามอบหมายงาน
    """

    serializer_class = OfficerSerializer
    permission_classes = [IsAdmin]
    lookup_field = "user__username"
    lookup_url_kwarg = "username"
    http_method_names = ["get", "patch", "post", "head", "options"]  # สร้าง/ลบทำผ่าน /api/users/ แทน

    def get_queryset(self):
        qs = OfficerProfile.objects.select_related("user", "cat", "zone").filter(user__is_active=True)
        params = self.request.query_params

        if cat := params.get("cat"):
            qs = qs.filter(cat_id=cat)
        if zone := params.get("zone"):
            qs = qs.filter(zone_id=zone)
        if (on_duty := params.get("onDuty")) in ("true", "false"):
            qs = qs.filter(on_duty=(on_duty == "true"))
        if q := params.get("q"):
            qs = qs.filter(
                Q(user__first_name__icontains=q) | Q(user__last_name__icontains=q)
                | Q(user__phone__icontains=q) | Q(cat__label__icontains=q)
                | Q(zone__name__icontains=q)
            )
        return qs

    @action(detail=True, methods=["post"], url_path="duty")
    def set_duty(self, request, username=None):
        """สลับสถานะเข้าเวร — ปุ่มในหน้าจัดการเจ้าหน้าที่"""
        profile = self.get_object()
        profile.on_duty = bool(request.data.get("onDuty", not profile.on_duty))
        profile.save(update_fields=["on_duty"])
        return Response(OfficerSerializer(profile).data)


class UserViewSet(viewsets.ModelViewSet):
    """
    จัดการบัญชีผู้ใช้งานทั้งหมด (เฉพาะผู้ดูแล) — ขอบเขตภาคเรียนที่ 1 ข้อ 1
    รองรับเพิ่ม ลบ แก้ไข ค้นหา กำหนดบทบาท และรีเซ็ตรหัสผ่าน
    """

    serializer_class = UserAdminSerializer
    permission_classes = [IsAdmin]
    lookup_field = "username"

    def get_queryset(self):
        qs = User.objects.select_related("officer__cat", "officer__zone").all()
        params = self.request.query_params

        if role := params.get("role"):
            qs = qs.filter(role=role)
        if (active := params.get("isActive")) in ("true", "false"):
            qs = qs.filter(is_active=(active == "true"))
        if q := params.get("q"):
            qs = qs.filter(
                Q(first_name__icontains=q) | Q(last_name__icontains=q)
                | Q(username__icontains=q) | Q(email__icontains=q) | Q(phone__icontains=q)
            )
        return qs.order_by("role", "first_name")

    def perform_destroy(self, instance):
        """
        ไม่ลบบัญชีทิ้งจริง เพราะเหตุเก่าอ้างถึงผู้ใช้คนนี้อยู่ (ผู้แจ้ง/ผู้รับผิดชอบ)
        ใช้วิธีปิดการใช้งานแทน เพื่อรักษาประวัติไว้ให้ตรวจสอบย้อนหลังได้
        """
        instance.is_active = False
        instance.save(update_fields=["is_active"])

    @action(detail=True, methods=["post"], url_path="reset-password")
    def reset_password(self, request, username=None):
        user = self.get_object()
        password = request.data.get("password") or ""
        if len(password) < 8:
            return Response({"detail": "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร"},
                            status=status.HTTP_400_BAD_REQUEST)
        user.set_password(password)
        user.save(update_fields=["password"])
        return Response({"detail": f"ตั้งรหัสผ่านใหม่ให้ {user.full_name} แล้ว"})

    @action(detail=True, methods=["post"])
    def restore(self, request, username=None):
        """เปิดใช้งานบัญชีที่ถูกปิดไว้กลับมา"""
        user = self.get_object()
        user.is_active = True
        user.save(update_fields=["is_active"])
        return Response(UserAdminSerializer(user).data)

from rest_framework.permissions import SAFE_METHODS, BasePermission


class IsAdmin(BasePermission):
    """ผู้ดูแล/ผู้ประสานงานเท่านั้น"""

    def has_permission(self, request, view):
        return bool(request.user.is_authenticated and request.user.role == "admin")


class IsOfficer(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user.is_authenticated and request.user.role == "officer")


class IsAdminOrOfficer(BasePermission):
    def has_permission(self, request, view):
        return bool(
            request.user.is_authenticated and request.user.role in ("admin", "officer")
        )


class IsAdminOrReadOnly(BasePermission):
    """ข้อมูลอ้างอิง (ประเภทเหตุ/พื้นที่/ระดับ): ทุกคนที่ล็อกอินอ่านได้ แก้ได้เฉพาะผู้ดูแล"""

    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        return request.method in SAFE_METHODS or request.user.role == "admin"

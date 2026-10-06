from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from core.models import IncidentType, Zone

from core.models import IncidentType, Zone

from .models import OfficerProfile

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    """ข้อมูลผู้ใช้ที่ล็อกอินอยู่ — ตรงกับ CONFIG.user ใน shared.js"""

    firstName = serializers.CharField(source="first_name", read_only=True)
    lastName = serializers.CharField(source="last_name", read_only=True)
    fullName = serializers.CharField(source="full_name", read_only=True)
    roleLabel = serializers.CharField(source="display_role", read_only=True)

    class Meta:
        model = User
        fields = ["id", "username", "title", "firstName", "lastName", "fullName",
                  "email", "phone", "role", "roleLabel"]


class OfficerSerializer(serializers.ModelSerializer):
    """
    เจ้าหน้าที่ 1 คน — ตรงกับรูปแบบ OFFICERS ใน admin/shared.js
    ภาระงาน (active/free/pct) คำนวณจากเหตุที่ยังไม่ปิด
    """

    id = serializers.CharField(source="user.username", read_only=True)
    name = serializers.CharField(source="user.full_name", read_only=True)
    phone = serializers.CharField(source="user.phone", read_only=True)
    # cat/zone แก้ไขได้ (ผู้ดูแลเปลี่ยนประเภทงานและพื้นที่รับผิดชอบของช่างได้)
    cat = serializers.PrimaryKeyRelatedField(queryset=IncidentType.objects.all())
    zone = serializers.PrimaryKeyRelatedField(queryset=Zone.objects.all())
    onDuty = serializers.BooleanField(source="on_duty")
    shiftStart = serializers.TimeField(source="shift_start", format="%H:%M")
    shiftEnd = serializers.TimeField(source="shift_end", format="%H:%M")
    active = serializers.IntegerField(source="active_count", read_only=True)
    free = serializers.IntegerField(source="free_slots", read_only=True)
    pct = serializers.FloatField(source="load_pct", read_only=True)
    onShift = serializers.SerializerMethodField()

    class Meta:
        model = OfficerProfile
        fields = ["id", "name", "phone", "cat", "zone", "capacity",
                  "onDuty", "onShift", "shiftStart", "shiftEnd", "active", "free", "pct"]

    def get_onShift(self, obj):
        return obj.is_on_shift()


class RecommendedOfficerSerializer(OfficerSerializer):
    """
    เจ้าหน้าที่พร้อมเหตุผลที่ระบบแนะนำ — ใช้ในหน้ามอบหมายงาน (assign.js)
    sameDept / sameZone / free มาจากการเทียบกับเหตุที่เลือกอยู่
    """

    sameDept = serializers.BooleanField(source="same_dept", read_only=True)
    sameZone = serializers.BooleanField(source="same_zone", read_only=True)
    score = serializers.FloatField(read_only=True)

    class Meta(OfficerSerializer.Meta):
        fields = OfficerSerializer.Meta.fields + ["sameDept", "sameZone", "score"]


class RegisterSerializer(serializers.Serializer):
    """
    สมัครสมาชิก — ตรงกับ payload ที่ register.js ส่ง
    บังคับ role = user เสมอ ป้องกันไม่ให้สมัครเป็นผู้ดูแลเองได้
    """

    firstName = serializers.CharField(max_length=150)
    lastName = serializers.CharField(max_length=150)
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, min_length=8)

    def validate_email(self, value):
        if User.objects.filter(email__iexact=value).exists():
            # register.js แปลง 409 เป็นข้อความ "อีเมลนี้ถูกใช้งานแล้ว"
            raise serializers.ValidationError("อีเมลนี้ถูกใช้งานแล้ว", code="taken")
        return value.lower()

    def validate_password(self, value):
        validate_password(value)
        return value

    def create(self, validated_data):
        email = validated_data["email"]
        user = User(
            username=email.split("@")[0][:150],
            email=email,
            first_name=validated_data["firstName"],
            last_name=validated_data["lastName"],
            role=User.Role.USER,
        )
        # กันชื่อผู้ใช้ซ้ำเมื่อคนละโดเมนแต่ชื่อหน้า @ เหมือนกัน
        base, n = user.username, 1
        while User.objects.filter(username=user.username).exists():
            n += 1
            user.username = f"{base}{n}"
        user.set_password(validated_data["password"])
        user.save()
        return user


class OfficerProfileWriteSerializer(serializers.ModelSerializer):
    """ส่วนของโปรไฟล์เจ้าหน้าที่ที่ผู้ดูแลแก้ไขได้ (ฝังอยู่ใน UserAdminSerializer)"""

    cat = serializers.PrimaryKeyRelatedField(queryset=IncidentType.objects.all())
    zone = serializers.PrimaryKeyRelatedField(queryset=Zone.objects.all())
    onDuty = serializers.BooleanField(source="on_duty", required=False)
    shiftStart = serializers.TimeField(source="shift_start", format="%H:%M", required=False)
    shiftEnd = serializers.TimeField(source="shift_end", format="%H:%M", required=False)

    class Meta:
        model = OfficerProfile
        fields = ["cat", "zone", "capacity", "onDuty", "shiftStart", "shiftEnd"]


class UserAdminSerializer(serializers.ModelSerializer):
    """
    จัดการบัญชีผู้ใช้งานโดยผู้ดูแล (ขอบเขตภาคเรียนที่ 1 ข้อ 1)
    ถ้าบทบาทเป็น officer จะมีโปรไฟล์เจ้าหน้าที่ฝังมาด้วย เพื่อแก้ในฟอร์มเดียวกันได้
    """

    firstName = serializers.CharField(source="first_name")
    lastName = serializers.CharField(source="last_name", required=False, allow_blank=True)
    fullName = serializers.CharField(source="full_name", read_only=True)
    roleLabel = serializers.CharField(source="display_role", read_only=True)
    isActive = serializers.BooleanField(source="is_active", required=False)
    officer = OfficerProfileWriteSerializer(required=False, allow_null=True)
    password = serializers.CharField(write_only=True, required=False, min_length=8)
    activeJobs = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "username", "title", "firstName", "lastName", "fullName",
                  "email", "phone", "affiliation", "role", "roleLabel",
                  "isActive", "officer", "password", "activeJobs", "date_joined"]
        read_only_fields = ["id", "date_joined"]

    def get_activeJobs(self, obj):
        if obj.role != "officer":
            return None
        return obj.assigned_incidents.exclude(status="done").count()

    def validate_password(self, value):
        validate_password(value)
        return value

    def validate(self, attrs):
        # บทบาทเจ้าหน้าที่ต้องมีประเภทงานและพื้นที่รับผิดชอบเสมอ มิฉะนั้นระบบคัดกรองจะแนะนำไม่ได้
        role = attrs.get("role", getattr(self.instance, "role", None))
        officer = attrs.get("officer")
        if role == "officer" and officer is None and (
            self.instance is None or not hasattr(self.instance, "officer")
        ):
            raise serializers.ValidationError(
                {"officer": "เจ้าหน้าที่ต้องระบุประเภทงานและพื้นที่รับผิดชอบ"}
            )
        return attrs

    def create(self, validated_data):
        officer_data = validated_data.pop("officer", None)
        password = validated_data.pop("password", None)

        user = User(**validated_data)
        user.set_password(password or User.objects.make_random_password())
        user.save()

        if user.role == "officer" and officer_data:
            OfficerProfile.objects.create(user=user, **officer_data)
        return user

    def update(self, instance, validated_data):
        officer_data = validated_data.pop("officer", None)
        password = validated_data.pop("password", None)

        for field, value in validated_data.items():
            setattr(instance, field, value)
        if password:
            instance.set_password(password)
        instance.save()

        if instance.role == "officer":
            if officer_data:
                OfficerProfile.objects.update_or_create(user=instance, defaults=officer_data)
        else:
            # ลดบทบาทจากเจ้าหน้าที่แล้ว ไม่ต้องเก็บโปรไฟล์ไว้
            OfficerProfile.objects.filter(user=instance).delete()

        # instance.officer ถูก cache ไว้ตั้งแต่ตอน select_related จึงยังเป็นค่าก่อนแก้ไข
        # ต้องล้างทิ้ง มิฉะนั้น response จะส่งข้อมูลเก่ากลับไป
        # (ใช้ fields_cache เพราะ del กับ reverse OneToOne ไม่ได้)
        instance._state.fields_cache.pop("officer", None)

        return instance


class OfficerProfileWriteSerializer(serializers.ModelSerializer):
    """ฟิลด์ของโปรไฟล์เจ้าหน้าที่ที่ผู้ดูแลแก้ไขได้ (ใช้ซ้อนอยู่ใน UserAdminSerializer)"""

    cat = serializers.PrimaryKeyRelatedField(queryset=IncidentType.objects.all())
    zone = serializers.PrimaryKeyRelatedField(queryset=Zone.objects.all())
    onDuty = serializers.BooleanField(source="on_duty", required=False)
    shiftStart = serializers.TimeField(source="shift_start", format="%H:%M", required=False)
    shiftEnd = serializers.TimeField(source="shift_end", format="%H:%M", required=False)

    class Meta:
        model = OfficerProfile
        fields = ["cat", "zone", "capacity", "onDuty", "shiftStart", "shiftEnd"]


class UserAdminSerializer(serializers.ModelSerializer):
    """
    จัดการบัญชีผู้ใช้งานโดยผู้ดูแล — เพิ่ม ลบ แก้ไข และกำหนดสิทธิ์
    ถ้า role = officer จะสร้าง/แก้ OfficerProfile ที่ซ้อนมาใน key "officer" ให้ด้วย
    """

    firstName = serializers.CharField(source="first_name")
    lastName = serializers.CharField(source="last_name", required=False, allow_blank=True)
    fullName = serializers.CharField(source="full_name", read_only=True)
    roleLabel = serializers.CharField(source="display_role", read_only=True)
    isActive = serializers.BooleanField(source="is_active", required=False)
    password = serializers.CharField(write_only=True, required=False, min_length=8)
    officer = OfficerProfileWriteSerializer(required=False, allow_null=True)
    activeCount = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "username", "title", "firstName", "lastName", "fullName",
                  "email", "phone", "affiliation", "role", "roleLabel",
                  "isActive", "password", "officer", "activeCount", "date_joined"]
        read_only_fields = ["id", "date_joined"]

    def get_activeCount(self, obj):
        if obj.role != User.Role.OFFICER:
            return None
        return obj.assigned_incidents.exclude(status="done").count()

    def validate(self, attrs):
        role = attrs.get("role", getattr(self.instance, "role", None))
        officer = attrs.get("officer")

        # เจ้าหน้าที่ต้องมีประเภทงานและพื้นที่รับผิดชอบ มิฉะนั้นระบบคัดกรองจะไม่แนะนำให้เลย
        if role == User.Role.OFFICER:
            has_profile = self.instance and hasattr(self.instance, "officer")
            if not officer and not has_profile:
                raise serializers.ValidationError(
                    {"officer": "ต้องระบุประเภทงานและพื้นที่รับผิดชอบสำหรับเจ้าหน้าที่"}
                )
        return attrs

    def _sync_profile(self, user, data):
        if user.role == User.Role.OFFICER:
            if data is not None:
                OfficerProfile.objects.update_or_create(user=user, defaults=data)
        elif hasattr(user, "officer"):
            # เปลี่ยนบทบาทออกจากเจ้าหน้าที่แล้ว ไม่ต้องเก็บโปรไฟล์ไว้
            user.officer.delete()

    def create(self, validated_data):
        officer_data = validated_data.pop("officer", None)
        password = validated_data.pop("password", None)

        user = User(**validated_data)
        user.set_password(password or User.objects.make_random_password())
        user.save()
        self._sync_profile(user, officer_data)
        return user

    def update(self, instance, validated_data):
        officer_data = validated_data.pop("officer", None)
        password = validated_data.pop("password", None)

        for field, value in validated_data.items():
            setattr(instance, field, value)
        if password:
            instance.set_password(password)
        instance.save()
        self._sync_profile(instance, officer_data)
        return instance

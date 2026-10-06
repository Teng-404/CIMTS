from django.db.models import Avg, Count, DurationField, ExpressionWrapper, F, Q
from django.db.models.functions import TruncMonth, TruncYear
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.permissions import IsAdmin
from accounts.models import OfficerProfile
from accounts.serializers import RecommendedOfficerSerializer
from notifications.utils import notify

from .models import Incident, IncidentPhoto, IncidentUpdate, StatusLog
from .serializers import IncidentCreateSerializer, IncidentSerializer
from .services import best_officer, rank_officers


class IncidentViewSet(viewsets.ModelViewSet):
    """
    Endpoint กลางของทุกพอร์ทัล — ขอบเขตข้อมูลขึ้นกับบทบาท:
      user    เห็นเฉพาะเหตุที่ตนแจ้ง
      officer เห็นเฉพาะงานที่ได้รับมอบหมาย
      admin   เห็นทั้งหมด
    """

    permission_classes = [IsAuthenticated]
    lookup_field = "number"
    lookup_value_regex = r"\d+"

    def get_serializer_class(self):
        return IncidentCreateSerializer if self.action == "create" else IncidentSerializer

    def get_permissions(self):
        if self.action in ("assign", "close", "reopen", "remind", "recommend", "destroy", "dashboard", "monthly"):
            return [IsAdmin()]
        return [IsAuthenticated()]

    def get_queryset(self):
        qs = (Incident.objects
              .select_related("cat", "pri", "zone", "reporter", "assignee")
              .prefetch_related("updates__photos", "photos"))
        user = self.request.user

        if user.role == "user":
            qs = qs.filter(reporter=user)
        elif user.role == "officer":
            qs = qs.filter(assignee=user)

        params = self.request.query_params
        if cat := params.get("cat"):
            qs = qs.filter(cat_id=cat)
        if pri := params.get("pri"):
            qs = qs.filter(pri_id=pri)
        if zone := params.get("zone"):
            qs = qs.filter(zone_id=zone)
        if st := params.get("status"):
            # "progress" ในตัวกรองของ admin รวม review ด้วย (ดู FILTERS ใน shared.js)
            qs = qs.filter(status__in=["progress", "review"]) if st == "progress" else qs.filter(status=st)
        if owner := params.get("owner"):
            qs = qs.filter(assignee__isnull=True) if owner == "none" else qs.filter(assignee__username=owner)
        if q := params.get("q"):
            qs = qs.filter(
                Q(title__icontains=q) | Q(place__icontains=q)
                | Q(reporter_name__icontains=q) | Q(note__icontains=q)
            )
        return qs

    def perform_create(self, serializer):
        incident = serializer.save()
        StatusLog.objects.create(
            incident=incident, status=incident.status,
            actor=self.request.user, note="รับเรื่องเข้าระบบ",
        )
        notify(
            message=f"เหตุใหม่ {incident.code}: {incident.title} — {incident.place}",
            kind="new_incident", incident=incident, to_admins=True,
        )

        # เหตุฉุกเฉินมอบหมายอัตโนมัติ ไม่ต้องรอผู้ประสานงานยืนยัน
        if incident.pri.auto_assign:
            officer = best_officer(incident)
            if officer:
                self._do_assign(incident, officer.user, actor=None, auto=True)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        incident = serializer.instance
        incident.refresh_from_db()
        return Response(
            IncidentSerializer(incident, context=self.get_serializer_context()).data,
            status=status.HTTP_201_CREATED,
        )

    # ---------- helper ----------

    def _do_assign(self, incident, officer_user, actor=None, auto=False):
        now = timezone.now()
        incident.assignee = officer_user
        incident.assigned_at = now
        incident.ack_at = None
        incident.status = Incident.Status.PROGRESS
        incident.save(update_fields=["assignee", "assigned_at", "ack_at", "status"])

        StatusLog.objects.create(
            incident=incident, status=incident.status, actor=actor,
            note=f"มอบหมายให้ {officer_user.full_name}" + (" (อัตโนมัติ)" if auto else ""),
        )
        notify(
            message=f"ได้รับมอบหมายงาน {incident.code}: {incident.title} — {incident.place}",
            kind="assigned", incident=incident, recipient=officer_user,
        )
        return incident

    def _respond(self, incident):
        incident.refresh_from_db()
        return Response(IncidentSerializer(incident, context=self.get_serializer_context()).data)

    # ---------- การทำงานของผู้ประสานงาน ----------

    @action(detail=True, methods=["post"])
    def assign(self, request, number=None):
        """มอบหมาย/เปลี่ยนผู้รับผิดชอบ body: { officer: "<username>" }"""
        incident = self.get_object()
        username = request.data.get("officer")
        profile = (OfficerProfile.objects
                   .select_related("user")
                   .filter(user__username=username, user__is_active=True)
                   .first())
        if not profile:
            return Response({"detail": "ไม่พบเจ้าหน้าที่"}, status=status.HTTP_404_NOT_FOUND)

        self._do_assign(incident, profile.user, actor=request.user)
        return self._respond(incident)

    @action(detail=True, methods=["get"])
    def recommend(self, request, number=None):
        """เจ้าหน้าที่ที่ระบบแนะนำสำหรับเหตุนี้ — ใช้ในหน้ามอบหมายงาน"""
        incident = self.get_object()
        limit = int(request.query_params.get("limit", 5))
        ranked = rank_officers(incident, limit=limit)
        return Response(RecommendedOfficerSerializer(ranked, many=True).data)

    @action(detail=True, methods=["post"])
    def close(self, request, number=None):
        """ผู้ประสานงานตรวจผลแล้วปิดงาน"""
        incident = self.get_object()
        incident.status = Incident.Status.DONE
        incident.closed_at = timezone.now()
        incident.save(update_fields=["status", "closed_at"])
        StatusLog.objects.create(incident=incident, status="done", actor=request.user, note="ปิดงาน")
        if incident.assignee:
            notify(message=f"ปิดงาน {incident.code} เรียบร้อย", kind="closed",
                   incident=incident, recipient=incident.assignee)
        if incident.reporter:
            notify(message=f"เหตุ {incident.code} ที่คุณแจ้งดำเนินการเสร็จสิ้นแล้ว",
                   kind="closed", incident=incident, recipient=incident.reporter)
        return self._respond(incident)

    @action(detail=True, methods=["post"])
    def reopen(self, request, number=None):
        """ตีกลับให้ช่างแก้ไขเพิ่ม"""
        incident = self.get_object()
        incident.status = Incident.Status.PROGRESS
        incident.submitted_at = None
        incident.closed_at = None
        incident.save(update_fields=["status", "submitted_at", "closed_at"])
        note = request.data.get("note", "")
        StatusLog.objects.create(incident=incident, status="progress", actor=request.user,
                                 note=f"ตีกลับให้แก้ไขเพิ่ม {note}".strip())
        if incident.assignee:
            notify(message=f"งาน {incident.code} ถูกตีกลับให้แก้ไขเพิ่ม", kind="assigned",
                   incident=incident, recipient=incident.assignee)
        return self._respond(incident)

    @action(detail=True, methods=["post"])
    def remind(self, request, number=None):
        """
        ส่งแจ้งเตือนซ้ำไปยังเจ้าหน้าที่ที่ยังไม่รับทราบงาน
        นับจำนวนครั้งไว้เพื่อให้ผู้ประสานงานเห็นว่าติดตามไปกี่รอบแล้ว
        """
        incident = self.get_object()
        if not incident.assignee:
            return Response({"detail": "งานนี้ยังไม่ได้มอบหมาย"}, status=status.HTTP_400_BAD_REQUEST)

        incident.reminder_count += 1
        incident.last_reminder_at = timezone.now()
        incident.save(update_fields=["reminder_count", "last_reminder_at"])

        notify(
            message=f"แจ้งเตือนซ้ำครั้งที่ {incident.reminder_count}: "
                    f"{incident.code} {incident.title} — {incident.place}",
            kind="overdue", incident=incident, recipient=incident.assignee,
        )
        return self._respond(incident)

    # ---------- การทำงานของเจ้าหน้าที่ภาคสนาม ----------

    @action(detail=True, methods=["post"])
    def acknowledge(self, request, number=None):
        """ช่างกดรับทราบงาน — ทำให้สถานะฝั่งช่างเปลี่ยนจาก pending_ack เป็น progress"""
        incident = self.get_object()
        if incident.assignee_id != request.user.id:
            return Response({"detail": "งานนี้ไม่ได้มอบหมายให้คุณ"}, status=status.HTTP_403_FORBIDDEN)
        if incident.ack_at:
            return self._respond(incident)

        incident.ack_at = timezone.now()
        incident.save(update_fields=["ack_at"])
        StatusLog.objects.create(incident=incident, status=incident.status,
                                 actor=request.user, note="เจ้าหน้าที่รับทราบงาน")
        notify(message=f"เจ้าหน้าที่รับทราบงาน {incident.code} แล้ว", kind="acknowledged",
               incident=incident, recipient=incident.reporter, to_admins=True)
        return self._respond(incident)

    @action(detail=True, methods=["post"], url_path="update-result")
    def update_result(self, request, number=None):
        """
        ช่างบันทึกผลการดำเนินงาน (ส่งได้หลายรอบ)
        รอบแรกดันสถานะเป็น review รอบถัดไปเป็นข้อมูลเพิ่มเติม
        body (multipart): note, photos[]
        """
        incident = self.get_object()
        if incident.assignee_id != request.user.id:
            return Response({"detail": "งานนี้ไม่ได้มอบหมายให้คุณ"}, status=status.HTTP_403_FORBIDDEN)

        note = (request.data.get("note") or "").strip()
        if not note:
            return Response({"detail": "กรุณากรอกผลการดำเนินงาน"}, status=status.HTTP_400_BAD_REQUEST)

        entry = IncidentUpdate.objects.create(incident=incident, author=request.user, note=note)
        for f in request.FILES.getlist("photos"):
            IncidentPhoto.objects.create(incident=incident, update=entry, file=f)

        was_review = incident.status == Incident.Status.REVIEW
        if not was_review:
            incident.status = Incident.Status.REVIEW
            incident.submitted_at = timezone.now()
            if incident.ack_at is None:
                incident.ack_at = timezone.now()
            incident.save(update_fields=["status", "submitted_at", "ack_at"])
            StatusLog.objects.create(incident=incident, status="review",
                                     actor=request.user, note="ส่งผลให้ผู้ประสานงานตรวจสอบ")
            notify(message=f"{incident.code} ส่งผลรอการตรวจสอบ", kind="submitted",
                   incident=incident, to_admins=True)
        return self._respond(incident)

    # ---------- สรุปข้อมูล ----------

    @action(detail=False, methods=["get"])
    def dashboard(self, request):
        """ตัวเลขสรุปสำหรับหน้าแดชบอร์ดและหน้ารายงานของผู้ดูแล"""
        qs = Incident.objects.all()
        now = timezone.now()

        overdue = [i.id for i in qs.exclude(status="done").select_related("pri") if i.is_overdue]

        assign_dur = ExpressionWrapper(F("assigned_at") - F("reported_at"), output_field=DurationField())
        resolve_dur = ExpressionWrapper(F("closed_at") - F("reported_at"), output_field=DurationField())

        by_priority = []
        # ต้อง order_by() ว่างก่อน มิฉะนั้น ordering ของ model จะทำให้ distinct() ไม่ทำงาน
        for pri_key in qs.order_by().values_list("pri_id", flat=True).distinct():
            sub = qs.filter(pri_id=pri_key)
            a = sub.exclude(assigned_at=None).annotate(d=assign_dur).aggregate(v=Avg("d"))["v"]
            r = sub.exclude(closed_at=None).annotate(d=resolve_dur).aggregate(v=Avg("d"))["v"]
            by_priority.append({
                "pri": pri_key,
                "avgAssignSec": a.total_seconds() if a else None,
                "avgResolveSec": r.total_seconds() if r else None,
            })

        return Response({
            "total": qs.count(),
            "pending": qs.filter(status="pending").count(),
            "progress": qs.filter(status__in=["progress", "review"]).count(),
            "review": qs.filter(status="review").count(),
            "done": qs.filter(status="done").count(),
            "overdue": len(overdue),
            "byStatus": list(qs.values("status").annotate(n=Count("id"))),
            "byCategory": list(qs.values("cat_id").annotate(n=Count("id")).order_by("-n")),
            "byZone": list(qs.values("zone_id").annotate(n=Count("id")).order_by("-n")),
            "byPriority": by_priority,
        })

    @action(detail=False, methods=["get"])
    def monthly(self, request):
        """
        จำนวนเหตุรายเดือนของปีที่ระบุ สำหรับกราฟแท่งในหน้ารายงาน
        query: year=2569 (พ.ศ.) — ถ้าไม่ระบุใช้ปีปัจจุบัน
        คืน 12 ค่าเสมอ (ม.ค.-ธ.ค.) เดือนที่ยังไม่ถึงจะเป็น 0
        """
        now = timezone.localtime()
        year_be = int(request.query_params.get("year", now.year + 543))
        year_ce = year_be - 543

        rows = (Incident.objects
                .filter(reported_at__year=year_ce)
                .annotate(m=TruncMonth("reported_at"))
                .values("m")
                .annotate(n=Count("id")))

        values = [0] * 12
        for row in rows:
            values[timezone.localtime(row["m"]).month - 1] = row["n"]

        # ปีปัจจุบัน: ตัดเดือนที่ยังมาไม่ถึงออก เพื่อไม่ให้กราฟมีหางเป็นศูนย์ยาว
        if year_ce == now.year:
            values = values[:now.month]

        return Response({
            "year": year_be,
            "values": values,
            "isCurrentYear": year_ce == now.year,
        })

    @action(detail=False, methods=["get"], url_path="monthly-years")
    def monthly_years(self, request):
        """ปี พ.ศ. ที่มีข้อมูลอยู่จริง สำหรับ dropdown เลือกปี"""
        years = (Incident.objects
                 .annotate(y=TruncYear("reported_at"))
                 .order_by()
                 .values_list("y", flat=True)
                 .distinct())
        result = sorted({timezone.localtime(y).year + 543 for y in years if y}, reverse=True)
        current = timezone.localtime().year + 543
        if current not in result:
            result.insert(0, current)
        return Response(result)

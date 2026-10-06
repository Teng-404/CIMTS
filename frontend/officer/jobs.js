'use strict';

/* หน้างานของฉัน (หน้าแรกของพอร์ทัลเจ้าหน้าที่) — บอร์ดงาน 3 คอลัมน์ตามขั้นตอน + สรุปภาพรวม
   ข้อมูล หน้าต่างรายละเอียด/อัปเดตผล และเมนูมาจาก shared.js (ต้องโหลดก่อนไฟล์นี้) */

mountShell('jobs');

const PRIORITY_RANK = { emergency: 0, urgent: 1, normal: 2 };

function jobCardHtml(j) {
  const overdue = isOverdue(j);
  const btn = j.status === 'pending_ack'
    ? `<button type="button" class="btn btn-sm btn-primary" data-action="acknowledge" data-id="${j.id}">รับทราบงาน</button>`
    : `<button type="button" class="btn btn-sm btn-primary" data-action="update" data-id="${j.id}">อัปเดตผล</button>`;

  return `
    <div class="job-card${overdue ? ' job-card--overdue' : ''}" tabindex="0" data-action="detail" data-id="${j.id}">
      <div class="job-top">
        <span class="job-id">${j.id}</span>
        ${priorityBadge(j.pri)}
      </div>
      <div class="job-title">${esc(j.title)}</div>
      <div class="job-place">${icon('map-pin', 'icon--xs')}<span>${esc(j.place)}</span></div>
      <div class="job-foot">
        <span class="job-time${overdue ? ' is-late' : ''}" data-tick="ago" data-ts="${j.reportedAt}"></span>
        ${btn}
      </div>
    </div>`;
}

function columnHtml(jobs, emptyText) {
  if (!jobs.length) return `<div class="empty">${icon('check')}<span>${emptyText}</span></div>`;
  return jobs.map(jobCardHtml).join('');
}

function renderEmergency() {
  const box = $('emergency');
  const list = state.jobs.filter((j) => j.status === 'pending_ack' && j.pri === 'emergency').sort((a, b) => a.reportedAt - b.reportedAt);

  if (!list.length) {
    box.hidden = true;
    box.innerHTML = '';
    return;
  }

  const j = list[0];
  box.hidden = false;
  box.innerHTML = `
    <span class="emergency-icon">${icon('alert')}</span>
    <div class="emergency-text">
      <strong>ฉุกเฉินต้องรับทราบ · <span class="nowrap">${j.id}</span>${list.length > 1 ? `<span class="emergency-more">อีก ${list.length - 1} รายการ</span>` : ''}</strong>
      <span>${esc(j.title)} — ${esc(j.place)}</span>
    </div>
    <div class="emergency-timer"><span>เวลาที่ผ่านมา</span><b data-tick="elapsed" data-ts="${j.reportedAt}"></b></div>
    <button type="button" class="btn btn-danger-outline" data-action="detail" data-id="${j.id}">ตรวจสอบทันที</button>`;
}

function renderStats() {
  const c = counts();
  const emergencyPending = state.jobs.filter((j) => j.status === 'pending_ack' && j.pri === 'emergency').length;
  const doneJobs = state.jobs.filter((j) => j.status === 'done');
  const onTime = doneJobs.filter((j) => j.closedAt <= resolveDeadline(j)).length;
  const slaRate = doneJobs.length ? Math.round((onTime / doneJobs.length) * 100) : 100;
  const avgResolve = doneJobs.length ? doneJobs.reduce((sum, j) => sum + (j.closedAt - j.reportedAt), 0) / doneJobs.length / 1000 : null;

  const cards = [
    { label: 'รอรับทราบ', value: c.pending_ack, sub: emergencyPending ? `มีเหตุฉุกเฉิน ${emergencyPending} งาน` : 'ไม่มีงานค้างรับทราบ', icon: 'clipboard', tone: emergencyPending ? 'red' : 'blue' },
    { label: 'กำลังดำเนินการ', value: c.progress, sub: 'งานปัจจุบันของคุณ', icon: 'hourglass', tone: 'blue' },
    { label: 'เสร็จสิ้นวันนี้', value: c.doneToday, sub: `ตรงตาม SLA ${slaRate}%`, icon: 'check', tone: 'green' },
    { label: 'เวลาเฉลี่ยต่องาน', value: avgResolve === null ? '—' : fmtHuman(avgResolve), sub: `อัตราตรงเวลา ${slaRate}%`, icon: 'bar-chart', tone: 'blue' },
  ];

  $('stats').innerHTML = cards.map((s) => `
    <div class="stat stat--static">
      <span class="stat-icon stat-icon--${s.tone}">${icon(s.icon)}</span>
      <span class="stat-body"><span class="stat-label">${s.label}</span><span class="stat-value">${s.value}</span><span class="stat-sub">${s.sub}</span></span>
    </div>`).join('');

  const urgentActive = state.jobs.filter((j) => isActive(j) && (j.pri === 'urgent' || j.pri === 'emergency')).length;
  $('pageSub').textContent = `วันนี้มี ${c.active} งาน · เหตุเร่งด่วน ${urgentActive} งาน`;
}

function renderBoard() {
  // เรียงงานฉุกเฉิน/เร่งด่วนขึ้นก่อนเสมอ แม้จะเพิ่งเข้ามาทีหลังงานปกติที่ค้างอยู่นานกว่า
  const byStatus = (status) => state.jobs.filter((j) => j.status === status).sort((a, b) => PRIORITY_RANK[a.pri] - PRIORITY_RANK[b.pri] || a.reportedAt - b.reportedAt);

  const pendingAck = byStatus('pending_ack');
  const progress = byStatus('progress');
  const review = byStatus('review');

  $('countPendingAck').textContent = pendingAck.length ? `${pendingAck.length} งาน` : '';
  $('countProgress').textContent = progress.length ? `${progress.length} งาน` : '';
  $('countReview').textContent = review.length ? `${review.length} งาน` : '';

  $('colPendingAck').innerHTML = columnHtml(pendingAck, 'ไม่มีงานรอรับทราบ');
  $('colProgress').innerHTML = columnHtml(progress, 'ไม่มีงานที่กำลังดำเนินการ');
  $('colReview').innerHTML = columnHtml(review, 'ไม่มีงานรอตรวจสอบผล');
}

function render() {
  renderStats();
  renderEmergency();
  renderBoard();
  renderShellCounts();
}

/* ---------- Init ---------- */

boot();
startTicker();

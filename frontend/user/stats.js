'use strict';

/* หน้าสถิติของฉัน — ภาพรวมจำนวน สัดส่วนตามประเภท สถานะ และเวลาดำเนินการเฉลี่ยของรายการที่ฉันเคยแจ้ง
   ข้อมูล และเมนูมาจาก shared.js (ต้องโหลดก่อนไฟล์นี้) */

mountShell('stats');

function avgResolveSec() {
  const done = state.incidents.filter((i) => i.status === 'done' && i.closedAt);
  if (!done.length) return null;
  return done.reduce((sum, i) => sum + (i.closedAt - i.reportedAt), 0) / done.length / 1000;
}

function renderStats() {
  const c = counts();
  const avg = avgResolveSec();

  const cards = [
    { label: 'รายการทั้งหมด', value: `${c.all} รายการ`, icon: 'clipboard', tone: 'blue' },
    { label: 'เสร็จสิ้นแล้ว', value: `${c.done} รายการ`, icon: 'check', tone: 'green' },
    { label: 'กำลังดำเนินการ', value: `${c.active} รายการ`, icon: 'hourglass', tone: 'blue' },
    { label: 'เวลาดำเนินการเฉลี่ย', value: avg === null ? '—' : fmtHuman(avg), icon: 'bar-chart', tone: 'blue' },
  ];

  $('stats').innerHTML = cards.map((s) => `
    <div class="stat stat--static">
      <span class="stat-icon stat-icon--${s.tone}">${icon(s.icon)}</span>
      <span class="stat-body"><span class="stat-label">${s.label}</span><span class="stat-value">${s.value}</span></span>
    </div>`).join('');
}

function renderCategory() {
  const rows = Object.entries(CATEGORIES)
    .map(([key, c]) => ({ ...c, n: state.incidents.filter((i) => i.cat === key).length }))
    .filter((r) => r.n > 0)
    .sort((a, b) => b.n - a.n);
  $('categoryBody').innerHTML = donutHtml(rows, { ariaPrefix: 'สัดส่วนเหตุตามประเภทที่เคยแจ้ง' });
}

function renderStatusBreakdown() {
  const total = state.incidents.length;
  const rows = Object.entries(STATUSES).map(([key, label]) => ({ key, label, n: state.incidents.filter((i) => i.status === key).length }));

  $('statusBody').innerHTML = rows.map((r) => `
    <div class="rank-row">
      <span class="rank-label">${esc(r.label)}</span>
      <div class="bar bar--ok"><span style="width:${total ? Math.max(r.n ? 6 : 0, (r.n / total) * 100) : 0}%"></span></div>
      <span class="rank-value">${r.n} รายการ</span>
    </div>`).join('');
}

function render() {
  renderStats();
  renderCategory();
  renderStatusBreakdown();
  renderShellCounts();
}

/* ---------- Init ---------- */

boot();

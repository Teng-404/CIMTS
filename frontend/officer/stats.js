'use strict';

/* หน้าสถิติของฉัน — ภาพรวมจำนวนงาน อัตราตรงเวลา สัดส่วนตามประเภท และสถานะทั้งหมดของฉัน
   ข้อมูล และเมนูมาจาก shared.js (ต้องโหลดก่อนไฟล์นี้) */

mountShell('stats');

function doneStats() {
  const done = state.jobs.filter((j) => j.status === 'done');
  const onTime = done.filter((j) => j.closedAt <= resolveDeadline(j)).length;
  const avg = done.length ? done.reduce((sum, j) => sum + (j.closedAt - j.reportedAt), 0) / done.length / 1000 : null;
  return { done, onTimeRate: done.length ? Math.round((onTime / done.length) * 100) : null, avg };
}

function renderStats() {
  const c = counts();
  const { done, onTimeRate, avg } = doneStats();

  const cards = [
    { label: 'งานทั้งหมด', value: `${c.all} งาน`, icon: 'clipboard', tone: 'blue' },
    { label: 'เสร็จสิ้นแล้ว', value: `${done.length} งาน`, icon: 'check', tone: 'green' },
    { label: 'เวลาดำเนินการเฉลี่ย', value: avg === null ? '—' : fmtHuman(avg), icon: 'bar-chart', tone: 'blue' },
    { label: 'อัตราตรงเวลา (SLA)', value: onTimeRate === null ? '—' : `${onTimeRate}%`, icon: 'hourglass', tone: onTimeRate !== null && onTimeRate < 80 ? 'red' : 'green' },
  ];

  $('stats').innerHTML = cards.map((s) => `
    <div class="stat stat--static">
      <span class="stat-icon stat-icon--${s.tone}">${icon(s.icon)}</span>
      <span class="stat-body"><span class="stat-label">${s.label}</span><span class="stat-value">${s.value}</span></span>
    </div>`).join('');
}

function renderCategory() {
  const rows = Object.entries(CATEGORIES)
    .map(([key, c]) => ({ ...c, n: state.jobs.filter((j) => j.cat === key).length }))
    .filter((r) => r.n > 0)
    .sort((a, b) => b.n - a.n);
  $('categoryBody').innerHTML = donutHtml(rows, { ariaPrefix: 'สัดส่วนงานตามประเภท' });
}

function renderStatusBreakdown() {
  const total = state.jobs.length;
  const rows = Object.entries(STATUSES).map(([key, label]) => ({ key, label, n: state.jobs.filter((j) => j.status === key).length }));

  $('statusBody').innerHTML = rows.map((r) => `
    <div class="rank-row">
      <span class="rank-label">${esc(r.label)}</span>
      <div class="bar bar--ok"><span style="width:${total ? Math.max(r.n ? 6 : 0, (r.n / total) * 100) : 0}%"></span></div>
      <span class="rank-value">${r.n} งาน</span>
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

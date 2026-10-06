'use strict';

/* หน้ารายงานและสถิติ — ภาพรวมจำนวนเหตุ แนวโน้มรายเดือน สัดส่วนตามประเภท/พื้นที่ และเวลาตอบสนองเฉลี่ย
   ข้อมูล และเมนูมาจาก shared.js (ต้องโหลดก่อนไฟล์นี้)

   กราฟรายเดือนดึงจาก /api/incidents/monthly/ ซึ่งนับจากเหตุจริงทั้งหมดในฐานข้อมูล
   ปีที่เลือกได้มาจาก /api/incidents/monthly-years/ (เฉพาะปีที่มีข้อมูลจริง) */

mountShell('reports');

const MONTH_LABELS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

const CURRENT_YEAR_BE = new Date().getFullYear() + 543;

// ข้อมูลรายเดือนมาจาก /api/incidents/monthly/ (คำนวณจากเหตุจริงทั้งหมดในระบบ)
// เก็บผลที่โหลดแล้วไว้ เพื่อไม่ต้องเรียกซ้ำเมื่อสลับปีไปมา
const monthlyCache = new Map();
const view = { year: CURRENT_YEAR_BE, years: [CURRENT_YEAR_BE] };

/* ---------- Data ---------- */

async function monthlyValues(yearBE) {
  if (monthlyCache.has(yearBE)) return monthlyCache.get(yearBE);
  const data = await api(`/api/incidents/monthly/?year=${yearBE}`);
  monthlyCache.set(yearBE, data);
  return data;
}

function zoneStats() {
  return ZONES
    .map((zone) => ({ zone, n: state.incidents.filter((i) => i.zone === zone).length }))
    .filter((z) => z.n > 0)
    .sort((a, b) => b.n - a.n);
}

// เวลาเฉลี่ยจากแจ้งเหตุ → มอบหมาย และแจ้งเหตุ → ปิดงาน แยกตามระดับความเร่งด่วน (นับเฉพาะเหตุที่ถึงขั้นตอนนั้นแล้วจริง)
function avgDuration(list, fromKey, toKey) {
  const done = list.filter((i) => i[fromKey] && i[toKey]);
  if (!done.length) return null;
  return done.reduce((sum, i) => sum + (i[toKey] - i[fromKey]), 0) / done.length / 1000;
}

function responseStats() {
  return Object.entries(PRIORITIES).map(([key, p]) => {
    const list = state.incidents.filter((i) => i.pri === key);
    return { key, label: p.label, avgAssign: avgDuration(list, 'reportedAt', 'assignedAt'), avgResolve: avgDuration(list, 'reportedAt', 'closedAt') };
  });
}

/* ---------- Rendering ---------- */

function renderStats() {
  const total = state.incidents.length;
  const done = state.incidents.filter((i) => i.status === 'done').length;
  const active = state.incidents.filter((i) => i.status === 'progress' || i.status === 'review').length;
  const overdue = state.incidents.filter(isOverdue).length;

  const cards = [
    { label: 'แจ้งเหตุทั้งหมด', icon: 'clipboard', tone: 'blue', value: total, href: 'incidents.html' },
    { label: 'ดำเนินการเสร็จสิ้น', icon: 'check', tone: 'green', value: done, href: 'incidents.html?status=done' },
    { label: 'กำลังดำเนินการ', icon: 'hourglass', tone: 'blue', value: active, href: 'incidents.html?status=progress' },
    { label: 'เกิน SLA', icon: 'flame', tone: 'red', value: overdue, href: 'incidents.html?status=overdue' },
  ];

  $('reportStats').innerHTML = cards.map((c) => `
    <a class="stat" href="${c.href}">
      <span class="stat-icon stat-icon--${c.tone}">${icon(c.icon)}</span>
      <span class="stat-body"><span class="stat-label">${c.label}</span><span class="stat-value">${c.value} รายการ</span></span>
    </a>`).join('');
}

function renderYearSelect() {
  $('yearSelect').innerHTML = view.years
    .map((y) => `<option value="${y}"${y === view.year ? ' selected' : ''}>ปี ${y}${y === CURRENT_YEAR_BE ? ' (ถึงเดือนนี้)' : ''}</option>`)
    .join('');
}

async function renderMonthly() {
  const { values, isCurrentYear } = await monthlyValues(view.year);
  const labels = MONTH_LABELS.slice(0, values.length);
  $('monthlyBody').innerHTML = barChartSvg(values, labels, {
    highlightLast: isCurrentYear,
    summaryPrefix: `จำนวนเหตุที่แจ้งรายเดือนของปี ${view.year}: `,
  });
}

function renderCategory() {
  const rows = Object.entries(CATEGORIES)
    .map(([key, c]) => ({ ...c, n: state.incidents.filter((i) => i.cat === key).length }))
    .filter((r) => r.n > 0)
    .sort((a, b) => b.n - a.n);
  $('categoryBody').innerHTML = donutHtml(rows, { ariaPrefix: 'สัดส่วนเหตุตามประเภท' });
}

function renderZones() {
  const rows = zoneStats();
  if (!rows.length) {
    $('zoneBody').innerHTML = `<div class="empty">${icon('inbox')}<span>ยังไม่มีข้อมูล</span></div>`;
    return;
  }
  const max = rows[0].n;
  $('zoneBody').innerHTML = rows.map((z) => `
    <div class="rank-row">
      <span class="rank-label">${esc(z.zone)}</span>
      <div class="bar bar--ok"><span style="width:${Math.max(6, (z.n / max) * 100)}%"></span></div>
      <span class="rank-value">${z.n} เหตุ</span>
    </div>`).join('');
}

function renderResponse() {
  $('responseBody').innerHTML = responseStats().map((r) => `
    <div class="resp-row">
      ${priorityBadge(r.key)}
      <div class="resp-metric"><span class="resp-label">มอบหมายเฉลี่ย</span><strong>${r.avgAssign === null ? '—' : fmtHuman(r.avgAssign)}</strong></div>
      <div class="resp-metric"><span class="resp-label">แก้ไขเสร็จเฉลี่ย</span><strong>${r.avgResolve === null ? '—' : fmtHuman(r.avgResolve)}</strong></div>
    </div>`).join('');
}

function render() {
  renderStats();
  renderYearSelect();
  renderMonthly().catch(() => {
    $('monthlyBody').innerHTML = `<div class="empty">${icon('inbox')}<span>โหลดสถิติรายเดือนไม่สำเร็จ</span></div>`;
  });
  renderCategory();
  renderZones();
  renderResponse();
  renderShellCounts();
}

/* ---------- Events ---------- */

$('yearSelect').addEventListener('change', (event) => {
  view.year = Number(event.target.value);
  renderMonthly().catch(() => {});
});

/* ---------- Init ---------- */

// โหลดรายการปีที่มีข้อมูลจริงก่อน แล้วค่อยวาดหน้า
async function onReady() {
  try {
    const years = await api('/api/incidents/monthly-years/');
    if (years.length) {
      view.years = years;
      if (!years.includes(view.year)) view.year = years[0];
    }
  } catch {
    // ใช้ปีปัจจุบันเป็นค่าเริ่มต้นต่อไป
  }
}

boot();
startTicker();

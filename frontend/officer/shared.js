'use strict';

/* CampusCare Incident Center — พอร์ทัลเจ้าหน้าที่ภาคสนาม (ช่างซ่อมบำรุง)
   โค้ดที่ใช้ร่วมกันทุกหน้าของเจ้าหน้าที่ (งานของฉัน / ประวัติงาน / สถิติของฉัน / ตารางเข้าเวร)
   แยกต่างหากจากฝั่งผู้ประสานงาน (ดู admin/shared.js) และฝั่งผู้แจ้ง (ดู user/shared.js) เพราะเป็นคนละสิทธิ์
   ใช้ธีมสีและคอมโพเนนต์ร่วมกันเท่านั้น ข้อมูลเป็นอิสระต่อกัน

   วิธีใช้: โหลดไฟล์นี้ก่อนสคริปต์ของแต่ละหน้า แล้วในสคริปต์ของหน้านั้น
     1) เรียก mountShell('<คีย์เมนู>') เพื่อสร้างเมนูซ้ายและแถบบน
     2) ประกาศฟังก์ชัน render() ของหน้านั้นเอง — shared.js จะเรียก refresh() → render() ทุกครั้งที่ข้อมูลเปลี่ยน
   จากนั้นเรียก boot() หนึ่งครั้งเพื่อโหลดข้อมูลและวาดหน้า และ startTicker() ถ้าหน้านั้นมีตัวนับเวลาสด

   ข้อมูลทั้งหมดมาจาก backend จริงผ่าน REST API (ดู api() ด้านล่าง)
   ค่าอ้างอิง (CATEGORIES / PRIORITIES) โหลดจากเซิร์ฟเวอร์ตอนเปิดหน้าแล้วเติมลงตัวแปรเดิม
   จึงไม่ต้องแก้สคริปต์ของแต่ละหน้า

   ต้องเปิดหน้าเว็บผ่าน http://127.0.0.1:8000/officer/... (ที่ Django เสิร์ฟ)
   ไม่ใช่ file:// มิฉะนั้น session cookie จะใช้ไม่ได้ */

/* ---------- Config & reference data ---------- */

// ผู้ใช้ที่ล็อกอินอยู่ (ตัวอย่าง) — ใช้ชื่อเดียวกับเจ้าหน้าที่ "สมชาย แสงทอง" (o1) ในฝั่งผู้ดูแล เพื่อความต่อเนื่องของเรื่องราว
const CONFIG = {
  // ผู้ใช้ที่ล็อกอินอยู่ — เติมจาก /api/auth/me ตอนเปิดหน้า
  user: { title: '', firstName: '', lastName: '', role: '' },
  loginUrl: '../login/login.html',
};

/* ---------- การเรียก API ----------
   Django ใช้ session cookie + CSRF token
   - cookie ติดไปเองทุกคำขอ (credentials: 'same-origin')
   - POST ต้องแนบ header X-CSRFToken มิฉะนั้นจะได้ 403
   ถ้าเซสชันหมดอายุ (401/403) จะพากลับไปหน้าล็อกอินอัตโนมัติ

   ต้องเปิดหน้าเว็บผ่าน http://127.0.0.1:8000/officer/... (ที่ Django เสิร์ฟ)
   ไม่ใช่ file:// มิฉะนั้น session cookie จะใช้ไม่ได้ */

const readCookie = (name) =>
  document.cookie.split('; ').find((row) => row.startsWith(`${name}=`))?.split('=')[1] ?? '';

async function csrfToken() {
  const existing = readCookie('csrftoken');
  if (existing) return existing;
  const response = await fetch('/api/auth/csrf', { credentials: 'same-origin' });
  const data = await response.json();
  return data.csrfToken;
}

async function api(path, { method = 'GET', body } = {}) {
  const options = { method, credentials: 'same-origin', headers: {} };

  if (method !== 'GET') options.headers['X-CSRFToken'] = await csrfToken();

  if (body !== undefined) {
    if (body instanceof FormData) {
      options.body = body;
    } else {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
  }

  const response = await fetch(path, options);

  if (response.status === 401 || response.status === 403) {
    location.href = CONFIG.loginUrl;
    throw new Error('unauthenticated');
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    // บางคำตอบไม่มี body
  }
  if (!response.ok) {
    throw new Error(data?.detail || 'ระบบขัดข้อง กรุณาลองใหม่อีกครั้ง');
  }
  return data;
}

const MIN = 60;
const HOUR = 3600;
const DAY = 86400;

// ค่าอ้างอิงโหลดจาก /api/reference ตอนเปิดหน้า (ดู loadReference)
// assignSec = เวลาสูงสุดที่ควรรับทราบงาน / resolveSec = เวลาสูงสุดที่ควรแก้ไขเสร็จ (SLA เดียวกับฝั่งผู้ดูแล)
const PRIORITIES = {};

const CATEGORIES = {};

// สถานะจากมุมมองเจ้าหน้าที่ 4 ขั้น — "รอรับทราบ" เป็นขั้นที่เพิ่มจากฝั่งผู้ดูแล (งานถูกมอบหมายมาแล้ว แต่เจ้าหน้าที่ยังไม่กดรับทราบ)
// การปิดงานขั้นสุดท้าย (จาก "รอตรวจสอบผล" เป็น "เสร็จสิ้น") เป็นสิทธิ์ของผู้ประสานงาน ไม่ใช่เจ้าหน้าที่ภาคสนาม
const STATUSES = {
  pending_ack: 'รอรับทราบ',
  progress: 'กำลังดำเนินการ',
  review: 'รอตรวจสอบผล',
  done: 'เสร็จสิ้น',
};
const STATUS_BADGE_CLASS = { pending_ack: 'pending', progress: 'progress', review: 'review', done: 'done' };

/* ---------- ชั้นข้อมูล (เชื่อมกับ backend) ---------- */

const state = { jobs: [], onDuty: true, shift: null, ready: false };

// แปลง JSON จาก API ให้เป็นรูปแบบเดียวกับที่สคริปต์ของแต่ละหน้าใช้อยู่
// API ส่ง status เป็นมุมมองของเจ้าหน้าที่ให้แล้ว (pending_ack เมื่อยังไม่กดรับทราบ)
// และส่งเวลาเป็น epoch ms จึงนำไปคำนวณกับ Date.now() ได้ตรงๆ
function mapJob(raw) {
  return {
    id: raw.id,
    title: raw.title,
    cat: raw.cat,
    pri: raw.pri,
    zone: raw.zone,
    place: raw.place,
    note: raw.note ?? '',
    status: raw.status,
    reporter: raw.reporter ?? '',
    reportedAt: raw.reportedAt,
    assignedAt: raw.assignedAt,
    ackAt: raw.ackAt,
    submittedAt: raw.submittedAt,
    closedAt: raw.closedAt,
    // photoUrls = รูปตอนแจ้งเหตุ / afterPhotoUrls = รูปที่ตัวเองแนบตอนบันทึกผล (คนละชุดกัน)
    photoUrls: (raw.photos ?? []).map((p) => p.url),
    afterPhotoUrls: (raw.updates ?? []).flatMap((u) => (u.photos ?? []).map((p) => p.url)),
    updates: raw.updates ?? [],
  };
}

async function loadReference() {
  const ref = await api('/api/reference');
  // เติมลงตัวแปรเดิมแทนการประกาศใหม่ เพราะสคริปต์หน้าอื่นอ้างถึงตัวเดียวกันนี้
  Object.assign(CATEGORIES, ref.categories);
  Object.assign(PRIORITIES, ref.priorities);
}

// backend กรองให้เองแล้วว่าเป็นงานที่มอบหมายให้เจ้าหน้าที่คนนี้เท่านั้น
async function loadJobs() {
  const data = await api('/api/incidents/?page_size=500');
  state.jobs = (data.results ?? data).map(mapJob);
}

async function loadUser() {
  const data = await api('/api/auth/me');
  const u = data.user;
  CONFIG.user = {
    title: u.title || '',
    firstName: u.firstName,
    lastName: u.lastName,
    role: u.roleLabel,
    username: u.username,
  };
  if (data.officer) {
    state.onDuty = data.officer.onDuty;
    // หน้าตารางเข้าเวรใช้ค่านี้แสดงเวลาจริงของเจ้าหน้าที่คนนี้
    state.shift = { shiftStart: data.officer.shiftStart, shiftEnd: data.officer.shiftEnd };
  }
}

async function logout() {
  try {
    await api('/api/auth/logout', { method: 'POST' });
  } catch {
    // ออกจากระบบไม่สำเร็จก็ยังพากลับหน้าล็อกอินอยู่ดี
  }
  location.href = CONFIG.loginUrl;
}

/* ---------- Selectors ---------- */

const $ = (id) => document.getElementById(id);
const esc = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const numOf = (job) => job.id.slice(4);
const findJob = (id) => state.jobs.find((j) => j.id === id);
const isActive = (j) => j.status !== 'done';
const assignDeadline = (j) => j.reportedAt + PRIORITIES[j.pri].assignSec * 1000;
const resolveDeadline = (j) => j.reportedAt + PRIORITIES[j.pri].resolveSec * 1000;
const isOverdue = (j) => isActive(j) && Date.now() > resolveDeadline(j);

function matchesQuery(job, query) {
  const q = query.trim().toLowerCase().replace(/^#/, '');
  if (!q) return true;
  const fields = [job.id, numOf(job), job.title, job.place, CATEGORIES[job.cat].label, job.reporter ?? ''];
  return fields.some((text) => text.toLowerCase().includes(q));
}

function counts() {
  const today = new Date().setHours(0, 0, 0, 0);
  return {
    all: state.jobs.length,
    pending_ack: state.jobs.filter((j) => j.status === 'pending_ack').length,
    progress: state.jobs.filter((j) => j.status === 'progress').length,
    review: state.jobs.filter((j) => j.status === 'review').length,
    active: state.jobs.filter(isActive).length,
    doneToday: state.jobs.filter((j) => j.status === 'done' && j.closedAt >= today).length,
    done: state.jobs.filter((j) => j.status === 'done').length,
    overdue: state.jobs.filter(isOverdue).length,
  };
}

/* ---------- Formatters ---------- */

const pad = (n) => String(Math.floor(n)).padStart(2, '0');

const fmtClock = (sec) => {
  const s = Math.max(0, Math.floor(sec));
  return `${pad(s / 3600)}:${pad((s % 3600) / 60)}:${pad(s % 60)}`;
};

function fmtHuman(sec) {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d} วัน${h % 24 ? ` ${h % 24} ชม.` : ''}`;
  if (h > 0) return `${h} ชม.${m % 60 ? ` ${m % 60} นาที` : ''}`;
  if (m > 0) return `${m} นาที`;
  return 'ไม่กี่วินาที';
}

const fmtAgo = (sec) => (sec < 60 ? 'เมื่อสักครู่' : `${fmtHuman(sec)}ที่แล้ว`);
const fmtCountdown = (sec) => (sec < HOUR ? `${pad(sec / 60)}:${pad(sec % 60)} นาที` : fmtHuman(sec));
const fmtDateTime = (ts) => new Date(ts).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });

function fmtFullDateTime(ts) {
  const d = new Date(ts);
  const date = d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${date} · ${time} น.`;
}

/* ---------- Small HTML builders ---------- */

const icon = (name, cls = '') => `<svg class="icon ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const priorityBadge = (pri) => `<span class="badge badge--${pri}">${PRIORITIES[pri].label}</span>`;
const statusBadge = (j) => `<span class="badge badge--${STATUS_BADGE_CLASS[j.status]}">${STATUSES[j.status]}</span>`;

/* กราฟแท่ง SVG แบบง่าย (ใช้ในหน้าสถิติของฉัน) */
function barChartSvg(values, labels, { highlightLast = false, width = 340, height = 190, summaryPrefix = '' } = {}) {
  if (!values.length) return `<p class="muted small" style="padding:24px;text-align:center">ยังไม่มีข้อมูล</p>`;

  const padX = 8, padTop = 26, padBottom = 30;
  const max = Math.max(10, Math.ceil(Math.max(...values, 1) / 5) * 5);
  const step = (width - padX * 2) / values.length;
  const barW = Math.min(step * 0.55, 34);
  const plotH = height - padTop - padBottom;
  const base = height - padBottom;

  const bars = values.map((v, k) => {
    const h = Math.max(2, (v / max) * plotH);
    const x = padX + k * step + (step - barW) / 2;
    const cx = x + barW / 2;
    const isLast = highlightLast && k === values.length - 1;
    return `
      <rect class="${isLast ? 'bar-today' : 'bar-past'}" x="${x.toFixed(1)}" y="${(base - h).toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="6"/>
      <text class="chart-value" x="${cx.toFixed(1)}" y="${(base - h - 7).toFixed(1)}">${v}</text>
      <text class="chart-label${isLast ? ' is-today' : ''}" x="${cx.toFixed(1)}" y="${height - 8}">${esc(labels[k])}</text>`;
  }).join('');

  const summary = values.map((v, k) => `${labels[k]} ${v}`).join(', ');
  return `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(summaryPrefix + summary)}">
      <line class="grid-line" x1="0" x2="${width}" y1="${base - plotH}" y2="${base - plotH}"/>
      <line class="grid-line" x1="0" x2="${width}" y1="${base - plotH / 2}" y2="${base - plotH / 2}"/>
      <line class="grid-line" x1="0" x2="${width}" y1="${base}" y2="${base}"/>
      ${bars}
    </svg>`;
}

// โดนัทสัดส่วน SVG (ใช้ในหน้าสถิติของฉัน) — rows: [{ label, color, n }, ...] เรียงมากไปน้อยมาก่อนเรียกใช้แล้ว
function donutHtml(rows, { size = 120, radius = 46, cap = 'งาน', ariaPrefix = 'สัดส่วน' } = {}) {
  const total = rows.reduce((sum, r) => sum + r.n, 0);
  if (!total) return `<p class="muted small" style="padding:24px;text-align:center">ยังไม่มีข้อมูล</p>`;

  const c = size / 2;
  const C = 2 * Math.PI * radius;
  let offset = 0;
  const arcs = rows.map((row) => {
    const len = (row.n / total) * C;
    const arc = `<circle cx="${c}" cy="${c}" r="${radius}" fill="none" stroke="${row.color}" stroke-width="18"
      stroke-dasharray="${Math.max(len - 2, 0.5).toFixed(2)} ${(C - Math.max(len - 2, 0.5)).toFixed(2)}"
      stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 ${c} ${c})"/>`;
    offset += len;
    return arc;
  }).join('');

  return `
    <div class="donut-wrap">
      <svg class="donut" viewBox="0 0 ${size} ${size}" role="img" aria-label="${ariaPrefix} รวม ${total} รายการ">
        <circle cx="${c}" cy="${c}" r="${radius}" fill="none" stroke="#eef1f5" stroke-width="18"/>
        ${arcs}
        <text class="donut-total" x="${c}" y="${c + 1}">${total}</text>
        <text class="donut-cap" x="${c}" y="${c + 16}">${esc(cap)}</text>
      </svg>
      <ul class="legend">
        ${rows.map((row) => `<li><span class="dot" style="--c:${row.color}"></span>${esc(row.label)}<span class="n">${row.n}</span><span class="pct">${Math.round((row.n / total) * 100)}%</span></li>`).join('')}
      </ul>
    </div>`;
}

/* ---------- Shell: เมนูซ้ายและแถบบน ---------- */

const ICON_SPRITE = `
<svg class="sprite" aria-hidden="true" focusable="false">
  <symbol id="i-grid" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></symbol>
  <symbol id="i-alert" viewBox="0 0 24 24"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></symbol>
  <symbol id="i-clipboard" viewBox="0 0 24 24"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></symbol>
  <symbol id="i-hourglass" viewBox="0 0 24 24"><path d="M5 22h14"/><path d="M5 2h14"/><path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"/><path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"/></symbol>
  <symbol id="i-check" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></symbol>
  <symbol id="i-bar-chart" viewBox="0 0 24 24"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></symbol>
  <symbol id="i-calendar" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></symbol>
  <symbol id="i-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></symbol>
  <symbol id="i-menu" viewBox="0 0 24 24"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></symbol>
  <symbol id="i-more" viewBox="0 0 24 24"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></symbol>
  <symbol id="i-x" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></symbol>
  <symbol id="i-map-pin" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></symbol>
  <symbol id="i-user" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></symbol>
  <symbol id="i-log-out" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></symbol>
  <symbol id="i-chevron-left" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></symbol>
  <symbol id="i-chevron-right" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></symbol>
  <symbol id="i-inbox" viewBox="0 0 24 24"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></symbol>
  <symbol id="i-upload" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></symbol>
  <symbol id="i-refresh" viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></symbol>
  <symbol id="i-arrow-right" viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></symbol>
</svg>`;

const NAV = [
  { key: 'jobs', label: 'งานของฉัน', icon: 'grid', href: 'jobs.html', badge: 'active' },
  { key: 'history', label: 'ประวัติงานที่เคยทำ', icon: 'alert', href: 'history.html' },
  { key: 'stats', label: 'สถิติของฉัน', icon: 'bar-chart', href: 'stats.html' },
  { key: 'schedule', label: 'ตารางเข้าเวร', icon: 'calendar', href: 'schedule.html' },
];

function mountShell(active) {
  document.body.insertAdjacentHTML('afterbegin', ICON_SPRITE);

  $('sidebar').innerHTML = `
    <div class="sidebar-brand">
      <img class="sidebar-logo" src="logo.png" width="1000" height="252" alt="CampusCare Incident Center">
    </div>

    <nav class="nav">
      ${NAV.map((n) => `
        <a class="nav-item${n.key === active ? ' is-active' : ''}" href="${n.href}"${n.key === active ? ' aria-current="page"' : ''}>
          ${icon(n.icon)}<span>${n.label}</span>${n.badge ? `<span class="nav-badge" data-badge="${n.badge}" hidden></span>` : ''}
        </a>`).join('')}
    </nav>

    <div class="sidebar-user">
      <span class="avatar avatar--brand" id="userAvatar" aria-hidden="true"></span>
      <div class="sidebar-user-text">
        <strong id="userName"></strong>
        <span id="userRole"></span>
      </div>
      <button type="button" class="icon-btn icon-btn--dark" id="userMenuBtn"
              aria-haspopup="true" aria-expanded="false" aria-controls="userMenu" aria-label="เมนูผู้ใช้">${icon('more')}</button>
      <div class="popover" id="userMenu" hidden>
        <button type="button" data-action="reload">${icon('refresh')}โหลดข้อมูลใหม่</button>
        <button type="button" data-action="logout">${icon('log-out')}ออกจากระบบ</button>
      </div>
    </div>`;

  $('topbar').innerHTML = `
    <button type="button" class="icon-btn menu-btn" id="menuBtn" aria-label="เปิดเมนู" aria-controls="sidebar" aria-expanded="false">${icon('menu')}</button>

    <label class="search">
      ${icon('search')}
      <input id="searchInput" type="search" placeholder="ค้นหาเลขที่งาน รายการ หรือสถานที่" autocomplete="off" aria-label="ค้นหางานของฉัน">
    </label>

    <div class="topbar-actions">
      <button type="button" class="duty-toggle" id="dutyToggle" role="switch" aria-checked="true" aria-label="สถานะพร้อมปฏิบัติงาน">
        <span class="duty-dot"></span><span class="duty-label"></span>
      </button>
      <span class="avatar avatar--ring" aria-hidden="true">${icon('user')}</span>
    </div>`;

  renderShellUser();
  renderDutyToggle();

  $('menuBtn').addEventListener('click', openNav);
  $('scrim').addEventListener('click', closeNav);

  $('userMenuBtn').addEventListener('click', () => {
    const open = $('userMenu').hidden;
    $('userMenu').hidden = !open;
    $('userMenuBtn').setAttribute('aria-expanded', String(open));
  });

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.sidebar-user')) closeUserMenu();
  });

  $('dutyToggle').addEventListener('click', async () => {
    const next = !state.onDuty;
    try {
      const profile = await api('/api/auth/my-duty', { method: 'POST', body: { onDuty: next } });
      state.onDuty = profile.onDuty;
      renderDutyToggle();
      toast(state.onDuty ? 'เปลี่ยนเป็น “พร้อมปฏิบัติงาน” แล้ว' : 'เปลี่ยนเป็น “ไม่พร้อมปฏิบัติงาน” แล้ว', 'success');
    } catch (error) {
      toast(`เปลี่ยนสถานะไม่สำเร็จ: ${error.message}`, 'error');
    }
  });

  $('searchInput').addEventListener('input', (event) => {
    if (typeof handleSearch === 'function') handleSearch(event.target.value);
    else if (event.target.value.trim()) location.href = `history.html?q=${encodeURIComponent(event.target.value.trim())}`;
  });
}

// เติมชื่อผู้ใช้ในเมนูซ้าย — เรียกทั้งตอน mountShell() (ยังว่าง) และอีกครั้งหลัง boot() โหลด /api/auth/me เสร็จ
function renderShellUser() {
  const { title, firstName, lastName, role } = CONFIG.user;
  const name = `${title ?? ''}${firstName ?? ''} ${lastName ?? ''}`.trim();
  const nameEl = $('userName');
  if (!nameEl) return;

  nameEl.textContent = name || 'กำลังโหลด…';
  $('userRole').textContent = role ?? '';
  $('userAvatar').textContent = firstName ? firstName[0] : '';
}

function renderDutyToggle() {
  const btn = $('dutyToggle');
  btn.classList.toggle('is-on', state.onDuty);
  btn.setAttribute('aria-checked', String(state.onDuty));
  btn.querySelector('.duty-label').textContent = state.onDuty ? 'พร้อมปฏิบัติงาน' : 'ไม่พร้อมปฏิบัติงาน';
}

function renderShellCounts() {
  const c = counts();
  document.querySelectorAll('.nav-badge[data-badge]').forEach((el) => {
    const value = c[el.dataset.badge] ?? 0;
    el.textContent = value;
    el.hidden = value === 0;
  });
}

function closeUserMenu() {
  const menu = $('userMenu');
  if (!menu) return;
  menu.hidden = true;
  $('userMenuBtn')?.setAttribute('aria-expanded', 'false');
}

function openNav() {
  document.body.classList.add('nav-open');
  $('scrim').hidden = false;
  $('menuBtn').setAttribute('aria-expanded', 'true');
}

function closeNav() {
  document.body.classList.remove('nav-open');
  const scrim = $('scrim');
  if (scrim) scrim.hidden = true;
  $('menuBtn')?.setAttribute('aria-expanded', 'false');
}

/* ---------- Toast ---------- */

function toast(message, tone = 'info') {
  const el = document.createElement('div');
  el.className = `toast toast--${tone}`;
  el.innerHTML = icon(tone === 'success' ? 'check' : 'info');
  const text = document.createElement('span');
  text.textContent = message;
  el.append(text);
  $('toasts').append(el);
  setTimeout(() => el.classList.add('is-leaving'), 3200);
  setTimeout(() => el.remove(), 3600);
}

/* ---------- Live timers ---------- */

function updateTimers() {
  const now = Date.now();
  document.querySelectorAll('[data-tick]').forEach((el) => {
    const ts = Number(el.dataset.ts);
    switch (el.dataset.tick) {
      case 'elapsed':
        el.textContent = fmtClock((now - ts) / 1000);
        break;
      case 'ago':
        el.textContent = fmtAgo((now - ts) / 1000);
        break;
      case 'over':
        el.textContent = `เกินมา ${fmtHuman((now - ts) / 1000)}`;
        break;
      case 'remain': {
        const left = (ts - now) / 1000;
        el.textContent = left >= 0 ? `เหลือ ${fmtCountdown(left)}` : `เกินกำหนด ${fmtCountdown(-left)}`;
        el.classList.toggle('is-late', left < 0);
        break;
      }
    }
  });
}

let lastSignature = '';
function signature() {
  const now = Date.now();
  return state.jobs.filter((j) => isActive(j) && (isOverdue(j) || (j.status === 'pending_ack' && now > assignDeadline(j)))).map((j) => j.id).join(',');
}

// ดึงงานล่าสุดจากเซิร์ฟเวอร์แล้ววาดหน้าใหม่ (เรียกหลังบันทึกข้อมูล)
async function refresh() {
  await loadJobs();
  render();
  lastSignature = signature();
  updateTimers();
}

// วาดหน้าใหม่จากข้อมูลที่มีอยู่แล้ว โดยไม่เรียกเซิร์ฟเวอร์ (ใช้กับตัวนับเวลา)
function rerender() {
  render();
  lastSignature = signature();
  updateTimers();
}

/* ---------- เริ่มทำงาน ----------
   โหลดค่าอ้างอิง + ผู้ใช้ + งาน ให้ครบก่อนวาดหน้าครั้งแรก
   สคริปต์ของแต่ละหน้าเรียก boot() แทน refresh() ตอนเปิดหน้า */
async function boot() {
  try {
    await Promise.all([loadReference(), loadUser()]);
    renderShellUser(); // ชื่อในเมนูซ้ายถูกวาดตั้งแต่ยังไม่มีข้อมูล จึงต้องเติมอีกครั้งตรงนี้
    renderDutyToggle();
    await loadJobs();
    state.ready = true;
    if (typeof onReady === 'function') await onReady();
    rerender();
  } catch (error) {
    if (error.message !== 'unauthenticated') {
      toast(`โหลดข้อมูลไม่สำเร็จ: ${error.message}`, 'error');
    }
  }
}

function startTicker() {
  setInterval(() => {
    updateTimers();
    // วาดใหม่จากข้อมูลเดิมเมื่อมีงานเพิ่งเกิน SLA — ไม่ยิง API ทุกวินาที
    if (signature() !== lastSignature) rerender();
  }, 1000);

  // ดึงงานใหม่เป็นระยะ เพื่อให้เห็นงานที่ผู้ประสานงานเพิ่งมอบหมายมา
  setInterval(() => {
    if (state.ready && !document.hidden) refresh().catch(() => {});
  }, 20000);
}

/* ---------- รายละเอียด/อัปเดตงาน (ใช้ร่วมกันทุกหน้า) ---------- */

const dialogs = { detail: $('detailDialog'), update: $('updateDialog') };
const closeButton = `<button type="button" class="icon-btn" data-action="close" aria-label="ปิด">${icon('x')}</button>`;

let pendingPhotos = [];
const MAX_PHOTO_MB = 10;
const PHOTO_TYPES = ['image/png', 'image/jpeg'];

function timelineEvents(j) {
  const events = [
    { at: j.reportedAt, title: 'ได้รับมอบหมายงาน', desc: `จากผู้ประสานงาน · ${esc(CATEGORIES[j.cat].label)}` },
    j.ackAt && { at: j.ackAt, title: 'รับทราบงานแล้ว' },
    ...j.updates.map((u) => ({ at: u.at, title: 'บันทึกความคืบหน้า', desc: u.note + (u.photos?.length ? ` · แนบรูป ${u.photos.length} รูป` : '') })),
    j.submittedAt && { at: j.submittedAt, title: 'ส่งผลเพื่อตรวจสอบแล้ว' },
    j.closedAt && { at: j.closedAt, title: 'ผู้ประสานงานตรวจสอบและปิดงานแล้ว' },
  ].filter(Boolean).sort((a, b) => a.at - b.at);

  const current = {
    pending_ack: { title: 'รอการรับทราบจากคุณ' },
    progress: { title: 'กำลังดำเนินการอยู่' },
    review: { title: 'รอผู้ประสานงานตรวจสอบผล' },
  }[j.status];
  if (current) events.push({ ...current, now: true });
  return events;
}

// ตารางรูปย่อ กดแล้วเปิดรูปเต็มในแท็บใหม่
function photoGridHtml(urls, jobId, label) {
  return `<div class="evidence-grid">${urls.map((url, n) => `
    <a class="evidence-thumb" href="${esc(url)}" target="_blank" rel="noopener" title="เปิดรูปเต็ม">
      <img src="${esc(url)}" alt="${esc(label)}ที่ ${n + 1} ของ ${esc(jobId)}" loading="lazy">
    </a>`).join('')}</div>`;
}

// รูปสองชุดในหน้าต่างรายละเอียด — รูปตอนแจ้งเหตุใช้ดูหน้างานก่อนออกไป
// ส่วนรูปหลังดำเนินการคือสิ่งที่ตัวเองส่งไปแล้ว ย้อนดูได้ว่าส่งอะไรไป
function detailPhotoSections(j) {
  const before = j.photoUrls ?? [];
  const after = j.afterPhotoUrls ?? [];
  if (!before.length && !after.length) return '';

  return `
    ${before.length ? `
      <section class="sheet-section">
        <h4>รูปตอนแจ้งเหตุ (${before.length})</h4>
        ${photoGridHtml(before, j.id, 'รูปตอนแจ้งเหตุ')}
      </section>` : ''}
    ${after.length ? `
      <section class="sheet-section">
        <h4>รูปที่คุณแนบไว้ (${after.length})</h4>
        ${photoGridHtml(after, j.id, 'รูปหลังดำเนินการ')}
      </section>` : ''}`;
}

function detailFooter(j) {
  const id = `data-id="${j.id}"`;
  if (j.status === 'pending_ack') return `<button type="button" class="btn btn-primary" data-action="acknowledge" ${id}>รับทราบงาน</button>`;
  if (j.status === 'progress' || j.status === 'review') return `<button type="button" class="btn btn-primary" data-action="update" ${id}>อัปเดตผล</button>`;
  return `<button type="button" class="btn btn-ghost" data-action="close">ปิดหน้าต่าง</button>`;
}

function openDetail(job) {
  const j = job;
  const overdue = isOverdue(j);
  const events = timelineEvents(j);

  dialogs.detail.innerHTML = `
    <div class="dlg">
      <header class="sheet-head">
        <div>
          <p class="sheet-eyebrow">รายละเอียดงาน</p>
          <h2 id="detailTitle">${j.id}</h2>
        </div>
        ${closeButton}
      </header>
      <div class="dlg-body">
        <div class="sheet-title">
          <div>
            <h3>${esc(j.title)}</h3>
            <p class="muted">${icon('map-pin', 'icon--xs')} ${esc(j.place)}</p>
          </div>
          ${priorityBadge(j.pri)}
        </div>

        <div class="info-grid">
          <div class="info-card"><span class="info-label">สถานะปัจจุบัน</span><strong class="info-value">${STATUSES[j.status]}</strong></div>
          <div class="info-card"><span class="info-label">ได้รับมอบหมายเมื่อ</span><strong class="info-value">${fmtFullDateTime(j.reportedAt)}</strong></div>
          <div class="info-card"><span class="info-label">ผู้แจ้งเหตุ</span><strong class="info-value">${j.reporter ? esc(j.reporter) : '<span class="muted">ไม่ระบุ</span>'}</strong></div>
          ${isActive(j) ? `<div class="info-card"><span class="info-label">กำหนดแก้ไข (SLA)</span><strong class="info-value${overdue ? ' is-late' : ''}">${fmtDateTime(resolveDeadline(j))} น.${overdue ? ` · <span data-tick="over" data-ts="${resolveDeadline(j)}"></span>` : ''}</strong></div>` : `<div class="info-card"><span class="info-label">ปิดงานเมื่อ</span><strong class="info-value">${fmtFullDateTime(j.closedAt)}</strong></div>`}
        </div>

        ${j.note ? `<section class="sheet-section"><h4>รายละเอียดที่แจ้ง</h4><p class="detail-box">${esc(j.note)}</p></section>` : ''}

        ${detailPhotoSections(j)}

        <section class="sheet-section">
          <h4>ความคืบหน้า</h4>
          <ol class="timeline">
            ${events.map((e) => `<li>${esc(e.title)}${e.desc ? `<br><span class="muted small">${esc(e.desc)}</span>` : ''}${e.now ? '' : `<time>${fmtDateTime(e.at)} น.</time>`}</li>`).join('')}
          </ol>
        </section>
      </div>
      <footer class="dlg-foot">${detailFooter(j)}</footer>
    </div>`;
  updateTimers();
  dialogs.detail.showModal();
}

function openUpdate(job) {
  pendingPhotos = [];
  const forReview = job.status === 'review';

  dialogs.update.innerHTML = `
    <form class="dlg" id="updateForm" data-id="${job.id}" novalidate>
      <header class="dlg-head">
        <div>
          <h2 id="updateTitle">อัปเดตผล ${job.id}</h2>
          <p class="muted">${esc(job.title)} · ${esc(job.place)}</p>
        </div>
        ${closeButton}
      </header>
      <div class="dlg-body">
        <div class="field" id="ufNoteField">
          <label for="ufNote">บันทึกความคืบหน้า <span class="req" aria-hidden="true">*</span></label>
          <textarea class="textarea" id="ufNote" name="note" rows="4" maxlength="400" placeholder="สิ่งที่ดำเนินการไปแล้ว หรือผลการซ่อม"></textarea>
          <p class="field-error" id="ufNoteError" hidden>กรุณาบันทึกความคืบหน้าก่อนส่ง</p>
        </div>
        <div class="field">
          <label for="ufPhotos">แนบรูปภาพประกอบ</label>
          <label class="photo-drop" for="ufPhotos">
            <span class="photo-drop-icon">${icon('upload')}</span>
            <strong>แนบรูปภาพประกอบ</strong>
            <span>PNG หรือ JPG ขนาดไม่เกิน ${MAX_PHOTO_MB}MB</span>
          </label>
          <input class="visually-hidden" id="ufPhotos" name="photos" type="file" accept="image/png,image/jpeg" multiple>
          <div class="photo-preview" id="photoPreview"></div>
        </div>
      </div>
      <footer class="dlg-foot">
        <button type="button" class="btn btn-ghost" data-action="close">ยกเลิก</button>
        <button type="submit" class="btn btn-primary">${forReview ? 'บันทึกข้อมูลเพิ่มเติม' : 'ส่งผลเพื่อตรวจสอบ'}</button>
      </footer>
    </form>`;
  dialogs.update.showModal();
  $('ufNote').focus();

  $('ufPhotos').addEventListener('change', (event) => {
    const accepted = [];
    const rejected = [];
    [...event.target.files].forEach((file) => {
      const bad = file.size > MAX_PHOTO_MB * 1024 * 1024 || !PHOTO_TYPES.includes(file.type);
      if (bad) rejected.push(file.name);
      else accepted.push({ name: file.name, url: URL.createObjectURL(file), file });
    });
    pendingPhotos.push(...accepted);
    event.target.value = '';
    renderPhotoPreview();
    if (rejected.length) toast(`ไม่รองรับไฟล์ ${rejected.join(', ')} — ต้องเป็น PNG หรือ JPG ขนาดไม่เกิน ${MAX_PHOTO_MB}MB`);
  });
}

function renderPhotoPreview() {
  $('photoPreview').innerHTML = pendingPhotos.map((p, idx) => `
    <span class="photo-chip">
      <img src="${p.url}" alt="${esc(p.name)}">
      <button type="button" class="photo-remove" data-action="remove-photo" data-idx="${idx}" aria-label="เอารูป ${esc(p.name)} ออก">${icon('x', 'icon--xs')}</button>
    </span>`).join('');
}

/* ---------- Actions ---------- */

async function acknowledge(job) {
  try {
    await api(`/api/incidents/${numOf(job)}/acknowledge/`, { method: 'POST' });
    await refresh();
    toast(`รับทราบงาน ${job.id} แล้ว เริ่มดำเนินการได้เลย`, 'success');
  } catch (error) {
    toast(`รับทราบงานไม่สำเร็จ: ${error.message}`, 'error');
  }
}

async function submitUpdate(job, note, files = []) {
  const wasReview = job.status === 'review';
  try {
    // ใช้ FormData เพราะต้องแนบรูปหลังดำเนินการไปพร้อมกัน
    const form = new FormData();
    form.append('note', note);
    files.filter(Boolean).forEach((file) => form.append('photos', file));

    await api(`/api/incidents/${numOf(job)}/update-result/`, { method: 'POST', body: form });
    await refresh();
    toast(wasReview ? `บันทึกข้อมูลเพิ่มเติมของ ${job.id} แล้ว` : `ส่งผล ${job.id} ให้ผู้ประสานงานตรวจสอบแล้ว`, 'success');
  } catch (error) {
    toast(`บันทึกผลไม่สำเร็จ: ${error.message}`, 'error');
  }
}

/* ---------- Events ---------- */

document.addEventListener('click', (event) => {
  const el = event.target.closest('[data-action]');
  if (!el) return;

  const { action } = el.dataset;
  const job = el.dataset.id ? findJob(el.dataset.id) : null;

  const dialog = el.closest('dialog');
  if (dialog && action !== 'close') dialog.close();

  switch (action) {
    case 'close':
      dialog.close();
      break;
    case 'detail':
      openDetail(job);
      break;
    case 'acknowledge':
      acknowledge(job);
      break;
    case 'update':
      openUpdate(job);
      break;
    case 'reload':
      closeUserMenu();
      refresh().then(() => toast('โหลดข้อมูลล่าสุดแล้ว', 'success')).catch(() => {});
      break;
    case 'logout':
      logout();
      break;
    case 'remove-photo': {
      const [removed] = pendingPhotos.splice(Number(el.dataset.idx), 1);
      if (removed) URL.revokeObjectURL(removed.url);
      renderPhotoPreview();
      break;
    }
    default:
      if (typeof handlePageAction === 'function') handlePageAction(action, el);
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeUserMenu();
    closeNav();
  }
});

document.addEventListener('submit', (event) => {
  const form = event.target;
  if (form.id !== 'updateForm') return;
  event.preventDefault();

  const note = String(new FormData(form).get('note')).trim();
  $('ufNoteField').classList.toggle('has-error', !note);
  $('ufNoteError').hidden = Boolean(note);
  if (!note) {
    $('ufNote').focus();
    return;
  }

  const files = pendingPhotos.map((p) => p.file);
  pendingPhotos.forEach((p) => URL.revokeObjectURL(p.url));
  dialogs.update.close();
  submitUpdate(findJob(form.dataset.id), note, files);
});

Object.values(dialogs).forEach((dlg) => {
  dlg.addEventListener('click', (event) => {
    if (event.target === dlg) dlg.close();
  });
});

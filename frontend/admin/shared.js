'use strict';

/* CampusCare Incident Center — โค้ดที่ใช้ร่วมกันทุกหน้าของผู้ดูแล (หน้าหลัก / รายการแจ้งเหตุ / ...)

   วิธีใช้: โหลดไฟล์นี้ก่อนสคริปต์ของแต่ละหน้า แล้วในสคริปต์ของหน้านั้น
     1) เรียก mountShell('<คีย์เมนู>') เพื่อสร้างเมนูซ้ายและแถบบน
     2) ประกาศฟังก์ชัน render() ของหน้านั้นเอง — shared.js จะเรียก refresh() → render() ทุกครั้งที่ข้อมูลเปลี่ยน
     3) (ไม่บังคับ) ประกาศ handlePageAction(action, el) / resetView() / handleBell() เพื่อรับคำสั่งเฉพาะหน้า
   จากนั้นเรียก refresh() หนึ่งครั้งเพื่อวาดหน้า และ startTicker() เพื่อให้ตัวนับเวลาเดินสด

   ข้อมูลทั้งหมดมาจาก backend จริงผ่าน REST API (ดู api() ด้านล่าง)
   ค่าอ้างอิง (CATEGORIES / PRIORITIES / ZONES / OFFICERS) โหลดจากเซิร์ฟเวอร์ตอนเปิดหน้า
   แล้วเติมลงตัวแปรเดิม จึงไม่ต้องแก้สคริปต์ของแต่ละหน้า

   ต้องเปิดหน้าเว็บผ่าน http://127.0.0.1:8000/admin/... (ที่ Django เสิร์ฟ)
   ไม่ใช่ file:// มิฉะนั้น session cookie จะใช้ไม่ได้ */

/* ---------- Config & reference data ---------- */

const CONFIG = {
  // ผู้ใช้ที่ล็อกอินอยู่ — เติมจาก /api/auth/me ตอนเปิดหน้า
  user: { title: '', firstName: '', lastName: '', role: '' },
  loginUrl: '../login/login.html',
};

/* ---------- การเรียก API ----------
   Django ใช้ session cookie + CSRF token
   - cookie ติดไปเองทุกคำขอ (credentials: 'same-origin')
   - POST ต้องแนบ header X-CSRFToken มิฉะนั้นจะได้ 403
   ถ้าเซสชันหมดอายุ (401/403) จะพากลับไปหน้าล็อกอินอัตโนมัติ */

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

  // เซสชันหมดอายุหรือยังไม่ได้ล็อกอิน
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
    const message = data?.detail || 'ระบบขัดข้อง กรุณาลองใหม่อีกครั้ง';
    throw new Error(message);
  }
  return data;
}

const MIN = 60;
const HOUR = 3600;
const DAY = 86400;

// ค่าอ้างอิงทั้งหมดโหลดจาก /api/reference ตอนเปิดหน้า (ดู loadReference)
// ประกาศเป็นอ็อบเจกต์ว่างไว้ก่อนแล้วเติมทีหลัง เพื่อให้สคริปต์ของแต่ละหน้าอ้างชื่อเดิมได้
// assignSec = เวลาสูงสุดที่ควรมอบหมายงาน / resolveSec = เวลาสูงสุดที่ควรแก้ไขเสร็จ (SLA)
const PRIORITIES = {};

const STATUSES = {
  pending: 'รอมอบหมาย',
  progress: 'กำลังดำเนินการ',
  review: 'รอตรวจผล',
  done: 'ดำเนินการเสร็จสิ้น',
};

const CATEGORIES = {};

const ZONES = [];

// รายชื่อเจ้าหน้าที่โหลดจาก /api/officers/ ตอนเปิดหน้า (ดู loadOfficers)
const OFFICERS = [];

// ผู้แจ้งเหตุตัวอย่าง [ชื่อ, เบอร์โทร] (ข้อมูลสมมติทั้งหมด)
/* ---------- ชั้นข้อมูล (เชื่อมกับ backend) ---------- */

const state = { incidents: [], ready: false };

// แปลง JSON จาก API ให้เป็นรูปแบบเดียวกับที่สคริปต์ของแต่ละหน้าใช้อยู่
// (API ส่งเวลาเป็น epoch ms อยู่แล้ว จึงนำไปคำนวณกับ Date.now() ได้ตรงๆ)
function mapIncident(raw) {
  const lastUpdate = raw.updates?.length ? raw.updates[raw.updates.length - 1] : null;
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
    phone: raw.phone ?? '',
    assignee: raw.assignee ?? null,
    officerName: raw.officer ?? null,
    reportedAt: raw.reportedAt,
    assignedAt: raw.assignedAt,
    ackAt: raw.ackAt,
    updatedAt: lastUpdate?.at ?? raw.submittedAt ?? null,
    closedAt: raw.closedAt,
    // photos = รูปตอนแจ้งเหตุ / afterPhotos = รูปที่เจ้าหน้าที่แนบตอนบันทึกผล (คนละชุดกัน)
    photos: raw.photos?.length ?? 0,
    photoUrls: (raw.photos ?? []).map((p) => p.url),
    afterPhotos: (raw.updates ?? []).reduce((sum, u) => sum + (u.photos ?? 0), 0),
    updates: raw.updates ?? [],
    reminders: raw.reminders ?? 0,
    lastReminderAt: raw.lastReminderAt ?? null,
  };
}

async function loadReference() {
  const ref = await api('/api/reference');
  // เติมลงตัวแปรเดิมแทนการประกาศใหม่ เพราะสคริปต์หน้าอื่นอ้างถึงตัวเดียวกันนี้
  Object.assign(CATEGORIES, ref.categories);
  Object.assign(PRIORITIES, ref.priorities);
  ZONES.length = 0;
  ZONES.push(...ref.zones);
}

async function loadOfficers() {
  const data = await api('/api/officers/');
  const list = data.results ?? data;
  OFFICERS.length = 0;
  OFFICERS.push(...list.map((o) => ({
    id: o.id,
    name: o.name,
    phone: o.phone ?? '',
    cat: o.cat,
    zone: o.zone,
    capacity: o.capacity,
    onDuty: o.onDuty,
    shiftStart: o.shiftStart,
    shiftEnd: o.shiftEnd,
  })));
}

async function loadIncidents() {
  const data = await api('/api/incidents/?page_size=500');
  const list = data.results ?? data;
  state.incidents = list.map(mapIncident);
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
}

async function logout() {
  try {
    await api('/api/auth/logout', { method: 'POST' });
  } catch {
    // ออกจากระบบไม่สำเร็จก็ยังพากลับหน้าล็อกอินอยู่ดี
  }
  location.href = CONFIG.loginUrl;
}

const $ = (id) => document.getElementById(id);
const esc = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const numOf = (incident) => incident.id.slice(4);
const findIncident = (id) => state.incidents.find((i) => i.id === id);
const findOfficer = (id) => OFFICERS.find((o) => o.id === id) || null;

const isActive = (i) => i.status !== 'done';
const assignDeadline = (i) => i.reportedAt + PRIORITIES[i.pri].assignSec * 1000;
const resolveDeadline = (i) => i.reportedAt + PRIORITIES[i.pri].resolveSec * 1000;
const isOverdue = (i) => isActive(i) && Date.now() > resolveDeadline(i);

const FILTERS = {
  all: () => true,
  pending: (i) => i.status === 'pending',
  progress: (i) => i.status === 'progress' || i.status === 'review',
  review: (i) => i.status === 'review',
  done: (i) => i.status === 'done',
  overdue: isOverdue,
};

const TABS = [
  { key: 'all', label: 'ทั้งหมด' },
  { key: 'pending', label: 'รอมอบหมาย' },
  { key: 'progress', label: 'กำลังดำเนินการ' },
  { key: 'done', label: 'ดำเนินการเสร็จสิ้น' },
  { key: 'overdue', label: 'เกิน SLA' },
];

function counts() {
  return Object.fromEntries(Object.entries(FILTERS).map(([key, fn]) => [key, state.incidents.filter(fn).length]));
}

// ค้นหาจากเลขเหตุ / หัวข้อ / สถานที่ / ชื่อผู้รับผิดชอบ / ชื่อผู้แจ้ง (ไม่สนตัวพิมพ์เล็กใหญ่ และพิมพ์ # นำหน้าเลขได้)
function matchesQuery(incident, query) {
  const q = query.trim().toLowerCase().replace(/^#/, '');
  if (!q) return true;
  const fields = [incident.id, numOf(incident), incident.title, incident.place, findOfficer(incident.assignee)?.name ?? '', incident.reporter ?? ''];
  return fields.some((text) => text.toLowerCase().includes(q));
}

function officerStats() {
  return OFFICERS.map((officer) => {
    const mine = state.incidents.filter((i) => i.assignee === officer.id && isActive(i));
    return {
      officer,
      active: mine.length,
      overdue: mine.filter(isOverdue).length,
      free: officer.capacity - mine.length,
      pct: mine.length / officer.capacity,
    };
  });
}

// จัดอันดับเจ้าหน้าที่ที่เหมาะกับเหตุนี้: ตรงประเภทงาน > ยังมีคิวว่าง > อยู่ในเวร > อยู่ในพื้นที่
function rankOfficers(incident) {
  return officerStats()
    .map((s) => ({
      ...s,
      sameDept: s.officer.cat === incident.cat,
      sameZone: s.officer.zone === incident.zone,
      score: (s.officer.cat === incident.cat ? 6 : 0) + (s.free > 0 ? 3 : 0) + (s.officer.onDuty ? 2 : 0) + (s.officer.zone === incident.zone ? 2 : 0) + Math.min(s.free, 5) * 0.1,
    }))
    .sort((a, b) => b.score - a.score);
}

// เจ้าหน้าที่ที่ระบบแนะนำ: ต้องตรงประเภทงาน อยู่ในเวร และยังรับงานเพิ่มได้ (ถ้าไม่มี ให้ผู้ดูแลเลือกเอง)
const bestOfficer = (ranking) => ranking.find((r) => r.sameDept && r.officer.onDuty && r.free > 0) || null;

function officerStatus(s) {
  if (s.overdue > 0) return { text: 'มีงานเกิน SLA', tone: 'late' };
  if (!s.officer.onDuty) return { text: 'ไม่อยู่ในเวร', tone: 'off' };
  if (s.pct >= 1) return { text: 'งานเต็ม', tone: 'full' };
  if (s.active > 0) return { text: 'กำลังปฏิบัติงาน', tone: 'busy' };
  return { text: 'พร้อมปฏิบัติงาน', tone: 'free' };
}

const loadTone = (pct) => (pct >= 1 ? 'full' : pct >= 0.6 ? 'warn' : 'ok');

// รายการที่ผู้ดูแลต้องลงมือ เรียงตามความเร่งด่วน
function buildActions() {
  const now = Date.now();
  const items = [];
  for (const i of state.incidents) {
    if (i.status === 'pending') {
      if (i.pri === 'normal' && now <= assignDeadline(i)) continue;
      items.push({ kind: 'assign', i, rec: bestOfficer(rankOfficers(i)), weight: i.pri === 'emergency' ? 0 : 2 });
    } else if (i.status === 'progress' && isOverdue(i)) {
      items.push({ kind: 'overdue', i, weight: 1 });
    } else if (i.status === 'review') {
      items.push({ kind: 'review', i, weight: 3 });
    }
  }
  return items.sort((a, b) => a.weight - b.weight || a.i.reportedAt - b.i.reportedAt);
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

// "22 ก.ย. 2569 · 02:40 น."
function fmtFullDateTime(ts) {
  const d = new Date(ts);
  const date = d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${date} · ${time} น.`;
}

// แสดงเบอร์แบบปิดบังบางส่วนเพื่อความเป็นส่วนตัว: 0891231240 → 08x-xxx-1240
function maskPhone(phone) {
  const digits = String(phone ?? '').replace(/\D/g, '');
  return digits.length >= 8 ? `${digits.slice(0, 2)}x-xxx-${digits.slice(-4)}` : '—';
}

// "อาคารเรียนรวม 2 ห้อง 304" → "อาคารเรียนรวม 2 · ห้อง 304"
function formatPlace(incident) {
  const { place, zone } = incident;
  return zone && place.startsWith(zone) && place.length > zone.length ? `${zone} · ${place.slice(zone.length).trim()}` : place;
}

/* ---------- Small HTML builders ---------- */

const icon = (name, cls = '') => `<svg class="icon ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const priorityBadge = (pri) => `<span class="badge badge--${pri}">${PRIORITIES[pri].label}</span>`;
const statusBadge = (i) => `<span class="badge badge--${i.status}">${STATUSES[i.status]}</span>`;

function avatar(name, size = 'sm', color = '') {
  const style = color ? ` style="--tone:${color}"` : '';
  return `<span class="avatar avatar--${size}${color ? ' avatar--tone' : ''}"${style} aria-hidden="true">${esc(name.trim()[0])}</span>`;
}

const officerAvatar = (officer, size) => avatar(officer.name, size, CATEGORIES[officer.cat].color);

/* กราฟแท่ง SVG แบบง่าย ใช้ร่วมกันทุกหน้า (แนวโน้ม 7 วันบนหน้าหลัก, รายเดือนบนหน้ารายงาน)
   values/labels ต้องยาวเท่ากัน — highlightLast = true จะเน้นแท่งสุดท้ายเป็นสีส้ม (ค่าของ "วันนี้"/"เดือนนี้") */
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

// โดนัทสัดส่วน SVG ใช้ร่วมกันทุกหน้า (สัดส่วนตามประเภทบนหน้าหลักและหน้ารายงาน)
// rows: [{ label, color, n }, ...] เรียงจากมากไปน้อยมาก่อนเรียกใช้แล้ว
function donutHtml(rows, { size = 120, radius = 46, cap = 'รายการ', ariaPrefix = 'สัดส่วน' } = {}) {
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

function ownerCell(i) {
  const officer = findOfficer(i.assignee);
  if (officer) return `<div class="cell-owner">${officerAvatar(officer, 'sm')}<span>${esc(officer.name)}</span></div>`;
  return `<div class="cell-owner cell-owner--stack"><span class="muted">— ยังไม่มอบหมาย</span><button type="button" class="link-btn" data-action="assign" data-id="${i.id}">มอบหมาย</button></div>`;
}

/* ---------- Shell: ไอคอน เมนูซ้าย แถบบน (ใช้ร่วมกันทุกหน้า) ---------- */

// ชุดไอคอน SVG — ใช้ผ่าน <use href="#i-ชื่อ">
const ICON_SPRITE = `
<svg class="sprite" aria-hidden="true" focusable="false">
  <symbol id="i-grid" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></symbol>
  <symbol id="i-alert" viewBox="0 0 24 24"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></symbol>
  <symbol id="i-user-check" viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><polyline points="17 11 19 13 23 9"/></symbol>
  <symbol id="i-users" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></symbol>
  <symbol id="i-bar-chart" viewBox="0 0 24 24"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></symbol>
  <symbol id="i-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></symbol>
  <symbol id="i-bell" viewBox="0 0 24 24"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></symbol>
  <symbol id="i-plus" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></symbol>
  <symbol id="i-menu" viewBox="0 0 24 24"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></symbol>
  <symbol id="i-more" viewBox="0 0 24 24"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></symbol>
  <symbol id="i-x" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></symbol>
  <symbol id="i-clipboard" viewBox="0 0 24 24"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></symbol>
  <symbol id="i-hourglass" viewBox="0 0 24 24"><path d="M5 22h14"/><path d="M5 2h14"/><path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"/><path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"/></symbol>
  <symbol id="i-flame" viewBox="0 0 24 24"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></symbol>
  <symbol id="i-check" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></symbol>
  <symbol id="i-info" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></symbol>
  <symbol id="i-map-pin" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></symbol>
  <symbol id="i-user" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></symbol>
  <symbol id="i-log-out" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></symbol>
  <symbol id="i-chevron-left" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></symbol>
  <symbol id="i-chevron-right" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></symbol>
  <symbol id="i-inbox" viewBox="0 0 24 24"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></symbol>
  <symbol id="i-image" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></symbol>
  <symbol id="i-user-x" viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="17" y1="8" x2="22" y2="13"/><line x1="22" y1="8" x2="17" y2="13"/></symbol>
  <symbol id="i-phone" viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></symbol>
  <symbol id="i-download" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></symbol>
  <symbol id="i-arrow-right" viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></symbol>
  <symbol id="i-tag" viewBox="0 0 24 24"><path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></symbol>
  <symbol id="i-edit" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/></symbol>
  <symbol id="i-trash" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></symbol>
  <symbol id="i-key" viewBox="0 0 24 24"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3"/></symbol>
  <symbol id="i-user-plus" viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></symbol>
  <symbol id="i-refresh" viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></symbol>
</svg>`;

// href ว่าง = ยังไม่มีหน้า (กดแล้วแสดงข้อความ "ยังไม่เปิดให้ใช้งาน") — ใส่ href เมื่อทำหน้าเสร็จ
// badge: คีย์ผลลัพธ์จาก counts() ที่จะขึ้นเป็นตัวเลขบนเมนู (ไม่ใส่ = ไม่มีตัวเลข)
const NAV = [
  { key: 'home', label: 'หน้าหลัก', icon: 'grid', href: 'admin.html' },
  { key: 'incidents', label: 'รายการแจ้งเหตุ', icon: 'alert', href: 'incidents.html', badge: 'pending' },
  { key: 'assign', label: 'มอบหมายงาน', icon: 'user-check', href: 'assign.html', badge: 'pending' },
  { key: 'officers', label: 'เจ้าหน้าที่', icon: 'users', href: 'officers.html' },
  { key: 'users', label: 'ผู้ใช้งาน', icon: 'user-check', href: 'users.html' },
  { key: 'types', label: 'ประเภทเหตุ', icon: 'tag', href: 'types.html' },
  { key: 'places', label: 'สถานที่', icon: 'map-pin', href: 'places.html' },
  { key: 'reports', label: 'รายงานและสถิติ', icon: 'bar-chart', href: 'reports.html' },
];

// สร้างเมนูซ้ายและแถบบนลงใน <aside id="sidebar"> และ <header id="topbar"> ของหน้านั้น
function mountShell(active) {
  document.body.insertAdjacentHTML('afterbegin', ICON_SPRITE);

  $('sidebar').innerHTML = `
    <div class="sidebar-brand">
      <img class="sidebar-logo" src="logo.png" width="1000" height="252" alt="CampusCare Incident Center">
    </div>

    <nav class="nav">
      ${NAV.map((n) => `
        <a class="nav-item${n.key === active ? ' is-active' : ''}" href="${n.href || '#'}"${n.key === active ? ' aria-current="page"' : ''}${n.href ? '' : ` data-soon="${n.label}"`}>
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
      <input id="searchInput" type="search" placeholder="ค้นหาเลขที่เหตุ รายการ หรือสถานที่" autocomplete="off" aria-label="ค้นหาเหตุ">
    </label>

    <div class="topbar-actions">
      <button type="button" class="icon-btn" id="bellBtn" aria-label="งานที่ต้องดำเนินการ">${icon('bell')}<span class="bell-badge" id="bellBadge" hidden></span></button>
      <span class="avatar avatar--ring" aria-hidden="true">${icon('user')}</span>
    </div>`;

  renderShellUser();

  $('menuBtn').addEventListener('click', openNav);
  $('scrim').addEventListener('click', closeNav);

  $('userMenuBtn').addEventListener('click', () => {
    const open = $('userMenu').hidden;
    $('userMenu').hidden = !open;
    $('userMenuBtn').setAttribute('aria-expanded', String(open));
  });

  // กระดิ่ง: หน้าที่ประกาศ handleBell() จัดการเอง (เช่น หน้าหลักเลื่อนไปกล่อง "ต้องดำเนินการ") นอกนั้นไปหน้าหลัก
  $('bellBtn').addEventListener('click', () => {
    if (typeof handleBell === 'function') handleBell();
    else location.href = 'admin.html#actionsCard';
  });

  document.querySelectorAll('[data-soon]').forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      closeNav();
      toast(`หน้า “${link.dataset.soon}” ยังไม่เปิดให้ใช้งาน`);
    });
  });
}

// ตัวเลขบนเมนูซ้าย (ตาม n.badge ของแต่ละเมนูใน NAV) และบนกระดิ่ง (งานที่ต้องดำเนินการ)
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

function renderShellCounts() {
  const c = counts();
  document.querySelectorAll('.nav-badge[data-badge]').forEach((el) => {
    const value = c[el.dataset.badge] ?? 0;
    el.textContent = value;
    el.hidden = value === 0;
  });

  const total = buildActions().length;
  const bell = $('bellBadge');
  bell.textContent = total;
  bell.hidden = total === 0;
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

// ถ้ามีเหตุที่เพิ่งเกินกำหนดเวลา ให้วาดหน้าใหม่ (ตรวจทุกวินาที แต่วาดใหม่เฉพาะตอนที่ชุดข้อมูลเปลี่ยน)
let lastSignature = '';
function signature() {
  const now = Date.now();
  return state.incidents
    .filter((i) => isActive(i) && (isOverdue(i) || (i.status === 'pending' && now > assignDeadline(i))))
    .map((i) => i.id)
    .join(',');
}

/* ---------- Toasts & dialogs ---------- */

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

const dialogs = {
  assign: $('assignDialog'),
  detail: $('detailDialog'),
  create: $('newDialog'),
  confirm: $('confirmDialog'),
};

const closeButton = `<button type="button" class="icon-btn" data-action="close" aria-label="ปิด">${icon('x')}</button>`;

// forward = true: ผู้ประสานงานกด "ส่งต่อเหตุ" เพื่อเลือกเจ้าหน้าที่เอง (ไม่เลือกคนที่ระบบแนะนำไว้ล่วงหน้า)
function openAssign(incident, { forward = false } = {}) {
  const ranking = rankOfficers(incident);
  const best = bestOfficer(ranking);
  const bestId = best ? best.officer.id : null;
  const reassign = incident.status !== 'pending';

  dialogs.assign.innerHTML = `
    <form class="dlg" id="assignForm" data-id="${incident.id}" data-forward="${forward}" novalidate>
      <header class="dlg-head">
        <div>
          <h2 id="assignTitle">${forward ? 'ส่งต่อเหตุ' : reassign ? 'เปลี่ยนผู้รับผิดชอบ' : 'มอบหมายงาน'} ${incident.id}</h2>
          <p class="muted">${esc(incident.title)} · ${esc(incident.place)}</p>
        </div>
        ${closeButton}
      </header>
      <div class="dlg-body">
        <p class="muted small">${best
          ? 'เรียงตามความเหมาะสม: ตรงประเภทงาน · มีคิวว่าง · อยู่ในพื้นที่'
          : `${esc(CATEGORIES[incident.cat].dept)}ไม่มีผู้ว่างในขณะนี้ — โปรดเลือกเจ้าหน้าที่ด้วยตนเอง`}</p>
        <div class="picks" role="radiogroup" aria-label="เลือกเจ้าหน้าที่">
          ${ranking.map((r) => {
            const o = r.officer;
            const current = o.id === incident.assignee;
            const st = officerStatus(r);
            return `
              <label class="pick${current ? ' is-disabled' : ''}">
                <input type="radio" name="officer" value="${o.id}"${!incident.assignee && !forward && o.id === bestId ? ' checked' : ''}${current ? ' disabled' : ''}>
                ${officerAvatar(o, 'md')}
                <span class="pick-body">
                  <span class="pick-name">${esc(o.name)}${o.id === bestId ? '<span class="tag tag--rec">แนะนำ</span>' : ''}${current ? '<span class="tag">ผู้รับผิดชอบปัจจุบัน</span>' : ''}</span>
                  <span class="pick-sub">${esc(CATEGORIES[o.cat].dept)} · ${r.sameZone ? 'อยู่ในพื้นที่' : esc(o.zone)} · ${st.text}</span>
                </span>
                <span class="pick-load pick-load--${loadTone(r.pct)}">${r.active}/${o.capacity}${r.free <= 0 ? '<small>เต็ม</small>' : ''}</span>
              </label>`;
          }).join('')}
        </div>
        <p class="field-error" id="assignError" hidden>กรุณาเลือกเจ้าหน้าที่</p>
      </div>
      <footer class="dlg-foot">
        <button type="button" class="btn btn-ghost" data-action="close">ยกเลิก</button>
        <button type="submit" class="btn btn-primary">${forward ? 'ยืนยันการส่งต่อ' : reassign ? 'ยืนยันการเปลี่ยน' : 'ยืนยันมอบหมาย'}</button>
      </footer>
    </form>`;
  dialogs.assign.showModal();
  (dialogs.assign.querySelector('input:checked') || dialogs.assign.querySelector('input:not(:disabled)'))?.focus();
}

/* ---------- รายละเอียดเหตุ (แผงด้านขวา) ---------- */

const chip = (text, ok = true) => `<span class="chip-tag${ok ? ' chip-tag--ok' : ''}">${ok ? icon('check', 'icon--xs') : ''}${text}</span>`;

const fmtClockTime = (ts) => new Date(ts).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false });

// เหตุการณ์วันนี้แสดงแค่เวลา ส่วนวันอื่นแสดงวันที่ด้วย
function fmtEventTime(ts) {
  const sameDay = new Date(ts).toDateString() === new Date().toDateString();
  return sameDay ? `${fmtClockTime(ts)} น.` : `${fmtDateTime(ts)} น.`;
}

// แถบเตือนใต้หัวเรื่อง เปลี่ยนข้อความตามสถานะและความเร่งด่วนของเหตุ
function alertStrip(i) {
  const strip = (tone, html) => `<div class="alert-strip alert-strip--${tone}" role="status">${html}</div>`;
  const pri = PRIORITIES[i.pri];

  if (i.status === 'done') return strip('success', 'ปิดงานเรียบร้อยแล้ว');
  if (i.status === 'review') return strip('info', 'เจ้าหน้าที่ส่งผลการแก้ไขแล้ว — รอตรวจสอบและปิดงาน');
  if (isOverdue(i)) return strip('danger', `เกิน SLA: <b data-tick="over" data-ts="${resolveDeadline(i)}"></b> · ควรติดตามเจ้าหน้าที่ทันที`);
  if (i.status === 'pending') {
    const tone = { emergency: 'danger', urgent: 'warn', normal: 'neutral' }[i.pri];
    return strip(tone, `เหตุ${pri.label}: ควรตรวจสอบและมอบหมายภายใน ${fmtHuman(pri.assignSec)} · <b data-tick="remain" data-ts="${assignDeadline(i)}"></b>`);
  }
  return strip('neutral', `กำลังดำเนินการ · กำหนดแก้ไขตาม SLA <b data-tick="remain" data-ts="${resolveDeadline(i)}"></b>`);
}

// กล่องรูปหลักฐาน — แสดงรูปจริงถ้ามี ไม่มีก็แสดงข้อความแทน
function evidenceHtml(incident) {
  const urls = incident.photoUrls ?? [];
  if (!urls.length) {
    return `<div class="evidence-box">${icon('image')}<span>ยังไม่มีรูปหลักฐานแนบมา</span></div>`;
  }
  return `<div class="evidence-grid">${urls.map((url, n) => `
    <a class="evidence-thumb" href="${esc(url)}" target="_blank" rel="noopener" title="เปิดรูปเต็ม">
      <img src="${esc(url)}" alt="รูปหลักฐานที่ ${n + 1} ของ ${esc(incident.id)}" loading="lazy">
    </a>`).join('')}</div>`;
}

function infoCard(label, value, cls = '') {
  return `<div class="info-card"><span class="info-label">${label}</span><strong class="info-value ${cls}">${value}</strong></div>`;
}

function officerCard({ officer, sub, tag = '', chips = '' }) {
  return `
    <div class="officer-card">
      <div class="officer-top">
        ${officerAvatar(officer, 'md')}
        <div class="officer-meta"><strong>${esc(officer.name)}</strong><span>${sub}</span></div>
        ${tag}
      </div>
      ${chips ? `<div class="chips">${chips}</div>` : ''}
    </div>`;
}

// ส่วนเจ้าหน้าที่: ถ้ามอบหมายแล้วแสดงผู้รับผิดชอบ ถ้ายังไม่ได้มอบหมายแสดงคำแนะนำของระบบ
function officerSection(i) {
  const assigned = findOfficer(i.assignee);

  if (assigned) {
    const s = officerStats().find((x) => x.officer.id === assigned.id);
    const chips = [
      i.reminders > 0 ? chip(`แจ้งเตือนแล้ว ${i.reminders} ครั้ง`, false) : '',
      s.overdue > 0 ? chip(`มีงานเกิน SLA ${s.overdue} งาน`, false) : '',
    ].join('');
    return `
      <section class="sheet-section">
        <h4>ผู้รับผิดชอบ</h4>
        ${officerCard({ officer: assigned, sub: `${esc(CATEGORIES[assigned.cat].dept)} · ${officerStatus(s).text}`, tag: `<span class="tag">${s.active}/${assigned.capacity} งาน</span>`, chips })}
      </section>`;
  }

  const rec = bestOfficer(rankOfficers(i));
  if (!rec) {
    return `
      <section class="sheet-section">
        <h4>เจ้าหน้าที่ที่ระบบแนะนำ</h4>
        <div class="officer-card officer-card--empty">${esc(CATEGORIES[i.cat].dept)}ไม่มีผู้ว่างในขณะนี้ — กด “เลือกผู้รับผิดชอบ” เพื่อเลือกด้วยตนเอง</div>
      </section>`;
  }

  const chips = [
    chip('ตรงประเภทงาน'),
    chip('เข้าเวรปัจจุบัน'),
    rec.sameZone ? chip('อยู่ในพื้นที่') : '',
    chip(`มีคิวว่าง ${rec.free} งาน`),
  ].join('');
  return `
    <section class="sheet-section">
      <h4>เจ้าหน้าที่ที่ระบบแนะนำ</h4>
      ${officerCard({ officer: rec.officer, sub: `${esc(CATEGORIES[rec.officer.cat].dept)} · ${officerStatus(rec).text}`, tag: '<span class="tag tag--rec">แนะนำ</span>', chips })}
    </section>`;
}

// ลำดับเหตุการณ์ เรียงจากเก่าไปใหม่ ขั้นสุดท้ายคือสถานะ "ขณะนี้"
function timelineEvents(i) {
  const officer = findOfficer(i.assignee);
  const events = [
    { at: i.reportedAt, title: 'ระบบรับข้อมูลแจ้งเหตุ', desc: `จัดหมวดเป็น “${CATEGORIES[i.cat].label} · ${PRIORITIES[i.pri].label}”` },
    { at: i.reportedAt, title: 'แจ้งผู้ประสานงานแล้ว', desc: i.pri === 'emergency' ? 'In-app และ Web Push' : 'In-app' },
  ];
  if (officer && i.assignedAt) events.push({ at: i.assignedAt, title: `มอบหมายให้ ${officer.name}`, desc: CATEGORIES[officer.cat].dept });
  if (officer && i.lastReminderAt) events.push({ at: i.lastReminderAt, title: `ส่งแจ้งเตือนซ้ำ (รวม ${i.reminders} ครั้ง)`, desc: `ถึง ${officer.name}` });
  if (i.updatedAt) events.push({ at: i.updatedAt, title: 'เจ้าหน้าที่บันทึกผลการดำเนินงาน', desc: i.afterPhotos ? `แนบรูป ${i.afterPhotos} รูป` : 'ไม่ได้แนบรูป' });
  if (isOverdue(i)) events.push({ at: resolveDeadline(i), title: 'เกินกำหนด SLA', desc: `ต้องแก้ไขภายใน ${fmtHuman(PRIORITIES[i.pri].resolveSec)} นับจากเวลาแจ้ง`, tone: 'late' });
  if (i.closedAt) events.push({ at: i.closedAt, title: 'ตรวจสอบและปิดงานแล้ว', desc: officer ? `ผู้รับผิดชอบ: ${officer.name}` : '' });
  events.sort((a, b) => a.at - b.at);

  const current = {
    pending: { title: 'รอการยืนยันมอบหมาย', desc: i.pri === 'emergency' ? 'ระบบเตรียมแจ้งเตือนเจ้าหน้าที่ทันที' : 'รอผู้ประสานงานเลือกเจ้าหน้าที่' },
    progress: { title: 'กำลังดำเนินการ', desc: `${officer ? officer.name : 'เจ้าหน้าที่'} กำลังแก้ไขที่หน้างาน` },
    review: { title: 'รอตรวจสอบและปิดงาน', desc: 'ผู้ประสานงานตรวจผลการแก้ไข' },
  }[i.status];
  if (current) events.push({ ...current, now: true });
  return events;
}

function detailFooter(i) {
  const id = `data-id="${i.id}"`;
  if (i.status === 'pending') {
    return bestOfficer(rankOfficers(i))
      ? `<button type="button" class="btn btn-ghost" data-action="forward" ${id}>ส่งต่อเหตุ</button>
         <button type="button" class="btn btn-primary" data-action="quick-assign" ${id}>ยืนยันมอบหมาย</button>`
      : `<button type="button" class="btn btn-primary" data-action="assign" ${id}>เลือกผู้รับผิดชอบ</button>`;
  }
  if (i.status === 'progress') {
    return `<button type="button" class="btn btn-ghost" data-action="forward" ${id}>ส่งต่อเหตุ</button>
            <button type="button" class="btn btn-primary" data-action="remind" ${id}>แจ้งเตือนซ้ำ</button>`;
  }
  if (i.status === 'review') return `<button type="button" class="btn btn-primary" data-action="close-job" ${id}>ตรวจสอบและปิดงาน</button>`;
  return '<button type="button" class="btn btn-ghost" data-action="close">ปิดหน้าต่าง</button>';
}

function openDetail(incident) {
  const i = incident;
  const overdue = isOverdue(i);
  const events = timelineEvents(i);

  dialogs.detail.innerHTML = `
    <div class="dlg">
      <header class="sheet-head">
        <div>
          <p class="sheet-eyebrow">รายละเอียดเหตุ</p>
          <h2 id="detailTitle">${i.id}</h2>
        </div>
        <button type="button" class="icon-btn icon-btn--outline" data-action="close" aria-label="ปิด">${icon('x')}</button>
      </header>

      <div class="dlg-body">
        ${alertStrip(i)}

        <div class="sheet-title">
          <div>
            <h3>${esc(i.title)}</h3>
            <p class="muted">${esc(formatPlace(i))}</p>
          </div>
          ${priorityBadge(i.pri)}
        </div>

        <div class="info-grid">
          ${infoCard('สถานะปัจจุบัน', STATUSES[i.status], `is-${i.status}`)}
          ${infoCard('เวลาที่รับแจ้ง', fmtFullDateTime(i.reportedAt))}
          ${infoCard('ผู้แจ้งเหตุ', esc(i.reporter || 'ไม่ระบุ'))}
          ${infoCard('หมายเลขติดต่อ', maskPhone(i.phone))}
          ${infoCard('ประเภทเหตุ', esc(CATEGORIES[i.cat].label))}
          ${i.closedAt
            ? infoCard('ปิดงานเมื่อ', fmtFullDateTime(i.closedAt))
            : infoCard('กำหนดแก้ไข (SLA)', `${fmtDateTime(resolveDeadline(i))} น.`, overdue ? 'is-late' : '')}
        </div>

        <section class="sheet-section">
          <h4>รายละเอียด</h4>
          <p class="detail-box${i.note ? '' : ' is-empty'}">${i.note ? esc(i.note) : 'ไม่มีรายละเอียดเพิ่มเติม'}</p>
        </section>

        ${officerSection(i)}

        <section class="sheet-section">
          <h4>ลำดับเหตุการณ์</h4>
          <ol class="timeline">
            ${events.map((e) => `
              <li class="tl-item${e.now ? ' tl-item--now' : ''}${e.tone === 'late' ? ' tl-item--late' : ''}">
                <span class="tl-dot" aria-hidden="true"></span>
                <div class="tl-body">
                  <strong>${esc(e.title)}</strong>
                  ${e.desc ? `<span class="tl-desc">${esc(e.desc)}</span>` : ''}
                  <span class="tl-time">${e.now ? 'ขณะนี้' : fmtEventTime(e.at)}</span>
                </div>
              </li>`).join('')}
          </ol>
        </section>
      </div>

      <footer class="dlg-foot">${detailFooter(i)}</footer>
    </div>`;
  updateTimers();
  dialogs.detail.showModal();
}

function openCreate() {
  const options = (entries) => entries.map(([value, label]) => `<option value="${esc(value)}">${esc(label)}</option>`).join('');

  dialogs.create.innerHTML = `
    <form class="dlg" id="newForm" novalidate>
      <header class="dlg-head">
        <div>
          <h2 id="newTitle">รับแจ้งเหตุใหม่</h2>
          <p class="muted">บันทึกเหตุที่ได้รับแจ้ง ระบบจะแนะนำผู้รับผิดชอบให้อัตโนมัติ</p>
        </div>
        ${closeButton}
      </header>
      <div class="dlg-body">
        <div class="field" id="nfTitleField">
          <label for="nfTitle">หัวข้อเหตุ <span class="req" aria-hidden="true">*</span></label>
          <input class="input" id="nfTitle" name="title" type="text" maxlength="120" autocomplete="off" placeholder="เช่น น้ำรั่วบริเวณทางเดิน" aria-describedby="nfTitleError">
          <p class="field-error" id="nfTitleError" hidden>กรุณากรอกหัวข้อเหตุ</p>
        </div>
        <fieldset class="field">
          <legend>ระดับความรุนแรง</legend>
          <div class="seg">
            <label class="seg-opt"><input type="radio" name="pri" value="normal" checked><span>ปกติ</span></label>
            <label class="seg-opt seg-opt--urgent"><input type="radio" name="pri" value="urgent"><span>เร่งด่วน</span></label>
            <label class="seg-opt seg-opt--emergency"><input type="radio" name="pri" value="emergency"><span>ฉุกเฉิน</span></label>
          </div>
        </fieldset>
        <div class="field-row">
          <div class="field">
            <label for="nfCat">ประเภทเหตุ</label>
            <select class="select" id="nfCat" name="cat">${options(Object.entries(CATEGORIES).map(([k, c]) => [k, c.label]))}</select>
          </div>
          <div class="field">
            <label for="nfZone">พื้นที่</label>
            <select class="select" id="nfZone" name="zone">${options(ZONES.map((z) => [z, z]))}</select>
          </div>
        </div>
        <div class="field">
          <label for="nfDetail">รายละเอียดสถานที่ (ถ้ามี)</label>
          <input class="input" id="nfDetail" name="detail" type="text" maxlength="80" autocomplete="off" placeholder="เช่น ห้อง 304 ชั้น 3">
        </div>
        <div class="field-row">
          <div class="field">
            <label for="nfReporter">ผู้แจ้งเหตุ (ถ้ามี)</label>
            <input class="input" id="nfReporter" name="reporter" type="text" maxlength="80" autocomplete="off" placeholder="ชื่อ-นามสกุล">
          </div>
          <div class="field" id="nfPhoneField">
            <label for="nfPhone">เบอร์ติดต่อ (ถ้ามี)</label>
            <input class="input" id="nfPhone" name="phone" type="tel" maxlength="20" autocomplete="off" inputmode="tel" placeholder="เช่น 0812345678" aria-describedby="nfPhoneError">
            <p class="field-error" id="nfPhoneError" hidden>เบอร์โทรไม่ถูกต้อง</p>
          </div>
        </div>
        <div class="field">
          <label for="nfNote">รายละเอียดเพิ่มเติม</label>
          <textarea class="textarea" id="nfNote" name="note" rows="3" maxlength="400" placeholder="อาการที่พบ หรือข้อมูลที่ผู้แจ้งให้มา"></textarea>
        </div>
        <div class="field">
          <label for="nfPhotos">รูปภาพประกอบ (ถ้ามี)</label>
          <input class="input" id="nfPhotos" name="photos" type="file" accept="image/*" multiple>
          <p class="muted small" id="nfPhotosHint">แนบได้หลายรูป ไฟล์ละไม่เกิน 10 MB</p>
        </div>
      </div>
      <footer class="dlg-foot">
        <button type="button" class="btn btn-ghost" data-action="close">ยกเลิก</button>
        <button type="submit" class="btn btn-primary">บันทึกการแจ้งเหตุ</button>
      </footer>
    </form>`;
  dialogs.create.showModal();
  $('nfTitle').focus();
}

function askConfirm({ title, message, okText }) {
  return new Promise((resolve) => {
    const dlg = dialogs.confirm;
    dlg.innerHTML = `
      <form method="dialog">
        <div class="confirm-text"><h2 id="confirmTitle">${esc(title)}</h2><p>${esc(message)}</p></div>
        <div class="dlg-foot">
          <button type="submit" value="cancel" class="btn btn-ghost">ยกเลิก</button>
          <button type="submit" value="ok" class="btn btn-primary">${esc(okText)}</button>
        </div>
      </form>`;
    dlg.returnValue = '';
    dlg.addEventListener('close', () => resolve(dlg.returnValue === 'ok'), { once: true });
    dlg.showModal();
  });
}

/* ---------- Actions (เปลี่ยนข้อมูล → วาดหน้าใหม่ → แจ้งผล) ---------- */

async function assign(incident, officerId, { forward = false } = {}) {
  const officer = findOfficer(officerId);
  const wasPending = incident.status === 'pending';
  const verb = forward ? 'ส่งต่อ' : wasPending ? 'มอบหมาย' : 'เปลี่ยนผู้รับผิดชอบ';

  try {
    await api(`/api/incidents/${numOf(incident)}/assign/`, {
      method: 'POST',
      body: { officer: officerId },
    });
    await refresh();
    toast(`${verb} ${incident.id} ให้ ${officer.name} แล้ว`, 'success');
  } catch (error) {
    toast(`${verb}ไม่สำเร็จ: ${error.message}`, 'error');
  }
}

function quickAssign(incident) {
  const best = bestOfficer(rankOfficers(incident));
  if (best) assign(incident, best.officer.id);
  else openAssign(incident);
}

async function remind(incident) {
  const officer = findOfficer(incident.assignee);
  try {
    const updated = await api(`/api/incidents/${numOf(incident)}/remind/`, { method: 'POST' });
    await refresh();
    toast(`ส่งแจ้งเตือนถึง ${officer.name} แล้ว (ครั้งที่ ${updated.reminders})`, 'success');
  } catch (error) {
    toast(`ส่งแจ้งเตือนไม่สำเร็จ: ${error.message}`, 'error');
  }
}

async function closeJob(incident) {
  const ok = await askConfirm({
    title: `ปิดงาน ${incident.id}?`,
    message: 'ยืนยันว่าได้ตรวจสอบผลการแก้ไขแล้ว งานนี้จะย้ายไปสถานะ “ดำเนินการเสร็จสิ้น”',
    okText: 'ตรวจสอบและปิดงาน',
  });
  if (!ok) return;

  try {
    await api(`/api/incidents/${numOf(incident)}/close/`, { method: 'POST' });
    await refresh();
    toast(`ปิดงาน ${incident.id} แล้ว`, 'success');
  } catch (error) {
    toast(`ปิดงานไม่สำเร็จ: ${error.message}`, 'error');
  }
}

async function createIncident({ title, cat, pri, zone, detail, note, reporter, phone, photos = [] }) {
  try {
    // ใช้ FormData เพราะต้องแนบไฟล์รูปไปพร้อมกัน
    const form = new FormData();
    form.append('title', title);
    form.append('cat', cat);
    form.append('pri', pri);
    form.append('zone', zone);
    form.append('place', [zone, detail].filter(Boolean).join(' '));
    form.append('note', note ?? '');
    form.append('reporter_name', reporter ?? '');
    form.append('reporter_phone', phone ?? '');
    [...photos].forEach((file) => form.append('photos', file));

    const created = await api('/api/incidents/', { method: 'POST', body: form });
    if (typeof resetView === 'function') resetView();
    await refresh();
    toast(`รับแจ้งเหตุ ${created.id} แล้ว`, 'success');
  } catch (error) {
    toast(`บันทึกไม่สำเร็จ: ${error.message}`, 'error');
  }
}

/* ---------- Refresh & ticker ---------- */

// ดึงข้อมูลล่าสุดจากเซิร์ฟเวอร์แล้ววาดหน้าใหม่ (เรียกตอนเปิดหน้า และหลังบันทึกข้อมูล)
// เซิร์ฟเวอร์เป็นแหล่งความจริงเดียว จึงโหลดใหม่ทุกครั้งแทนการแก้ข้อมูลในหน่วยความจำ
async function refresh() {
  await loadIncidents();
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
   โหลดข้อมูลอ้างอิง + ผู้ใช้ + เจ้าหน้าที่ + เหตุ ให้ครบก่อนวาดหน้าครั้งแรก
   สคริปต์ของแต่ละหน้าเรียก boot() แทน refresh() ตอนเปิดหน้า */
async function boot() {
  try {
    await Promise.all([loadReference(), loadUser(), loadOfficers()]);
    renderShellUser(); // ชื่อในเมนูซ้ายถูกวาดตั้งแต่ยังไม่มีข้อมูล จึงต้องเติมอีกครั้งตรงนี้
    await loadIncidents();
    state.ready = true;
    // ต้อง await เพราะบางหน้าโหลดข้อมูลของตัวเองใน onReady (เช่น รายชื่อผู้ใช้งาน)
    // ถ้าไม่รอ หน้าจะวาดก่อนข้อมูลมาถึง แล้วขึ้นตารางว่าง
    if (typeof onReady === 'function') await onReady();
    rerender();
  } catch (error) {
    if (error.message !== 'unauthenticated') {
      toast(`โหลดข้อมูลไม่สำเร็จ: ${error.message}`, 'error');
    }
  }
}

// ให้ตัวนับเวลาเดินทุกวินาที และวาดหน้าใหม่เมื่อมีเหตุที่เพิ่งเกินกำหนดเวลา
function startTicker() {
  setInterval(() => {
    updateTimers();
    // วาดใหม่จากข้อมูลเดิมเมื่อมีเหตุเพิ่งเกิน SLA — ไม่ยิง API ทุกวินาที
    if (signature() !== lastSignature) rerender();
  }, 1000);

  // ดึงข้อมูลใหม่จากเซิร์ฟเวอร์เป็นระยะ เพื่อให้เห็นงานที่คนอื่นเพิ่งเปลี่ยน
  setInterval(() => {
    if (state.ready && !document.hidden) refresh().catch(() => {});
  }, 20000);
}

/* ---------- Events (ใช้ร่วมกันทุกหน้า) ---------- */

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const refocus = (selector) => document.querySelector(selector)?.focus();

// ปุ่มหรือแถวที่มี data-action: คำสั่งที่รู้จักทำที่นี่ คำสั่งอื่นส่งให้ handlePageAction() ของหน้านั้น
document.addEventListener('click', (event) => {
  const el = event.target.closest('[data-action]');
  if (!el) return;

  const { action } = el.dataset;
  const incident = el.dataset.id ? findIncident(el.dataset.id) : null;

  // ปุ่มที่กดจากในป๊อปอัป: ปิดป๊อปอัปก่อน เพื่อให้เห็นผลลัพธ์ (ข้อความแจ้งผลจะไม่ถูกบัง)
  const dialog = el.closest('dialog');
  if (dialog && action !== 'close') dialog.close();

  switch (action) {
    case 'close':
      dialog.close();
      break;
    case 'new':
      openCreate();
      break;
    case 'detail':
      openDetail(incident);
      break;
    case 'assign':
      openAssign(incident);
      break;
    case 'forward':
      openAssign(incident, { forward: true });
      break;
    case 'quick-assign':
      quickAssign(incident);
      break;
    case 'remind':
      remind(incident);
      break;
    case 'close-job':
      closeJob(incident);
      break;
    case 'reload':
      closeUserMenu();
      refresh().then(() => toast('โหลดข้อมูลล่าสุดแล้ว', 'success')).catch(() => {});
      break;
    case 'logout':
      logout();
      break;
    default:
      if (typeof handlePageAction === 'function') handlePageAction(action, el);
  }
});

document.addEventListener('keydown', (event) => {
  const row = event.target.closest?.('tr[data-action="detail"]');
  if (row && event.target === row && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault();
    openDetail(findIncident(row.dataset.id));
  }
  if (event.key === 'Escape') {
    closeUserMenu();
    closeNav();
  }
});

document.addEventListener('submit', (event) => {
  const form = event.target;

  if (form.id === 'assignForm') {
    event.preventDefault();
    const officerId = new FormData(form).get('officer');
    if (!officerId) {
      $('assignError').hidden = false;
      return;
    }
    dialogs.assign.close();
    assign(findIncident(form.dataset.id), officerId, { forward: form.dataset.forward === 'true' });
  }

  if (form.id === 'newForm') {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    const title = String(data.title).trim();
    const phone = String(data.phone).trim();
    const phoneOk = !phone || /^[0-9+\-\s]{8,20}$/.test(phone);

    $('nfTitleField').classList.toggle('has-error', !title);
    $('nfTitleError').hidden = Boolean(title);
    $('nfPhoneField').classList.toggle('has-error', !phoneOk);
    $('nfPhoneError').hidden = phoneOk;
    if (!title || !phoneOk) {
      (!title ? $('nfTitle') : $('nfPhone')).focus();
      return;
    }

    // อ่านไฟล์จาก input โดยตรง (FormData รวมไฟล์หลายตัวเป็นค่าเดียวไม่ได้)
    const photos = $('nfPhotos')?.files ?? [];

    dialogs.create.close();
    createIncident({
      title,
      cat: data.cat,
      pri: data.pri,
      zone: data.zone,
      detail: String(data.detail).trim(),
      note: String(data.note).trim(),
      reporter: String(data.reporter).trim(),
      phone,
      photos,
    });
  }
});

// คลิกพื้นหลังมืดเพื่อปิดป๊อปอัป
Object.values(dialogs).forEach((dlg) => {
  dlg.addEventListener('click', (event) => {
    if (event.target === dlg) dlg.close();
  });
});

/* เมนูผู้ใช้ & เมนูบนมือถือ */

function closeUserMenu() {
  const menu = $('userMenu');
  if (!menu) return;
  menu.hidden = true;
  $('userMenuBtn').setAttribute('aria-expanded', 'false');
}

document.addEventListener('click', (event) => {
  if (!event.target.closest('.sidebar-user')) closeUserMenu();
});

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

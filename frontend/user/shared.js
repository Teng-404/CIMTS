'use strict';

/* CampusCare Incident Center — พอร์ทัลผู้แจ้งเหตุ (นักศึกษา/บุคลากร)
   โค้ดที่ใช้ร่วมกันทุกหน้าของผู้ใช้ (แจ้งเหตุ / ประวัติการแจ้งเหตุ / สถิติของฉัน)
   แยกต่างหากจากฝั่งผู้ดูแล (ดู admin/shared.js) เพราะเป็นคนละระบบ คนละสิทธิ์ — ใช้ธีมสีและคอมโพเนนต์ร่วมกันเท่านั้น

   วิธีใช้: โหลดไฟล์นี้ก่อนสคริปต์ของแต่ละหน้า แล้วในสคริปต์ของหน้านั้น
     1) เรียก mountShell('<คีย์เมนู>') เพื่อสร้างเมนูซ้ายและแถบบน
     2) ประกาศฟังก์ชัน render() ของหน้านั้นเอง แล้วเรียก refresh() เองหนึ่งครั้งเพื่อวาดหน้า (ไม่มีตัวนับเวลาสดเหมือนฝั่งผู้ดูแล)

   ข้อมูลทั้งหมดมาจาก backend จริงผ่าน REST API (ดู api() ด้านล่าง)
   ค่าอ้างอิง (CATEGORIES / ZONES และคำอธิบายระดับความเร่งด่วน) โหลดจากเซิร์ฟเวอร์ตอนเปิดหน้า

   ต้องเปิดหน้าเว็บผ่าน http://127.0.0.1:8000/user/... (ที่ Django เสิร์ฟ)
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

// สีและชื่อประเภทเหตุ — ใช้ชุดเดียวกับฝั่งผู้ดูแล เพื่อให้ผู้แจ้งเห็นป้ายสีตรงกับที่เจ้าหน้าที่เห็น
// ค่าอ้างอิงโหลดจาก /api/reference ตอนเปิดหน้า (ดู loadReference)
const CATEGORIES = {};

const ZONES = [];

// ระดับความเร่งด่วนที่ผู้แจ้งเลือกเบื้องต้นตอนแจ้งเหตุ (เจ้าหน้าที่จะตรวจสอบรายละเอียดอีกครั้งเมื่อรับเรื่อง)
// examples/note ใช้แสดงเป็นตัวอย่างประกอบในฟอร์ม ให้ผู้แจ้งเห็นภาพขอบเขตของแต่ละระดับ
const PRIORITIES = {
  emergency: {
    label: 'ฉุกเฉิน',
    tone: 'danger',
    examples: ['เพลิงไหม้หรือมีควันไฟ', 'ไฟฟ้าลัดวงจร มีประกายไฟ', 'มีผู้บาดเจ็บหรือเจ็บป่วยฉุกเฉิน', 'กลิ่นแก๊สรั่ว', 'โครงสร้างอาคารร้าวหรือทรุดจนอาจเป็นอันตราย'],
    note: 'อันตรายต่อชีวิตหรือทรัพย์สินทันที — หากรุนแรงถึงขั้นเป็นอันตรายถึงชีวิต ให้โทรแจ้งเบอร์ฉุกเฉินควบคู่ไปด้วย ดูได้ที่เมนู “เบอร์ติดต่อฉุกเฉิน”',
  },
  urgent: {
    label: 'เร่งด่วน',
    tone: 'warn',
    examples: ['ไฟฟ้าดับทั้งอาคารหรือทั้งชั้น', 'น้ำท่วมขังในอาคาร', 'ประตูทางออกฉุกเฉินเปิดไม่ได้', 'ลิฟต์ค้างมีคนติดอยู่ข้างใน', 'กล้องวงจรปิดจุดเสี่ยงใช้งานไม่ได้'],
    note: 'กระทบการใช้งานเป็นวงกว้างหรือมีความเสี่ยง ควรได้รับการแก้ไขภายในไม่กี่ชั่วโมง',
  },
  normal: {
    label: 'ปกติ',
    tone: 'neutral',
    examples: ['หลอดไฟดับดวงเดียว', 'ก๊อกน้ำหยดหรือรั่วซึมเล็กน้อย', 'Wi-Fi ช้าหรือหลุดบ่อย', 'ประตูหรือกลอนห้องน้ำชำรุด', 'ขยะล้นถังหรือพื้นที่สกปรก'],
    note: 'ไม่กระทบความปลอดภัยหรือการใช้งานเร่งด่วน สามารถรอคิวดำเนินการตามปกติได้',
  },
};

// สถานะจากมุมมองผู้แจ้ง 4 ขั้น (เรียบง่ายกว่าฝั่งผู้ดูแลที่มีขั้น "รอตรวจผล" แทรกอยู่ — ผู้แจ้งไม่จำเป็นต้องรู้รายละเอียดขั้นตอนภายใน)
const STATUSES = {
  pending: 'รอดำเนินการ',
  assigned: 'มอบหมายแล้ว',
  progress: 'กำลังดำเนินการ',
  done: 'เสร็จสิ้น',
};

// ป้ายบนแถบความคืบหน้า 5 จุด — สองจุดแรก (รับแจ้ง/ตรวจสอบ) ถือว่าเสร็จทันทีที่เหตุเข้าระบบ
const STEPS = ['รับแจ้งเหตุ', 'ตรวจสอบแล้ว', 'มอบหมายแล้ว', 'กำลังดำเนินการ', 'เสร็จสิ้น'];
const STEP_INDEX = { pending: 1, assigned: 2, progress: 3, done: 4 };

/* ---------- ชั้นข้อมูล (เชื่อมกับ backend) ---------- */

const state = { incidents: [], ready: false };

// แปลง JSON จาก API ให้เป็นรูปแบบเดียวกับที่สคริปต์ของแต่ละหน้าใช้อยู่
// API ส่ง status เป็นมุมมองของผู้แจ้งให้แล้ว (pending / assigned / progress / done)
// โดยยุบขั้น "รอตรวจผล" ของฝั่งผู้ดูแลรวมเข้ากับ "กำลังดำเนินการ"
function mapIncident(raw) {
  return {
    id: raw.id,
    title: raw.title,
    cat: raw.cat,
    pri: raw.pri,
    zone: raw.zone,
    place: raw.place,
    note: raw.note ?? '',
    status: raw.status,
    officer: raw.officer ?? null,
    reportedAt: raw.reportedAt,
    assignedAt: raw.assignedAt,
    // ผู้แจ้งถือว่างาน "เริ่มลงมือ" เมื่อเจ้าหน้าที่กดรับทราบงาน
    startedAt: raw.ackAt,
    closedAt: raw.closedAt,
    // photoUrls = รูปที่ตัวเองแนบตอนแจ้ง / afterPhotoUrls = รูปที่เจ้าหน้าที่แนบตอนซ่อมเสร็จ
    photos: raw.photos?.length ?? 0,
    photoUrls: (raw.photos ?? []).map((p) => p.url),
    afterPhotoUrls: (raw.updates ?? []).flatMap((u) => (u.photos ?? []).map((p) => p.url)),
  };
}

async function loadReference() {
  const ref = await api('/api/reference');
  // เติมลงตัวแปรเดิมแทนการประกาศใหม่ เพราะสคริปต์หน้าอื่นอ้างถึงตัวเดียวกันนี้
  Object.assign(CATEGORIES, ref.categories);
  ZONES.length = 0;
  ZONES.push(...ref.zones);

  // คง tone เดิมของแต่ละระดับไว้ ทับเฉพาะข้อความที่มาจากเซิร์ฟเวอร์
  Object.entries(ref.priorities).forEach(([key, value]) => {
    PRIORITIES[key] = { ...PRIORITIES[key], ...value };
  });
}

// backend กรองให้เองแล้วว่าเป็นเหตุที่ผู้ใช้คนนี้แจ้งเท่านั้น
async function loadIncidents() {
  const data = await api('/api/incidents/?page_size=500');
  state.incidents = (data.results ?? data).map(mapIncident);
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

/* ---------- Selectors ---------- */

const $ = (id) => document.getElementById(id);
const esc = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const numOf = (incident) => incident.id.slice(4);
const findIncident = (id) => state.incidents.find((i) => i.id === id);
const isActive = (i) => i.status !== 'done';

function matchesQuery(incident, query) {
  const q = query.trim().toLowerCase().replace(/^#/, '');
  if (!q) return true;
  const fields = [incident.id, numOf(incident), incident.title, incident.place, CATEGORIES[incident.cat].label, incident.officer ?? ''];
  return fields.some((text) => text.toLowerCase().includes(q));
}

function counts() {
  return {
    all: state.incidents.length,
    pending: state.incidents.filter((i) => i.status === 'pending').length,
    active: state.incidents.filter(isActive).length,
    done: state.incidents.filter((i) => i.status === 'done').length,
  };
}

/* ---------- Formatters ---------- */

const pad = (n) => String(Math.floor(n)).padStart(2, '0');

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
const statusBadge = (i) => `<span class="badge badge--${i.status}">${STATUSES[i.status]}</span>`;

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

// แถบความคืบหน้า 5 จุดแนวนอน ใช้ทั้งในการ์ดหน้าแจ้งเหตุและหน้าต่างรายละเอียดในประวัติ
function trackerHtml(incident) {
  const current = STEP_INDEX[incident.status];
  return `
    <div class="tracker" role="img" aria-label="สถานะ: ${esc(STATUSES[incident.status])}">
      ${STEPS.map((label, idx) => {
        const state = idx < current ? 'done' : idx === current ? 'current' : 'pending';
        return `
          <div class="tracker-step is-${state}">
            <span class="tracker-dot">${state === 'done' ? icon('check', 'icon--xs') : ''}</span>
            <span class="tracker-label">${esc(label)}</span>
          </div>`;
      }).join('')}
    </div>`;
}

/* ---------- Shell: เมนูซ้ายและแถบบน ---------- */

const ICON_SPRITE = `
<svg class="sprite" aria-hidden="true" focusable="false">
  <symbol id="i-alert" viewBox="0 0 24 24"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></symbol>
  <symbol id="i-clipboard" viewBox="0 0 24 24"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></symbol>
  <symbol id="i-hourglass" viewBox="0 0 24 24"><path d="M5 22h14"/><path d="M5 2h14"/><path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"/><path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"/></symbol>
  <symbol id="i-check" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></symbol>
  <symbol id="i-bar-chart" viewBox="0 0 24 24"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></symbol>
  <symbol id="i-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></symbol>
  <symbol id="i-plus" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></symbol>
  <symbol id="i-menu" viewBox="0 0 24 24"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></symbol>
  <symbol id="i-more" viewBox="0 0 24 24"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></symbol>
  <symbol id="i-x" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></symbol>
  <symbol id="i-map-pin" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></symbol>
  <symbol id="i-user" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></symbol>
  <symbol id="i-log-out" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></symbol>
  <symbol id="i-chevron-left" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></symbol>
  <symbol id="i-chevron-right" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></symbol>
  <symbol id="i-inbox" viewBox="0 0 24 24"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></symbol>
  <symbol id="i-camera" viewBox="0 0 24 24"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></symbol>
  <symbol id="i-refresh" viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></symbol>
  <symbol id="i-arrow-right" viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></symbol>
  <symbol id="i-phone" viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></symbol>
  <symbol id="i-upload" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></symbol>
</svg>`;

const NAV = [
  { key: 'report', label: 'แจ้งเหตุ', icon: 'clipboard', href: 'report.html' },
  { key: 'contacts', label: 'เบอร์ติดต่อฉุกเฉิน', icon: 'phone', href: 'contacts.html' },
  { key: 'history', label: 'ประวัติการแจ้งเหตุ', icon: 'alert', href: 'history.html', badge: 'active' },
  { key: 'stats', label: 'สถิติของฉัน', icon: 'bar-chart', href: 'stats.html' },
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
      <input id="searchInput" type="search" placeholder="ค้นหาเลขที่เหตุ รายการ หรือสถานที่" autocomplete="off" aria-label="ค้นหาเหตุของฉัน">
    </label>

    <div class="topbar-actions">
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

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.sidebar-user')) closeUserMenu();
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

/* ---------- Create incident (ฟอร์ม "แจ้งเหตุใหม่" — ใช้ร่วมกันทุกหน้า) ---------- */

const dialogs = { create: $('newDialog'), detail: $('detailDialog') };
const closeButton = `<button type="button" class="icon-btn" data-action="close" aria-label="ปิด">${icon('x')}</button>`;

// เก็บไฟล์ที่เลือกไว้ชั่วคราว (พรีวิวฝั่งไคลเอนต์เท่านั้น ยังไม่มีการอัปโหลดจริงเพราะยังไม่มีเซิร์ฟเวอร์)
let pendingPhotos = [];
const MAX_PHOTO_MB = 10;
const PHOTO_TYPES = ['image/png', 'image/jpeg'];

function severityHintHtml(pri) {
  const p = PRIORITIES[pri];
  return `
    <div class="severity-hint severity-hint--${p.tone}">
      <strong>ตัวอย่างเหตุระดับ${esc(p.label)}:</strong>
      <ul>${p.examples.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>
      <p>${esc(p.note)}</p>
    </div>`;
}

function openCreate() {
  pendingPhotos = [];
  const options = (entries, placeholder) => `<option value="" disabled selected hidden>${esc(placeholder)}</option>` + entries.map(([value, label]) => `<option value="${esc(value)}">${esc(label)}</option>`).join('');

  dialogs.create.innerHTML = `
    <form class="dlg" id="newForm" novalidate>
      <header class="dlg-head">
        <div>
          <p class="sheet-eyebrow">รายละเอียดเหตุ</p>
          <h2 id="newTitle">แจ้งเหตุภายในมหาวิทยาลัย</h2>
        </div>
        ${closeButton}
      </header>
      <div class="dlg-body">
        <div class="field" id="nfTitleField">
          <label for="nfTitle">หัวข้อเหตุ <span class="req" aria-hidden="true">*</span></label>
          <input class="input" id="nfTitle" name="title" type="text" maxlength="120" autocomplete="off" placeholder="เช่น ไฟทางเดินหน้าหอพักดับ" aria-describedby="nfTitleError">
          <p class="field-error" id="nfTitleError" hidden>กรุณากรอกหัวข้อเหตุ</p>
        </div>

        <div class="field-row">
          <div class="field" id="nfCatField">
            <label for="nfCat">ประเภทเหตุ</label>
            <select class="select" id="nfCat" name="cat" aria-describedby="nfCatError">${options(Object.entries(CATEGORIES).map(([k, c]) => [k, c.label]), 'เลือกประเภทเหตุ')}</select>
            <p class="field-error" id="nfCatError" hidden>กรุณาเลือกประเภทเหตุ</p>
          </div>
          <div class="field">
            <label for="nfPri">ระดับความเร่งด่วน</label>
            <select class="select" id="nfPri" name="pri">${Object.entries(PRIORITIES).map(([k, p]) => `<option value="${k}"${k === 'normal' ? ' selected' : ''}>${esc(p.label)}</option>`).join('')}</select>
          </div>
        </div>
        <div id="severityHint">${severityHintHtml('normal')}</div>

        <div class="field-row" style="margin-top:20px">
          <div class="field" id="nfZoneField">
            <label for="nfZone">อาคาร</label>
            <select class="select" id="nfZone" name="zone" aria-describedby="nfZoneError">${options(ZONES.map((z) => [z, z]), 'เลือกอาคาร')}</select>
            <p class="field-error" id="nfZoneError" hidden>กรุณาเลือกอาคาร</p>
          </div>
          <div class="field">
            <label for="nfDetail">ห้อง / จุดเกิดเหตุ</label>
            <input class="input" id="nfDetail" name="detail" type="text" maxlength="80" autocomplete="off" placeholder="เช่น ห้อง E212">
          </div>
        </div>

        <div class="field">
          <label for="nfNote">รายละเอียด</label>
          <textarea class="textarea" id="nfNote" name="note" rows="5" maxlength="400" placeholder="อธิบายสิ่งที่พบ เกิดขึ้นตั้งแต่เมื่อไร"></textarea>
        </div>

        <div class="field">
          <label for="nfPhotos">แนบรูปภาพประกอบ</label>
          <label class="photo-drop" for="nfPhotos">
            <span class="photo-drop-icon">${icon('upload')}</span>
            <strong>แนบรูปภาพประกอบ</strong>
            <span>PNG หรือ JPG ขนาดไม่เกิน ${MAX_PHOTO_MB}MB</span>
          </label>
          <input class="visually-hidden" id="nfPhotos" name="photos" type="file" accept="image/png,image/jpeg" multiple>
          <div class="photo-preview" id="photoPreview"></div>
        </div>
      </div>
      <footer class="dlg-foot">
        <button type="button" class="btn btn-ghost" data-action="close">ยกเลิก</button>
        <button type="submit" class="btn btn-primary">ส่งเรื่องแจ้งเหตุ</button>
      </footer>
    </form>`;
  dialogs.create.showModal();
  $('nfTitle').focus();

  $('nfPri').addEventListener('change', (event) => {
    $('severityHint').innerHTML = severityHintHtml(event.target.value);
  });

  $('nfPhotos').addEventListener('change', (event) => {
    const accepted = [];
    const rejected = [];
    [...event.target.files].forEach((file) => {
      const tooBig = file.size > MAX_PHOTO_MB * 1024 * 1024;
      const wrongType = !PHOTO_TYPES.includes(file.type);
      if (tooBig || wrongType) rejected.push(file.name);
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

async function createIncident({ title, cat, pri, zone, detail, note, photos = [] }) {
  try {
    // ใช้ FormData เพราะต้องแนบรูปประกอบไปพร้อมกัน
    const form = new FormData();
    form.append('title', title);
    form.append('cat', cat);
    form.append('pri', pri);
    form.append('zone', zone);
    form.append('place', [zone, detail].filter(Boolean).join(' '));
    form.append('note', note ?? '');
    photos.filter(Boolean).forEach((file) => form.append('photos', file));

    const created = await api('/api/incidents/', { method: 'POST', body: form });
    if (typeof resetView === 'function') resetView();
    await refresh();
    toast(`ส่งเรื่องแจ้งเหตุ ${created.id} เรียบร้อยแล้ว`, 'success');
  } catch (error) {
    toast(`ส่งเรื่องไม่สำเร็จ: ${error.message}`, 'error');
  }
}

/* ---------- รายละเอียดเหตุ (หน้าต่างดูอย่างเดียว ไม่มีการจัดการ) ---------- */

// ตารางรูปย่อ กดแล้วเปิดรูปเต็มในแท็บใหม่
function photoGridHtml(urls, incidentId, label) {
  return `<div class="evidence-grid">${urls.map((url, n) => `
    <a class="evidence-thumb" href="${esc(url)}" target="_blank" rel="noopener" title="เปิดรูปเต็ม">
      <img src="${esc(url)}" alt="${esc(label)}ที่ ${n + 1} ของ ${esc(incidentId)}" loading="lazy">
    </a>`).join('')}</div>`;
}

// รูปสองชุด — รูปที่ตัวเองแนบตอนแจ้ง และรูปที่เจ้าหน้าที่แนบตอนซ่อมเสร็จ
// ชุดหลังคือสิ่งที่ผู้แจ้งใช้ยืนยันว่าเรื่องได้รับการแก้ไขจริง
function detailPhotoSections(i) {
  const before = i.photoUrls ?? [];
  const after = i.afterPhotoUrls ?? [];
  if (!before.length && !after.length) return '';

  return `
    ${before.length ? `
      <section class="sheet-section">
        <h4>รูปที่คุณแนบไว้ (${before.length})</h4>
        ${photoGridHtml(before, i.id, 'รูปที่แนบตอนแจ้งเหตุ')}
      </section>` : ''}
    ${after.length ? `
      <section class="sheet-section">
        <h4>รูปหลังเจ้าหน้าที่ดำเนินการ (${after.length})</h4>
        ${photoGridHtml(after, i.id, 'รูปหลังดำเนินการ')}
      </section>` : ''}`;
}

function openDetail(incident) {
  const i = incident;
  const events = [
    { at: i.reportedAt, title: 'ส่งเรื่องแจ้งเหตุ' },
    i.assignedAt && { at: i.assignedAt, title: `มอบหมายให้ ${i.officer}` },
    i.startedAt && { at: i.startedAt, title: 'เจ้าหน้าที่เริ่มดำเนินการ' },
    i.closedAt && { at: i.closedAt, title: 'ดำเนินการเสร็จสิ้น' },
  ].filter(Boolean).sort((a, b) => b.at - a.at);

  dialogs.detail.innerHTML = `
    <div class="dlg">
      <header class="sheet-head">
        <div>
          <p class="sheet-eyebrow">รายละเอียดการแจ้งเหตุ</p>
          <h2 id="detailTitle">${i.id}</h2>
        </div>
        <button type="button" class="icon-btn icon-btn--outline" data-action="close" aria-label="ปิด">${icon('x')}</button>
      </header>
      <div class="dlg-body">
        <div class="sheet-title">
          <div>
            <h3>${esc(i.title)}</h3>
            <p class="muted">${icon('map-pin', 'icon--xs')} ${esc(i.place)}</p>
          </div>
          ${statusBadge(i)}
        </div>

        ${trackerHtml(i)}

        <div class="info-grid" style="margin-top:26px">
          <div class="info-card"><span class="info-label">ประเภทเหตุ</span><strong class="info-value">${esc(CATEGORIES[i.cat].label)}</strong></div>
          <div class="info-card"><span class="info-label">แจ้งเมื่อ</span><strong class="info-value">${fmtFullDateTime(i.reportedAt)}</strong></div>
          <div class="info-card"><span class="info-label">ผู้รับผิดชอบ</span><strong class="info-value">${i.officer ? esc(i.officer) : '<span class="muted">ยังไม่มอบหมาย</span>'}</strong></div>
          ${i.closedAt ? `<div class="info-card"><span class="info-label">ปิดงานเมื่อ</span><strong class="info-value">${fmtFullDateTime(i.closedAt)}</strong></div>` : ''}
        </div>

        ${i.note ? `<section class="sheet-section"><h4>รายละเอียดที่แจ้ง</h4><p class="detail-box">${esc(i.note)}</p></section>` : ''}

        ${detailPhotoSections(i)}

        <section class="sheet-section">
          <h4>ความคืบหน้า</h4>
          <ol class="timeline">
            ${events.map((e) => `<li>${esc(e.title)}<time>${fmtDateTime(e.at)} น.</time></li>`).join('')}
          </ol>
        </section>
      </div>
      <footer class="dlg-foot">
        <button type="button" class="btn btn-ghost" data-action="close">ปิดหน้าต่าง</button>
      </footer>
    </div>`;
  dialogs.detail.showModal();
}

/* ---------- Refresh ---------- */

// ดึงข้อมูลล่าสุดจากเซิร์ฟเวอร์แล้ววาดหน้าใหม่
async function refresh() {
  await loadIncidents();
  render();
}

/* ---------- เริ่มทำงาน ----------
   โหลดค่าอ้างอิง + ผู้ใช้ + รายการของฉัน ให้ครบก่อนวาดหน้าครั้งแรก
   สคริปต์ของแต่ละหน้าเรียก boot() แทน refresh() ตอนเปิดหน้า */
async function boot() {
  try {
    await Promise.all([loadReference(), loadUser()]);
    renderShellUser(); // ชื่อในเมนูซ้ายถูกวาดตั้งแต่ยังไม่มีข้อมูล จึงต้องเติมอีกครั้งตรงนี้
    await loadIncidents();
    state.ready = true;
    if (typeof onReady === 'function') await onReady();
    render();
  } catch (error) {
    if (error.message !== 'unauthenticated') {
      toast(`โหลดข้อมูลไม่สำเร็จ: ${error.message}`, 'error');
    }
  }
}

/* ---------- Events ---------- */

document.addEventListener('click', (event) => {
  const el = event.target.closest('[data-action]');
  if (!el) return;

  const { action } = el.dataset;
  const incident = el.dataset.id ? findIncident(el.dataset.id) : null;

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
    case 'logout':
      logout();
      break;
    case 'reload':
      closeUserMenu();
      refresh().then(() => toast('โหลดข้อมูลล่าสุดแล้ว', 'success')).catch(() => {});
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
  if (form.id !== 'newForm') return;
  event.preventDefault();

  const data = Object.fromEntries(new FormData(form));
  const title = String(data.title).trim();

  const checks = [
    [$('nfTitleField'), $('nfTitleError'), $('nfTitle'), !title],
    [$('nfCatField'), $('nfCatError'), $('nfCat'), !data.cat],
    [$('nfZoneField'), $('nfZoneError'), $('nfZone'), !data.zone],
  ];
  let firstInvalid = null;
  checks.forEach(([field, errorEl, input, invalid]) => {
    field.classList.toggle('has-error', invalid);
    errorEl.hidden = !invalid;
    if (invalid && !firstInvalid) firstInvalid = input;
  });
  if (firstInvalid) {
    firstInvalid.focus();
    return;
  }

  const photos = pendingPhotos.map((p) => p.file);
  pendingPhotos.forEach((p) => URL.revokeObjectURL(p.url));
  dialogs.create.close();
  createIncident({
    title,
    cat: data.cat,
    pri: data.pri,
    zone: data.zone,
    detail: String(data.detail).trim(),
    note: String(data.note).trim(),
    photos,
  });
});

Object.values(dialogs).forEach((dlg) => {
  dlg.addEventListener('click', (event) => {
    if (event.target === dlg) dlg.close();
  });
});

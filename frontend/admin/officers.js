'use strict';

/* หน้าจัดการเจ้าหน้าที่ — ภาพรวมกำลังคน ภาระงาน และตารางเข้าเวร
   ข้อมูล และเมนูมาจาก shared.js (ต้องโหลดก่อนไฟล์นี้)
   ตัวกรองถูกเก็บไว้ใน URL (?status=ready&cat=electric ...) จึงแชร์ลิงก์หรือรีเฟรชแล้วยังอยู่ */

mountShell('officers');

// จัดสถานะ 5 แบบของ officerStatus() (จาก shared.js) เป็น 3 กลุ่มสำหรับการ์ดสรุปและตัวกรอง
// badge: คลาส badge สีที่มีอยู่แล้วในระบบ (ใช้ซ้ำจากป้ายสถานะเหตุ ให้โทนสีตรงกับความหมาย)
const STATUS_GROUPS = {
  ready: { label: 'พร้อมปฏิบัติงาน', tones: ['free'], icon: 'check', stat: 'blue' },
  working: { label: 'กำลังปฏิบัติงาน', tones: ['busy', 'full', 'late'], icon: 'hourglass', stat: 'blue' },
  off: { label: 'ไม่พร้อม / ลา', tones: ['off'], icon: 'user-x', stat: 'red' },
};
const BADGE_CLASS = { free: 'done', busy: 'progress', full: 'pending', late: 'overdue', off: 'normal' };
const groupOf = (tone) => Object.keys(STATUS_GROUPS).find((g) => STATUS_GROUPS[g].tones.includes(tone));

const DEFAULTS = { q: '', cat: '', zone: '', status: '' };
const view = { ...DEFAULTS };

const has = (obj, key) => typeof key === 'string' && Object.hasOwn(obj, key);

/* ---------- URL ---------- */

function readParams() {
  const p = new URLSearchParams(location.search);
  view.q = p.get('q') ?? '';
  view.cat = has(CATEGORIES, p.get('cat')) ? p.get('cat') : '';
  view.zone = ZONES.includes(p.get('zone')) ? p.get('zone') : '';
  view.status = has(STATUS_GROUPS, p.get('status')) ? p.get('status') : '';
}

function writeParams() {
  const p = new URLSearchParams();
  Object.keys(DEFAULTS).forEach((key) => {
    if (view[key] !== DEFAULTS[key]) p.set(key, view[key]);
  });
  const qs = p.toString();
  try {
    history.replaceState(null, '', location.pathname + (qs ? `?${qs}` : ''));
  } catch {
    // ปรับ URL ไม่ได้ (เช่น เปิดไฟล์ตรงๆ ในบางเบราว์เซอร์) — ไม่กระทบการทำงาน
  }
}

/* ---------- Data ---------- */

// officerStats() มาจาก shared.js: คำนวณภาระงานปัจจุบันของเจ้าหน้าที่ทุกคนจาก state.incidents
function allStats() {
  return officerStats().sort((a, b) => a.officer.name.localeCompare(b.officer.name, 'th'));
}

function officerMatchesQuery(o, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [o.name, o.phone, CATEGORIES[o.cat].label, CATEGORIES[o.cat].dept, o.zone].some((s) => s.toLowerCase().includes(q));
}

function filteredStats() {
  return allStats()
    .filter((s) => !view.cat || s.officer.cat === view.cat)
    .filter((s) => !view.zone || s.officer.zone === view.zone)
    .filter((s) => !view.status || groupOf(officerStatus(s).tone) === view.status)
    .filter((s) => officerMatchesQuery(s.officer, view.q));
}

/* ---------- Rendering: การ์ดสรุป ---------- */

function renderStats() {
  const stats = allStats();
  const total = stats.length;
  const catCount = new Set(stats.map((s) => s.officer.cat)).size;
  const counts = { ready: 0, working: 0, off: 0 };
  stats.forEach((s) => counts[groupOf(officerStatus(s).tone)]++);

  const cards = [
    { key: '', label: 'เจ้าหน้าที่ทั้งหมด', icon: 'users', tone: 'blue', value: total, sub: `${catCount} ประเภทงาน` },
    { key: 'ready', label: STATUS_GROUPS.ready.label, icon: STATUS_GROUPS.ready.icon, tone: 'green', value: counts.ready, sub: `${Math.round((counts.ready / total) * 100)}% ของทั้งหมด` },
    { key: 'working', label: STATUS_GROUPS.working.label, icon: STATUS_GROUPS.working.icon, tone: 'blue', value: counts.working, sub: `${Math.round((counts.working / total) * 100)}% ของทั้งหมด` },
    { key: 'off', label: STATUS_GROUPS.off.label, icon: STATUS_GROUPS.off.icon, tone: 'red', value: counts.off, sub: `${Math.round((counts.off / total) * 100)}% ของทั้งหมด` },
  ];

  $('staffStats').innerHTML = cards.map((c) => {
    const active = c.key !== '' && view.status === c.key; // การ์ด "ทั้งหมด" ไม่ถือเป็นตัวกรองที่ "เลือกอยู่"
    return `
      <button type="button" class="stat${active ? ' is-active' : ''}" data-action="status-filter" data-status="${c.key}" aria-pressed="${active}">
        <span class="stat-icon stat-icon--${c.tone}">${icon(c.icon)}</span>
        <span class="stat-body">
          <span class="stat-label">${c.label}</span>
          <span class="stat-value">${c.value} คน</span>
          <span class="stat-sub">${c.sub}</span>
        </span>
      </button>`;
  }).join('');
}

/* ---------- Rendering: ตัวกรอง ---------- */

function renderFilters() {
  const opt = (value, label, current) => `<option value="${esc(value)}"${current === value ? ' selected' : ''}>${esc(label)}</option>`;

  $('stCategory').innerHTML = opt('', 'ทุกประเภทงาน', view.cat) + Object.entries(CATEGORIES).map(([key, c]) => opt(key, c.label, view.cat)).join('');
  $('stZone').innerHTML = opt('', 'ทุกพื้นที่', view.zone) + ZONES.map((z) => opt(z, z, view.zone)).join('');
  $('stStatus').innerHTML = opt('', 'ทุกสถานะ', view.status) + Object.entries(STATUS_GROUPS).map(([key, g]) => opt(key, g.label, view.status)).join('');
}

/* ---------- Rendering: ตาราง ---------- */

function staffRowHtml(s) {
  const { officer: o } = s;
  const st = officerStatus(s);
  const phoneDigits = o.phone.replace(/\D/g, '');

  return `
    <tr tabindex="0" data-action="view-officer" data-id="${o.id}">
      <td>
        <div class="cell-owner">
          ${officerAvatar(o, 'md')}
          <div class="load-who">
            <strong>${esc(o.name)}</strong>
            <a class="load-sub" href="tel:${phoneDigits}" data-action="stop">${maskPhone(o.phone)}</a>
          </div>
        </div>
      </td>
      <td><span class="cat"><span class="cat-dot" style="--c:${CATEGORIES[o.cat].color}"></span>${esc(CATEGORIES[o.cat].dept)}</span></td>
      <td>${icon('map-pin', 'icon--xs')} ${esc(o.zone)}</td>
      <td class="cell-time">${o.shiftStart} – ${o.shiftEnd} น.</td>
      <td>
        <div class="load-cell">
          <span>${s.active}/${o.capacity} งาน</span>
          <div class="bar bar--thin bar--${loadTone(s.pct)}"><span style="width:${Math.min(100, s.pct * 100)}%"></span></div>
        </div>
      </td>
      <td><span class="badge badge--${BADGE_CLASS[st.tone]}">${st.text}</span></td>
    </tr>`;
}

function renderTable() {
  const rows = filteredStats();
  const active = Object.keys(DEFAULTS).some((k) => view[k] !== DEFAULTS[k]);

  $('staffBody').innerHTML = rows.length
    ? rows.map(staffRowHtml).join('')
    : `<tr><td colspan="6"><div class="empty">${icon('inbox')}<span>ไม่พบเจ้าหน้าที่ที่ตรงกับเงื่อนไข</span>${active ? '<button type="button" class="btn btn-ghost btn-sm" data-action="clear-filters">ล้างตัวกรอง</button>' : ''}</div></td></tr>`;

  $('staffMeta').innerHTML = `พบ <b>${rows.length}</b> คน${active ? ' · <button type="button" class="link-btn" data-action="clear-filters">ล้างตัวกรอง</button>' : ''}`;

  writeParams();
}

function render() {
  renderStats();
  renderFilters();
  renderTable();
  renderShellCounts();
}

/* ---------- Events ---------- */

function clearFilters() {
  Object.assign(view, DEFAULTS);
  $('stSearch').value = '';
  render();
}

function handlePageAction(action, el) {
  if (action === 'status-filter') {
    view.status = view.status === el.dataset.status && el.dataset.status !== '' ? '' : el.dataset.status;
    render();
  }
  if (action === 'view-officer') location.href = `incidents.html?owner=${el.dataset.id}`;
  if (action === 'clear-filters') clearFilters();
}

const FIELDS = { stCategory: 'cat', stZone: 'zone', stStatus: 'status' };

document.addEventListener('change', (event) => {
  if (!has(FIELDS, event.target.id)) return;
  view[FIELDS[event.target.id]] = event.target.value;
  render();
});

$('stSearch').addEventListener('input', (event) => {
  view.q = event.target.value;
  render();
});

/* ---------- Init ---------- */

function onReady() {
  readParams();
  $('stSearch').value = view.q;
}

boot();
startTicker(); // ภาระงาน/สถานะผูกกับ state.incidents — วาดใหม่เมื่อมีเหตุเพิ่งเกิน SLA แม้ไม่ได้ทำอะไรในหน้านี้

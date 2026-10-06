'use strict';

/* หน้ารายการแจ้งเหตุ (Incident Queue) — ค้นหา กรอง เรียงลำดับ และติดตามสถานะเหตุทั้งหมด
   ข้อมูล หน้าต่างรายละเอียด/มอบหมาย และเมนูมาจาก shared.js (ต้องโหลดก่อนไฟล์นี้)
   ตัวกรองทั้งหมดถูกเก็บไว้ใน URL (?status=pending&pri=emergency ...) จึงแชร์ลิงก์หรือรีเฟรชแล้วยังอยู่ */

mountShell('incidents');

const PAGE_SIZES = [10, 20, 50];
const PRIORITY_RANK = { emergency: 0, urgent: 1, normal: 2 };

// เรียงเหตุที่ยังไม่ปิดตามเวลาครบกำหนดแก้ไข (SLA) ส่วนเหตุที่ปิดแล้วไว้ท้ายสุด
const slaKey = (i) => (isActive(i) ? resolveDeadline(i) : Number.MAX_SAFE_INTEGER);

const SORTS = {
  newest: { label: 'ใหม่ล่าสุด', fn: (a, b) => b.reportedAt - a.reportedAt },
  oldest: { label: 'เก่าที่สุด', fn: (a, b) => a.reportedAt - b.reportedAt },
  // เหตุที่ยังไม่ปิดขึ้นก่อน จากนั้นเรียงตามระดับ และเหตุที่รอมานานกว่าขึ้นก่อน
  priority: { label: 'ความเร่งด่วนสูงสุด', fn: (a, b) => Number(isActive(b)) - Number(isActive(a)) || PRIORITY_RANK[a.pri] - PRIORITY_RANK[b.pri] || a.reportedAt - b.reportedAt },
  sla: { label: 'ใกล้ครบกำหนด SLA ที่สุด', fn: (a, b) => slaKey(a) - slaKey(b) || a.reportedAt - b.reportedAt },
};

// [ค่าตัวกรอง, ชื่อที่แสดง] — ค่าตัวกรองตรงกับ FILTERS ใน shared.js (กำลังดำเนินการ รวมรอตรวจผล)
const STATUS_OPTIONS = [
  ['pending', 'รอมอบหมาย'],
  ['progress', 'กำลังดำเนินการ'],
  ['review', 'รอตรวจผล'],
  ['done', 'ดำเนินการเสร็จสิ้น'],
  ['overdue', 'เกิน SLA'],
];

const DEFAULTS = { q: '', pri: '', status: '', cat: '', owner: '', sort: 'newest', size: PAGE_SIZES[0], page: 1 };
const view = { ...DEFAULTS };

const has = (obj, key) => typeof key === 'string' && Object.hasOwn(obj, key);
const filtersActive = () => ['q', 'pri', 'status', 'cat', 'owner'].some((k) => view[k] !== DEFAULTS[k]);

/* ---------- URL ---------- */

function readParams() {
  const p = new URLSearchParams(location.search);
  const get = (key) => p.get(key);

  view.q = get('q') ?? '';
  view.pri = has(PRIORITIES, get('pri')) ? get('pri') : '';
  view.status = has(FILTERS, get('status')) && get('status') !== 'all' ? get('status') : '';
  view.cat = has(CATEGORIES, get('cat')) ? get('cat') : '';
  view.owner = get('owner') === 'none' || findOfficer(get('owner')) ? get('owner') : '';
  view.sort = has(SORTS, get('sort')) ? get('sort') : DEFAULTS.sort;
  view.size = PAGE_SIZES.includes(Number(get('size'))) ? Number(get('size')) : DEFAULTS.size;
  view.page = Math.max(1, parseInt(get('page'), 10) || 1);
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

function applyFilters() {
  return state.incidents
    .filter((i) => !view.pri || i.pri === view.pri)
    .filter((i) => !view.status || FILTERS[view.status](i))
    .filter((i) => !view.cat || i.cat === view.cat)
    .filter((i) => !view.owner || (view.owner === 'none' ? !i.assignee : i.assignee === view.owner))
    .filter((i) => matchesQuery(i, view.q))
    .sort(SORTS[view.sort].fn);
}

/* ---------- Rendering ---------- */

function renderFilters() {
  const c = counts();
  const opt = (value, label, current) => `<option value="${esc(value)}"${current === value ? ' selected' : ''}>${esc(label)}</option>`;

  $('fPriority').innerHTML = opt('', 'ระดับความเร่งด่วน: ทั้งหมด', view.pri)
    + Object.entries(PRIORITIES).map(([key, p]) => opt(key, p.label, view.pri)).join('');
  $('fStatus').innerHTML = opt('', 'สถานะ: ทั้งหมด', view.status)
    + STATUS_OPTIONS.map(([key, label]) => opt(key, `${label} (${c[key]})`, view.status)).join('');
  $('fCategory').innerHTML = opt('', 'ประเภทเหตุ: ทั้งหมด', view.cat)
    + Object.entries(CATEGORIES).map(([key, cat]) => opt(key, cat.label, view.cat)).join('');
  $('fOwner').innerHTML = opt('', 'ผู้รับผิดชอบ: ทั้งหมด', view.owner)
    + opt('none', 'ยังไม่มอบหมาย', view.owner)
    + OFFICERS.map((o) => opt(o.id, o.name, view.owner)).join('');
  $('fSort').innerHTML = Object.entries(SORTS).map(([key, s]) => opt(key, `เรียงตาม: ${s.label}`, view.sort)).join('');
}

// คอลัมน์ "กำหนดเวลา": รอมอบหมาย = เวลาที่ต้องมอบหมาย / กำลังทำ = เวลาที่ต้องแก้ไขเสร็จ (SLA) / ปิดแล้ว = เวลาที่ใช้
function slaCell(i) {
  if (i.status === 'done') {
    return `<div class="sla"><small>ปิดงานแล้ว</small><b class="is-ok">ใช้เวลา ${fmtHuman((i.closedAt - i.reportedAt) / 1000)}</b></div>`;
  }
  if (i.status === 'pending') {
    return `<div class="sla"><small>ต้องมอบหมาย</small><b data-tick="remain" data-ts="${assignDeadline(i)}"></b></div>`;
  }
  const late = isOverdue(i);
  return `<div class="sla"><small>ต้องแก้ไขเสร็จ</small><b${late ? ' class="is-late"' : ''} data-tick="${late ? 'over' : 'remain'}" data-ts="${resolveDeadline(i)}"></b></div>`;
}

function listRowHtml(i) {
  const overdue = isOverdue(i);
  const cat = CATEGORIES[i.cat];
  return `
    <tr tabindex="0" data-action="detail" data-id="${i.id}"${overdue ? ' class="is-overdue"' : ''}>
      <td class="cell-id">#${numOf(i)}</td>
      <td>
        <div class="cell-title">${esc(i.title)}</div>
        <div class="cell-sub">${icon('map-pin', 'icon--xs')}<span>${esc(i.place)}</span></div>
      </td>
      <td><span class="cat"><span class="cat-dot" style="--c:${cat.color}"></span>${esc(cat.label)}</span></td>
      <td>${priorityBadge(i.pri)}</td>
      <td>${statusBadge(i)}${overdue ? '<span class="sla-flag">เกิน SLA</span>' : ''}</td>
      <td>${ownerCell(i)}</td>
      <td class="cell-time"><span data-tick="ago" data-ts="${i.reportedAt}"></span><small>${fmtDateTime(i.reportedAt)} น.</small></td>
      <td>${slaCell(i)}</td>
    </tr>`;
}

// เลขหน้าแบบย่อ: 1 … 4 5 6 … 12
function pageNumbers(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, k) => k + 1);
  const nums = [...new Set([1, total, current - 1, current, current + 1])].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  return nums.flatMap((n, k) => (k && n - nums[k - 1] > 1 ? ['…', n] : [n]));
}

function pagerHtml(total, pages, start, shown) {
  const pageBtn = (n) => `<button type="button" class="page-btn${n === view.page ? ' is-active' : ''}" data-action="page-go" data-page="${n}" aria-label="หน้า ${n}"${n === view.page ? ' aria-current="page"' : ''}>${n}</button>`;
  return `
    <div class="pager-left">
      <span class="muted small">แสดง ${start + 1}–${start + shown} จาก ${total} รายการ</span>
      <label class="page-size small muted">ต่อหน้า
        <select class="select select--sm" id="fSize" aria-label="จำนวนรายการต่อหน้า">
          ${PAGE_SIZES.map((n) => `<option value="${n}"${n === view.size ? ' selected' : ''}>${n}</option>`).join('')}
        </select>
      </label>
    </div>
    ${pages > 1 ? `
      <div class="pager">
        <button type="button" class="icon-btn icon-btn--sm" data-action="page-go" data-page="${view.page - 1}" aria-label="หน้าก่อนหน้า"${view.page === 1 ? ' disabled' : ''}>${icon('chevron-left')}</button>
        ${pageNumbers(view.page, pages).map((n) => (n === '…' ? '<span class="page-gap" aria-hidden="true">…</span>' : pageBtn(n))).join('')}
        <button type="button" class="icon-btn icon-btn--sm" data-action="page-go" data-page="${view.page + 1}" aria-label="หน้าถัดไป"${view.page === pages ? ' disabled' : ''}>${icon('chevron-right')}</button>
      </div>` : ''}`;
}

function renderTable() {
  const rows = applyFilters();
  const pages = Math.max(1, Math.ceil(rows.length / view.size));
  view.page = Math.min(Math.max(view.page, 1), pages);
  const start = (view.page - 1) * view.size;
  const slice = rows.slice(start, start + view.size);
  const active = filtersActive();

  $('listBody').innerHTML = slice.length
    ? slice.map(listRowHtml).join('')
    : `<tr><td colspan="8"><div class="empty">${icon('inbox')}<span>ไม่พบรายการที่ตรงกับตัวกรอง</span>${active ? '<button type="button" class="btn btn-ghost btn-sm" data-action="clear-filters">ล้างตัวกรอง</button>' : ''}</div></td></tr>`;

  $('listMeta').innerHTML = `พบ <b>${rows.length}</b> รายการ${active ? ' · <button type="button" class="link-btn" data-action="clear-filters">ล้างตัวกรอง</button>' : ''}`;
  $('exportBtn').disabled = rows.length === 0;
  $('pager').innerHTML = rows.length ? pagerHtml(rows.length, pages, start, slice.length) : '';

  writeParams();
}

function render() {
  renderFilters();
  renderTable();
  renderShellCounts();
}

/* ---------- Actions ---------- */

function setQuery(value, source) {
  view.q = value;
  view.page = 1;
  // ช่องค้นหาสองช่อง (ด้านบนและในหน้า) ให้แสดงคำเดียวกัน
  [$('listSearch'), $('searchInput')].forEach((input) => {
    if (input !== source) input.value = value;
  });
  renderTable();
  updateTimers();
}

function clearFilters() {
  Object.assign(view, { q: '', pri: '', status: '', cat: '', owner: '', page: 1 });
  $('listSearch').value = '';
  $('searchInput').value = '';
  renderFilters();
  renderTable();
  updateTimers();
}

// shared.js เรียกหลังรับแจ้งเหตุใหม่ เพื่อให้เห็นรายการที่เพิ่งสร้างที่บนสุด
function resetView() {
  Object.assign(view, { sort: 'newest', page: 1 });
  clearFilters();
}

function handlePageAction(action, el) {
  if (action === 'clear-filters') clearFilters();

  if (action === 'page-go') {
    view.page = Number(el.dataset.page);
    renderTable();
    updateTimers();
    $('listBody').closest('.card').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }
}

// ส่งออกรายการที่กรองอยู่ทั้งหมด (ไม่ใช่แค่หน้านี้) เป็นไฟล์ CSV ที่เปิดใน Excel ได้ (UTF-8 + BOM)
function exportCsv() {
  const rows = applyFilters();
  // กันสูตรแฝงใน Excel: ข้อความที่ขึ้นต้นด้วย = + - @ จะถูกใส่ ' นำหน้า
  const cell = (value) => {
    const text = String(value ?? '');
    return `"${(/^[=+\-@\t\r]/.test(text) ? `'${text}` : text).replace(/"/g, '""')}"`;
  };

  const header = ['เลขที่', 'รายการเหตุ', 'สถานที่', 'ประเภท', 'ระดับ', 'สถานะ', 'ผู้รับผิดชอบ', 'ผู้แจ้งเหตุ', 'เวลาที่แจ้ง', 'กำหนดแก้ไข (SLA)', 'เกิน SLA'];
  const lines = [header, ...rows.map((i) => [
    i.id, i.title, i.place, CATEGORIES[i.cat].label, PRIORITIES[i.pri].label, STATUSES[i.status],
    findOfficer(i.assignee)?.name ?? '', i.reporter ?? '',
    fmtFullDateTime(i.reportedAt), fmtFullDateTime(resolveDeadline(i)), isOverdue(i) ? 'ใช่' : '',
  ])].map((row) => row.map(cell).join(','));

  const blob = new Blob([`﻿${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `incidents-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  toast(`ส่งออก ${rows.length} รายการแล้ว`, 'success');
}

/* ---------- Events ---------- */

const FILTER_FIELDS = { fPriority: 'pri', fStatus: 'status', fCategory: 'cat', fOwner: 'owner', fSort: 'sort' };

document.addEventListener('change', (event) => {
  const { id, value } = event.target;

  if (has(FILTER_FIELDS, id)) {
    view[FILTER_FIELDS[id]] = value;
    view.page = 1;
  } else if (id === 'fSize') {
    view.size = Number(value);
    view.page = 1;
  } else {
    return;
  }
  renderTable();
  updateTimers();
});

$('listSearch').addEventListener('input', (event) => setQuery(event.target.value, event.target));
$('searchInput').addEventListener('input', (event) => setQuery(event.target.value, event.target));
$('exportBtn').addEventListener('click', exportCsv);

/* ---------- Init ---------- */

// อ่านตัวกรองจาก URL หลังค่าอ้างอิงโหลดเสร็จ (boot เรียกให้อัตโนมัติ)
function onReady() {
  readParams();
  $('listSearch').value = view.q;
  $('searchInput').value = view.q;
}

boot();
startTicker();

'use strict';

/* หน้าประวัติการแจ้งเหตุ — ค้นหา กรอง เรียงลำดับ และดูรายละเอียดทุกเหตุที่เคยแจ้ง
   ข้อมูล ฟอร์มแจ้งเหตุ และเมนูมาจาก shared.js (ต้องโหลดก่อนไฟล์นี้)
   ตัวกรองถูกเก็บไว้ใน URL (?status=pending&cat=electric ...) จึงแชร์ลิงก์หรือรีเฟรชแล้วยังอยู่ */

mountShell('history');

const PAGE_SIZES = [10, 20, 50];

const SORTS = {
  newest: { label: 'ใหม่ล่าสุด', fn: (a, b) => b.reportedAt - a.reportedAt },
  oldest: { label: 'เก่าที่สุด', fn: (a, b) => a.reportedAt - b.reportedAt },
};

const has = (obj, key) => typeof key === 'string' && Object.hasOwn(obj, key);

const DEFAULTS = { q: '', cat: '', status: '', sort: 'newest', size: PAGE_SIZES[0], page: 1 };
const view = { ...DEFAULTS };

/* ---------- URL ---------- */

function readParams() {
  const p = new URLSearchParams(location.search);
  view.q = p.get('q') ?? '';
  view.cat = has(CATEGORIES, p.get('cat')) ? p.get('cat') : '';
  view.status = has(STATUSES, p.get('status')) ? p.get('status') : '';
  view.sort = has(SORTS, p.get('sort')) ? p.get('sort') : DEFAULTS.sort;
  view.size = PAGE_SIZES.includes(Number(p.get('size'))) ? Number(p.get('size')) : DEFAULTS.size;
  view.page = Math.max(1, parseInt(p.get('page'), 10) || 1);
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
    .filter((i) => !view.cat || i.cat === view.cat)
    .filter((i) => !view.status || i.status === view.status)
    .filter((i) => matchesQuery(i, view.q))
    .sort(SORTS[view.sort].fn);
}

/* ---------- Rendering ---------- */

function renderFilters() {
  const opt = (value, label, current) => `<option value="${esc(value)}"${current === value ? ' selected' : ''}>${esc(label)}</option>`;

  $('hCategory').innerHTML = opt('', 'ประเภทเหตุ: ทั้งหมด', view.cat) + Object.entries(CATEGORIES).map(([k, c]) => opt(k, c.label, view.cat)).join('');
  $('hStatus').innerHTML = opt('', 'สถานะ: ทั้งหมด', view.status) + Object.entries(STATUSES).map(([k, label]) => opt(k, label, view.status)).join('');
  $('hSort').innerHTML = Object.entries(SORTS).map(([k, s]) => opt(k, `เรียงตาม: ${s.label}`, view.sort)).join('');
}

function listRowHtml(i) {
  const cat = CATEGORIES[i.cat];
  return `
    <tr tabindex="0" data-action="detail" data-id="${i.id}">
      <td class="cell-id">#${numOf(i)}</td>
      <td>
        <div class="cell-title">${esc(i.title)}</div>
        <div class="cell-sub">${icon('map-pin', 'icon--xs')}<span>${esc(i.place)}</span></div>
      </td>
      <td><span class="cat"><span class="cat-dot" style="--c:${cat.color}"></span>${esc(cat.label)}</span></td>
      <td>${priorityBadge(i.pri)}</td>
      <td>${statusBadge(i)}</td>
      <td>${i.officer ? esc(i.officer) : '<span class="muted">ยังไม่มอบหมาย</span>'}</td>
      <td class="cell-time">${fmtAgo((Date.now() - i.reportedAt) / 1000)}<small>${fmtDateTime(i.reportedAt)} น.</small></td>
    </tr>`;
}

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
        <select class="select select--sm" id="hSize" aria-label="จำนวนรายการต่อหน้า">
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
  const active = Object.keys(DEFAULTS).some((k) => !['sort', 'size', 'page'].includes(k) && view[k] !== DEFAULTS[k]);

  $('listBody').innerHTML = slice.length
    ? slice.map(listRowHtml).join('')
    : `<tr><td colspan="7"><div class="empty">${icon('inbox')}<span>ไม่พบรายการที่ตรงกับเงื่อนไข</span>${active ? '<button type="button" class="btn btn-ghost btn-sm" data-action="clear-filters">ล้างตัวกรอง</button>' : ''}</div></td></tr>`;

  $('listMeta').innerHTML = `พบ <b>${rows.length}</b> รายการ${active ? ' · <button type="button" class="link-btn" data-action="clear-filters">ล้างตัวกรอง</button>' : ''}`;
  $('pager').innerHTML = rows.length ? pagerHtml(rows.length, pages, start, slice.length) : '';

  writeParams();
}

function render() {
  renderFilters();
  renderTable();
  renderShellCounts();
}

/* ---------- Events ---------- */

function clearFilters() {
  Object.assign(view, DEFAULTS);
  $('hSearch').value = '';
  $('searchInput').value = '';
  render();
}

// หลังแจ้งเหตุใหม่ ล้างตัวกรองเพื่อให้เห็นรายการที่เพิ่งสร้างที่บนสุด (shared.js เรียกให้ก่อน refresh())
function resetView() {
  Object.assign(view, DEFAULTS);
  $('hSearch').value = '';
  $('searchInput').value = '';
}

// เรียกจากทั้งช่องค้นหาในหน้านี้และช่องค้นหาบนแถบบน (mountShell ใน shared.js) — ซิงก์ค่าให้ตรงกันเสมอ
function handleSearch(value) {
  view.q = value;
  $('hSearch').value = value;
  $('searchInput').value = value;
  view.page = 1;
  renderTable();
}

function handlePageAction(action, el) {
  if (action === 'clear-filters') clearFilters();
  if (action === 'page-go') {
    view.page = Number(el.dataset.page);
    renderTable();
    $('listBody').closest('.card').scrollIntoView({ block: 'start' });
  }
}

const FIELDS = { hCategory: 'cat', hStatus: 'status', hSort: 'sort' };

document.addEventListener('change', (event) => {
  const { id, value } = event.target;
  if (has(FIELDS, id)) {
    view[FIELDS[id]] = value;
    view.page = 1;
  } else if (id === 'hSize') {
    view.size = Number(value);
    view.page = 1;
  } else {
    return;
  }
  renderTable();
});

$('hSearch').addEventListener('input', (event) => handleSearch(event.target.value));

/* ---------- Init ---------- */

// อ่านตัวกรองจาก URL หลังค่าอ้างอิงโหลดเสร็จ (boot เรียกให้อัตโนมัติ)
function onReady() {
  readParams();
  $('hSearch').value = view.q;
  $('searchInput').value = view.q;
}

boot();

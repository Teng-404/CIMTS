'use strict';

/* แดชบอร์ดผู้ดูแล — หน้าหลัก
   ข้อมูล หน้าต่างรายละเอียด/มอบหมาย และเมนูมาจาก shared.js (ต้องโหลดก่อนไฟล์นี้) */

mountShell('home');

const PAGE = {
  size: 6,             // จำนวนแถวต่อหน้าในตาราง "รายการแจ้งเหตุล่าสุด"
  actionLimit: 3,      // จำนวนงานที่แสดงในกล่อง "ต้องดำเนินการ" ก่อนกด "ดูเพิ่มเติม"
  workloadPreview: 6,  // จำนวนเจ้าหน้าที่ที่แสดงในการ์ด "ภาระงานเจ้าหน้าที่" ก่อนลิงก์ไปหน้าเจ้าหน้าที่ทั้งหมด
};

// จำนวนเหตุ 6 วันก่อนหน้า (ข้อมูลตัวอย่าง) — ของวันนี้นับจากรายการจริงในระบบ
const TREND_HISTORY = [11, 14, 9, 16, 13, 8];

// สถานะการแสดงผลของหน้านี้ (ไม่เกี่ยวกับข้อมูลเหตุ)
const view = { filter: 'all', query: '', page: 1, showAllActions: false };

function filteredIncidents() {
  return state.incidents
    .filter(FILTERS[view.filter])
    .filter((i) => matchesQuery(i, view.query))
    .sort((a, b) => b.reportedAt - a.reportedAt);
}

/* ---------- Rendering ---------- */

function renderGreeting() {
  const { firstName, lastName } = CONFIG.user;
  $('greeting').textContent = `สวัสดีคุณ${firstName} ${lastName}`;
  $('today').textContent = new Date().toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function renderStats() {
  const c = counts();
  const cards = [
    { key: 'pending', label: 'เหตุใหม่รอตรวจสอบ', icon: 'clipboard', tone: 'blue' },
    { key: 'progress', label: 'กำลังดำเนินการ', icon: 'hourglass', tone: 'blue' },
    { key: 'overdue', label: 'งานเกิน SLA', icon: 'flame', tone: 'red' },
    { key: 'done', label: 'ดำเนินการเสร็จสิ้น', icon: 'check', tone: 'green' },
  ];
  $('stats').innerHTML = cards.map((s) => `
    <button type="button" class="stat${view.filter === s.key ? ' is-active' : ''}" data-action="filter" data-filter="${s.key}" aria-pressed="${view.filter === s.key}">
      <span class="stat-icon stat-icon--${s.tone}">${icon(s.icon)}</span>
      <span class="stat-body"><span class="stat-label">${s.label}</span><span class="stat-value">${c[s.key]}</span></span>
    </button>`).join('');
}

function renderEmergency() {
  const box = $('emergency');
  const list = state.incidents
    .filter((i) => i.pri === 'emergency' && i.status === 'pending')
    .sort((a, b) => a.reportedAt - b.reportedAt);

  if (!list.length) {
    box.hidden = true;
    box.innerHTML = '';
    return;
  }

  const i = list[0];
  box.hidden = false;
  box.innerHTML = `
    <span class="emergency-icon">${icon('alert')}</span>
    <div class="emergency-text">
      <strong>เหตุฉุกเฉินรอมอบหมาย · <span class="nowrap">${i.id}</span>${list.length > 1 ? `<span class="emergency-more">อีก ${list.length - 1} รายการ</span>` : ''}</strong>
      <span>${esc(i.title)} — ${esc(i.place)}</span>
    </div>
    <div class="emergency-timer"><span>เวลาที่ผ่านมา</span><b data-tick="elapsed" data-ts="${i.reportedAt}"></b></div>
    <button type="button" class="btn btn-danger-outline" data-action="detail" data-id="${i.id}">ตรวจสอบทันที</button>`;
}

function rowHtml(i) {
  const overdue = isOverdue(i);
  return `
    <tr tabindex="0" data-action="detail" data-id="${i.id}"${overdue ? ' class="is-overdue"' : ''}>
      <td class="cell-id">#${numOf(i)}</td>
      <td>
        <div class="cell-title">${esc(i.title)}</div>
        <div class="cell-sub">${icon('map-pin', 'icon--xs')}<span>${esc(i.place)}</span><span aria-hidden="true">·</span><span class="nowrap" data-tick="ago" data-ts="${i.reportedAt}"></span></div>
      </td>
      <td>${priorityBadge(i.pri)}</td>
      <td>${statusBadge(i)}${overdue ? '<span class="sla-flag">เกิน SLA</span>' : ''}</td>
      <td>${ownerCell(i)}</td>
    </tr>`;
}

function renderIncidents() {
  const c = counts();
  $('tabs').innerHTML = TABS.map((t) => `
    <button type="button" class="tab${view.filter === t.key ? ' is-active' : ''}" data-action="filter" data-filter="${t.key}" aria-pressed="${view.filter === t.key}">
      ${t.label}<span class="tab-count">${c[t.key]}</span>
    </button>`).join('');

  const rows = filteredIncidents();
  const pages = Math.max(1, Math.ceil(rows.length / PAGE.size));
  view.page = Math.min(Math.max(view.page, 1), pages);
  const start = (view.page - 1) * PAGE.size;
  const slice = rows.slice(start, start + PAGE.size);

  $('incidentsBody').innerHTML = slice.length
    ? slice.map(rowHtml).join('')
    : `<tr><td colspan="5"><div class="empty">${icon('inbox')}<span>${view.query ? `ไม่พบรายการที่ตรงกับ “${esc(view.query.trim())}”` : 'ไม่มีรายการในสถานะนี้'}</span></div></td></tr>`;

  $('incidentsMeta').textContent = view.query.trim() ? `ผลการค้นหา ${rows.length} รายการ` : '';
  $('viewAllLink').href = view.filter === 'all' ? 'incidents.html' : `incidents.html?status=${view.filter}`;

  $('pager').innerHTML = rows.length
    ? `<span class="muted small">แสดง ${start + 1}–${start + slice.length} จาก ${rows.length} รายการ</span>
       <div class="pager">
         <button type="button" class="icon-btn icon-btn--sm" data-action="page" data-dir="-1" aria-label="หน้าก่อนหน้า"${view.page === 1 ? ' disabled' : ''}>${icon('chevron-left')}</button>
         <span class="small">หน้า ${view.page} / ${pages}</span>
         <button type="button" class="icon-btn icon-btn--sm" data-action="page" data-dir="1" aria-label="หน้าถัดไป"${view.page === pages ? ' disabled' : ''}>${icon('chevron-right')}</button>
       </div>`
    : '';
}

function actionHtml(a) {
  const { i } = a;
  const id = `data-id="${i.id}"`;

  if (a.kind === 'assign') {
    const rec = a.rec;
    const hint = rec
      ? `ระบบแนะนำ “${esc(rec.officer.name)}” · ${rec.sameZone ? 'อยู่ในพื้นที่' : esc(CATEGORIES[rec.officer.cat].dept)}`
      : `${esc(CATEGORIES[i.cat].dept)}ไม่มีผู้ว่าง — เลือกผู้รับผิดชอบด้วยตนเอง`;
    return `
      <article class="action${i.pri === 'emergency' ? ' action--emergency' : ''}">
        <div class="action-top">${priorityBadge(i.pri)}<span class="action-time" data-tick="remain" data-ts="${assignDeadline(i)}"></span></div>
        <h3 class="action-title">มอบหมายงาน ${i.id}</h3>
        <p class="action-desc">${esc(i.title)} · ${esc(i.place)}<br>${hint}</p>
        <div class="action-btns">
          ${rec
            ? `<button type="button" class="btn btn-sm btn-primary" data-action="quick-assign" ${id}>ยืนยันมอบหมาย</button>`
            : `<button type="button" class="btn btn-sm btn-primary" data-action="assign" ${id}>เลือกผู้รับผิดชอบ</button>`}
          <button type="button" class="btn btn-sm btn-ghost" data-action="detail" ${id}>ดูรายละเอียด</button>
        </div>
      </article>`;
  }

  if (a.kind === 'overdue') {
    const officer = findOfficer(i.assignee);
    return `
      <article class="action">
        <div class="action-top"><span class="badge badge--overdue">เกิน SLA</span><span class="action-time" data-tick="over" data-ts="${resolveDeadline(i)}"></span></div>
        <h3 class="action-title">ติดตามการรับทราบ ${i.id}</h3>
        <p class="action-desc">${esc(i.title)}<br>ส่งแจ้งเตือนแล้ว ${i.reminders} ครั้ง · รอ ${esc(officer.name)} อัปเดตสถานะ</p>
        <div class="action-btns">
          <button type="button" class="btn btn-sm btn-primary" data-action="remind" ${id}>แจ้งเตือนซ้ำ</button>
          <button type="button" class="btn btn-sm btn-ghost" data-action="assign" ${id}>เปลี่ยนผู้รับผิดชอบ</button>
        </div>
      </article>`;
  }

  return `
    <article class="action">
      <div class="action-top"><span class="badge badge--review">รอตรวจผล</span><span class="action-time is-muted" data-tick="ago" data-ts="${i.updatedAt}"></span></div>
      <h3 class="action-title">ตรวจผลการแก้ไข ${i.id}</h3>
      <p class="action-desc">${esc(i.title)}<br>${i.afterPhotos ? `เจ้าหน้าที่แนบรูปหลังดำเนินการแล้ว ${i.afterPhotos} รูป` : 'เจ้าหน้าที่บันทึกผลแล้ว (ไม่ได้แนบรูป)'}</p>
      <div class="action-btns">
        <button type="button" class="btn btn-sm btn-ghost" data-action="close-job" ${id}>ตรวจสอบและปิดงาน</button>
        <button type="button" class="btn btn-sm btn-ghost" data-action="detail" ${id}>ดูรายละเอียด</button>
      </div>
    </article>`;
}

function renderActions() {
  const all = buildActions();
  const shown = view.showAllActions ? all : all.slice(0, PAGE.actionLimit);

  $('actionsCount').textContent = all.length ? `${all.length} งาน` : '';
  $('actionsBody').innerHTML = all.length
    ? shown.map(actionHtml).join('') + (all.length > PAGE.actionLimit
      ? `<button type="button" class="action-more" data-action="more-actions">${view.showAllActions ? 'แสดงน้อยลง' : `ดูเพิ่มเติม (อีก ${all.length - PAGE.actionLimit})`}</button>`
      : '')
    : `<div class="empty">${icon('check')}<span>ไม่มีงานที่ต้องดำเนินการ</span></div>`;

  const bell = $('bellBadge');
  bell.textContent = all.length;
  bell.hidden = all.length === 0;
}

function renderWorkload() {
  const stats = officerStats().sort((a, b) => b.pct - a.pct || a.officer.name.localeCompare(b.officer.name, 'th'));
  const shown = stats.slice(0, PAGE.workloadPreview);
  $('workloadMeta').innerHTML = stats.length > shown.length ? `<a class="link-arrow" href="officers.html">ดูทั้งหมด (${stats.length} คน)${icon('arrow-right', 'icon--xs')}</a>` : `${stats.length} คน`;
  $('workloadBody').innerHTML = shown.map((s) => {
    const st = officerStatus(s);
    const { officer } = s;
    return `
      <div class="load-row">
        <div class="load-head">
          ${officerAvatar(officer, 'sm')}
          <div class="load-who">
            <strong>${esc(officer.name)}</strong>
            <span class="load-sub">${esc(CATEGORIES[officer.cat].dept)} · <span class="tone tone--${st.tone}">${st.text}</span></span>
          </div>
          <span class="load-count">${s.active} / ${officer.capacity} งาน</span>
        </div>
        <div class="bar bar--${loadTone(s.pct)}" role="progressbar" aria-label="ภาระงานของ ${esc(officer.name)}" aria-valuemin="0" aria-valuemax="${officer.capacity}" aria-valuenow="${s.active}">
          <span style="width:${Math.min(100, s.pct * 100)}%"></span>
        </div>
      </div>`;
  }).join('');
}

function renderTrend() {
  const startOfToday = new Date().setHours(0, 0, 0, 0);
  const today = state.incidents.filter((i) => i.reportedAt >= startOfToday).length;
  const values = [...TREND_HISTORY, today];
  const labels = values.map((_, k) => new Date(Date.now() - (values.length - 1 - k) * DAY * 1000).toLocaleDateString('th-TH', { weekday: 'short' }));
  $('trendBody').innerHTML = barChartSvg(values, labels, { highlightLast: true, summaryPrefix: 'จำนวนเหตุที่แจ้งใน 7 วันล่าสุด: ' });
}

function renderCategories() {
  const rows = Object.entries(CATEGORIES)
    .map(([key, c]) => ({ ...c, n: state.incidents.filter((i) => i.cat === key).length }))
    .filter((r) => r.n > 0)
    .sort((a, b) => b.n - a.n);
  $('categoryBody').innerHTML = donutHtml(rows, { ariaPrefix: 'สัดส่วนเหตุตามประเภท' });
}

function render() {
  renderStats();
  renderEmergency();
  renderIncidents();
  renderActions();
  renderWorkload();
  renderTrend();
  renderCategories();
  renderShellCounts();
}

/* ---------- Events (เฉพาะหน้าหลัก) ---------- */

// คำสั่ง data-action ที่ shared.js ไม่รู้จักจะส่งมาที่นี่
function handlePageAction(action, el) {
  if (action === 'filter') {
    const { filter } = el.dataset;
    view.filter = view.filter === filter && filter !== 'all' ? 'all' : filter;
    view.page = 1;
    renderStats();
    renderIncidents();
    updateTimers();
    refocus(`.${el.classList.contains('stat') ? 'stat' : 'tab'}[data-filter="${filter}"]`);
  }

  if (action === 'page') {
    view.page += Number(el.dataset.dir);
    renderIncidents();
    updateTimers();
    refocus(`[data-action="page"][data-dir="${el.dataset.dir}"]:not(:disabled)`);
  }

  if (action === 'more-actions') {
    view.showAllActions = !view.showAllActions;
    renderActions();
    updateTimers();
    refocus('.action-more');
  }
}

// หลังรับแจ้งเหตุใหม่ ล้างตัวกรองเพื่อให้เห็นรายการที่เพิ่งสร้าง (shared.js เรียกให้)
function resetView() {
  Object.assign(view, { filter: 'all', query: '', page: 1 });
  $('searchInput').value = '';
}

// ปุ่มกระดิ่ง: เลื่อนไปกล่อง "ต้องดำเนินการ" แล้วกระพริบ
function flashActions() {
  const card = $('actionsCard');
  card.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  card.classList.remove('flash');
  void card.offsetWidth;
  card.classList.add('flash');
}
const handleBell = flashActions;

// ช่องค้นหาด้านบน: พิมพ์แล้วกรองตารางทันที กด Enter เพื่อไปดูผลที่หน้ารายการแจ้งเหตุ
$('searchInput').addEventListener('input', (event) => {
  view.query = event.target.value;
  view.page = 1;
  renderIncidents();
  updateTimers();
});

$('searchInput').addEventListener('keydown', (event) => {
  const q = event.target.value.trim();
  if (event.key === 'Enter' && q) location.href = `incidents.html?q=${encodeURIComponent(q)}`;
});

/* ---------- Init ---------- */

// boot() โหลดข้อมูลอ้างอิง ผู้ใช้ เจ้าหน้าที่ และเหตุ ให้ครบก่อนวาดหน้าครั้งแรก
boot().then(renderGreeting);
startTicker();

// มาจากกระดิ่งของหน้าอื่น
if (location.hash === '#actionsCard') flashActions();

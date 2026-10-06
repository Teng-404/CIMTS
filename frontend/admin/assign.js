'use strict';

/* หน้ามอบหมายงาน — เลือกเหตุจากคิวด้านซ้าย ดูรายละเอียดตรงกลาง แล้วเลือกเจ้าหน้าที่ที่ระบบแนะนำทางขวา
   ข้อมูล หน้าต่างรายละเอียด/มอบหมาย และเมนูมาจาก shared.js (ต้องโหลดก่อนไฟล์นี้)
   ตัวกรองและเหตุที่เลือกอยู่ถูกเก็บไว้ใน URL (?pri=emergency&id=INC-0687) จึงแชร์ลิงก์หรือรีเฟรชแล้วยังอยู่ */

mountShell('assign');

const PRIORITY_RANK = { emergency: 0, urgent: 1, normal: 2 };
const has = (obj, key) => typeof key === 'string' && Object.hasOwn(obj, key);

const DEFAULTS = { pri: '', q: '' };
const view = { ...DEFAULTS, selectedId: null };

/* ---------- URL ---------- */

function readParams() {
  const p = new URLSearchParams(location.search);
  view.pri = has(PRIORITIES, p.get('pri')) ? p.get('pri') : '';
  view.q = p.get('q') ?? '';
  const id = p.get('id');
  view.selectedId = id && findIncident(id)?.status === 'pending' ? id : null;
}

function writeParams() {
  const p = new URLSearchParams();
  if (view.pri) p.set('pri', view.pri);
  if (view.q) p.set('q', view.q);
  if (view.selectedId) p.set('id', view.selectedId);
  const qs = p.toString();
  try {
    history.replaceState(null, '', location.pathname + (qs ? `?${qs}` : ''));
  } catch {
    // ปรับ URL ไม่ได้ (เช่น เปิดไฟล์ตรงๆ ในบางเบราว์เซอร์) — ไม่กระทบการทำงาน
  }
}

/* ---------- Data ---------- */

// เหตุรอมอบหมายทั้งหมดที่ตรงกับคำค้นหา (ยังไม่กรองระดับความเร่งด่วน — ใช้นับตัวเลขบนแท็บ)
const pendingBase = () => state.incidents.filter(FILTERS.pending).filter((i) => matchesQuery(i, view.q));

// เรียงเหตุฉุกเฉินก่อน แล้วตามด้วยเหตุที่ใกล้ครบกำหนดเวลาที่ควรมอบหมายที่สุด
function queueList() {
  return pendingBase()
    .filter((i) => !view.pri || i.pri === view.pri)
    .sort((a, b) => PRIORITY_RANK[a.pri] - PRIORITY_RANK[b.pri] || assignDeadline(a) - assignDeadline(b));
}

/* ---------- Rendering: คิวรอมอบหมาย ---------- */

function queueCardHtml(i) {
  const selected = i.id === view.selectedId;
  return `
    <button type="button" class="queue-card${selected ? ' is-selected' : ''}" data-action="select-incident" data-id="${i.id}" aria-pressed="${selected}">
      <div class="queue-card-top">
        <span class="queue-card-id">${i.id}</span>
        ${priorityBadge(i.pri)}
      </div>
      <strong class="queue-card-title">${esc(i.title)}</strong>
      <span class="queue-card-place">${icon('map-pin', 'icon--xs')}${esc(i.place)}</span>
      <span class="queue-card-time muted small" data-tick="ago" data-ts="${i.reportedAt}"></span>
    </button>`;
}

// totalPending = ทุกเหตุที่รอมอบหมาย ไม่ผ่านตัวกรองใดๆ เลย — ใช้แยกว่า "คิวว่างจริง" หรือ "ตัวกรองกวาดจนไม่เหลือ"
function queueEmptyHtml(totalPending) {
  if (totalPending === 0) return `<div class="empty">${icon('check')}<span>ไม่มีเหตุที่รอมอบหมายในขณะนี้</span></div>`;
  return `<div class="empty">${icon('inbox')}<span>ไม่มีเหตุที่ตรงกับเงื่อนไข</span><button type="button" class="btn btn-ghost btn-sm" data-action="clear-filters">ล้างตัวกรอง</button></div>`;
}

function renderQueue() {
  const totalPending = state.incidents.filter(FILTERS.pending).length;
  const base = pendingBase();
  const list = queueList();

  // ถ้าเหตุที่เลือกอยู่ถูกมอบหมายไปแล้ว หรือถูกตัวกรองออกไป ให้เลือกรายการแรกของคิวที่เหลือแทน
  if (!list.some((i) => i.id === view.selectedId)) view.selectedId = list[0]?.id ?? null;

  $('queueCount').textContent = base.length ? `${base.length} เหตุ` : '';

  const tabs = [['', 'ทั้งหมด', base.length], ...Object.entries(PRIORITIES).map(([key, p]) => [key, p.label, base.filter((i) => i.pri === key).length])];
  $('queueTabs').innerHTML = tabs.map(([key, label, count]) => `
    <button type="button" class="tab${view.pri === key ? ' is-active' : ''}" data-action="pri-tab" data-pri="${key}">
      ${label}<span class="tab-count">${count}</span>
    </button>`).join('');

  $('queueList').innerHTML = list.length ? list.map(queueCardHtml).join('') : queueEmptyHtml(totalPending);

  writeParams();
}

/* ---------- Rendering: รายละเอียดเหตุที่เลือก ---------- */

function renderDetail() {
  const i = findIncident(view.selectedId);

  if (!i) {
    $('detailMeta').textContent = '';
    $('detailBody').innerHTML = `<div class="empty">${icon('inbox')}<span>เลือกเหตุจากคิวด้านซ้ายเพื่อดูรายละเอียด</span></div>`;
    return;
  }

  $('detailMeta').textContent = i.id;
  $('detailBody').innerHTML = `
    <div class="assign-detail">
      ${alertStrip(i)}

      <div class="sheet-title">
        <div>
          <h3>${esc(i.title)}</h3>
          <p class="muted">${icon('map-pin', 'icon--xs')} ${esc(formatPlace(i))}</p>
        </div>
        ${priorityBadge(i.pri)}
      </div>

      <div class="info-grid">
        ${infoCard('เวลาที่แจ้งเหตุ', fmtFullDateTime(i.reportedAt))}
        ${infoCard('ผู้แจ้งเหตุ', esc(i.reporter || 'ไม่ระบุ'))}
        ${infoCard('เบอร์โทรศัพท์', maskPhone(i.phone))}
        ${infoCard('ประเภทเหตุ', esc(CATEGORIES[i.cat].label))}
      </div>

      <section class="sheet-section">
        <h4>หลักฐานประกอบ</h4>
        ${evidenceHtml(i)}
      </section>

      <section class="sheet-section">
        <h4>รายละเอียดเพิ่มเติม</h4>
        <p class="detail-box${i.note ? '' : ' is-empty'}">${i.note ? esc(i.note) : 'ไม่มีรายละเอียดเพิ่มเติม'}</p>
      </section>

      <div class="assign-detail-foot">
        <button type="button" class="link-btn" data-action="detail" data-id="${i.id}">ดูประวัติทั้งหมด</button>
      </div>
    </div>`;
}

/* ---------- Rendering: เจ้าหน้าที่ที่ระบบแนะนำ ---------- */

function recCardHtml(incident, r, isBest) {
  const { officer } = r;
  const chips = [
    r.sameDept ? chip('ตรงประเภทงาน') : chip(esc(CATEGORIES[officer.cat].label), false),
    officer.onDuty ? chip('เข้าเวรปัจจุบัน') : chip('ไม่อยู่ในเวร', false),
    r.sameZone ? chip('อยู่ในพื้นที่') : '',
    r.free > 0 ? chip(`มีคิวว่าง ${r.free} งาน`) : chip('งานเต็ม', false),
  ].filter(Boolean).join('');

  return `
    <div class="officer-card rec-card${isBest ? ' rec-card--best' : ''}">
      <div class="officer-top">
        ${officerAvatar(officer, 'md')}
        <div class="officer-meta"><strong>${esc(officer.name)}</strong><span>${esc(CATEGORIES[officer.cat].dept)} · ${officerStatus(r).text}</span></div>
        ${isBest ? '<span class="tag tag--rec">แนะนำ</span>' : ''}
      </div>
      <div class="chips">${chips}</div>
      <div class="rec-foot">
        <span class="rec-load">${r.active}/${officer.capacity} งาน</span>
        <button type="button" class="btn btn-primary btn-sm" data-action="quick-pick" data-id="${incident.id}" data-officer="${officer.id}">เลือกเจ้าหน้าที่นี้</button>
      </div>
    </div>`;
}

function renderRecommend() {
  const i = findIncident(view.selectedId);

  if (!i) {
    $('recCount').textContent = '';
    $('recBody').innerHTML = `<div class="empty">${icon('user-check')}<span>เลือกเหตุจากคิวด้านซ้ายเพื่อดูคำแนะนำเจ้าหน้าที่</span></div>`;
    return;
  }

  const ranking = rankOfficers(i).slice(0, 5);
  const best = bestOfficer(ranking);
  $('recCount').textContent = `${ranking.length} คน`;
  $('recBody').innerHTML = ranking.map((r) => recCardHtml(i, r, r === best)).join('')
    + `<button type="button" class="rec-more" data-action="forward" data-id="${i.id}">${icon('users', 'icon--xs')}เลือกจากเจ้าหน้าที่ทั้งหมด</button>`;
}

/* ---------- Render & events ---------- */

function render() {
  renderQueue();
  renderDetail();
  renderRecommend();
  renderShellCounts();
}

function clearFilters() {
  Object.assign(view, DEFAULTS);
  $('searchInput').value = '';
  render();
  updateTimers();
}

function handlePageAction(action, el) {
  if (action === 'pri-tab') {
    view.pri = view.pri === el.dataset.pri ? '' : el.dataset.pri;
    render();
    updateTimers();
  }

  if (action === 'select-incident' && el.dataset.id !== view.selectedId) {
    view.selectedId = el.dataset.id;
    render();
    updateTimers();
  }

  if (action === 'quick-pick') assign(findIncident(el.dataset.id), el.dataset.officer);
  if (action === 'clear-filters') clearFilters();
}

$('searchInput').addEventListener('input', (event) => {
  view.q = event.target.value;
  render();
  updateTimers();
});

/* ---------- Init ---------- */

function onReady() {
  readParams();
  $('searchInput').value = view.q;
}

boot();
startTicker();

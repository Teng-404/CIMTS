'use strict';

/* หน้าแจ้งเหตุ (หน้าแรกของพอร์ทัลผู้ใช้) — สรุปภาพรวม + ความคืบหน้าล่าสุด + ปุ่มแจ้งเหตุใหม่
   ข้อมูล ฟอร์มแจ้งเหตุ และเมนูมาจาก shared.js (ต้องโหลดก่อนไฟล์นี้) */

mountShell('report');

function ownerCell(i) {
  return i.officer ? esc(i.officer) : '<span class="muted">ยังไม่มอบหมาย</span>';
}

function rowHtml(i) {
  return `
    <tr tabindex="0" data-action="detail" data-id="${i.id}">
      <td class="cell-id">#${numOf(i)}</td>
      <td>
        <div class="cell-title">${esc(i.title)}</div>
        <div class="cell-sub">${icon('map-pin', 'icon--xs')}<span>${esc(i.place)}</span><span aria-hidden="true">·</span><span>${fmtAgo((Date.now() - i.reportedAt) / 1000)}</span></div>
      </td>
      <td>${priorityBadge(i.pri)}</td>
      <td>${statusBadge(i)}</td>
      <td>${ownerCell(i)}</td>
    </tr>`;
}

function renderStats() {
  const c = counts();
  const rate = c.done ? Math.round((c.done / c.all) * 100) : 0;
  const cards = [
    { label: 'รายการทั้งหมด', value: c.all, sub: 'ตั้งแต่เริ่มใช้งาน', icon: 'clipboard', tone: 'blue' },
    { label: 'กำลังดำเนินการ', value: c.active, sub: c.active ? `อัปเดตล่าสุดวันนี้` : 'ไม่มีรายการค้างอยู่', icon: 'hourglass', tone: 'blue' },
    { label: 'เสร็จสิ้นแล้ว', value: c.done, sub: `อัตราการแก้ไข ${rate}%`, icon: 'check', tone: 'green' },
  ];

  $('stats').innerHTML = cards.map((s) => `
    <div class="stat stat--static">
      <span class="stat-icon stat-icon--${s.tone}">${icon(s.icon)}</span>
      <span class="stat-body">
        <span class="stat-label">${s.label}</span>
        <span class="stat-value">${s.value} รายการ</span>
        <span class="stat-sub">${s.sub}</span>
      </span>
    </div>`).join('');
}

function renderLatest() {
  const list = [...state.incidents].sort((a, b) => b.reportedAt - a.reportedAt);
  const incident = list.find(isActive) ?? list[0];
  const card = $('latestCard');

  if (!incident) {
    card.hidden = true;
    return;
  }
  card.hidden = false;
  $('latestMeta').textContent = incident.id;
  $('latestBody').innerHTML = `
    <div class="assign-detail">
      <div class="sheet-title">
        <div>
          <h3>${esc(incident.title)}</h3>
          <p class="muted">${icon('map-pin', 'icon--xs')} ${esc(incident.place)} · แจ้งเมื่อ ${fmtAgo((Date.now() - incident.reportedAt) / 1000)}</p>
        </div>
        ${statusBadge(incident)}
      </div>
      ${trackerHtml(incident)}
      <div class="assign-detail-foot">
        <button type="button" class="link-btn" data-action="detail" data-id="${incident.id}">ดูรายละเอียดทั้งหมด</button>
      </div>
    </div>`;
}

function renderPreview() {
  const list = [...state.incidents].sort((a, b) => b.reportedAt - a.reportedAt).slice(0, 5);
  $('previewBody').innerHTML = list.length
    ? list.map(rowHtml).join('')
    : `<tr><td colspan="5"><div class="empty">${icon('inbox')}<span>ยังไม่มีรายการแจ้งเหตุ — กด “แจ้งเหตุใหม่” เพื่อเริ่มต้น</span></div></td></tr>`;
}

function render() {
  renderStats();
  renderLatest();
  renderPreview();
  renderShellCounts();
}

/* ---------- Init ---------- */

boot();

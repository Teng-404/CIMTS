'use strict';

/* หน้าจัดการสถานที่ — เพิ่ม แก้ไข และเปิด/ปิดการใช้งานพื้นที่/อาคาร
   (ขอบเขตภาคเรียนที่ 1 ข้อ 2: ระบบจัดการข้อมูลพื้นฐานของการแจ้งเหตุ)
   ข้อมูลและเมนูมาจาก shared.js (ต้องโหลดก่อนไฟล์นี้)

   สถานที่ถูกอ้างอิงจากเหตุที่แจ้งไว้แล้ว จึงไม่เปิดให้ลบถาวร ใช้การปิดใช้งานแทน
   ส่วนรายละเอียดระดับห้อง ผู้แจ้งกรอกเป็นข้อความตอนแจ้งเหตุ (ช่อง "จุดที่พบ") */

mountShell('places');

let items = [];

/* ---------- Data ---------- */

async function loadItems() {
  const data = await api('/api/zones/?page_size=200');
  items = data.results ?? data;
}

const usageOf = (name) => state.incidents.filter((i) => i.zone === name).length;
const officersIn = (name) => OFFICERS.filter((o) => o.zone === name).length;

/* ---------- Rendering ---------- */

function renderStats() {
  const active = items.filter((z) => z.isActive).length;
  const covered = items.filter((z) => officersIn(z.name) > 0).length;

  const cards = [
    { label: 'สถานที่ทั้งหมด', value: items.length, sub: `${items.length - active} แห่งถูกปิดใช้งาน`, icon: 'map-pin', tone: 'blue' },
    { label: 'เปิดใช้งานอยู่', value: active, sub: 'ผู้แจ้งเลือกได้', icon: 'check', tone: 'green' },
    { label: 'มีเจ้าหน้าที่ประจำ', value: covered, sub: covered < active ? `อีก ${active - covered} แห่งยังไม่มีคนดูแล` : 'ครอบคลุมทุกพื้นที่', icon: 'users', tone: covered < active ? 'red' : 'green' },
  ];

  $('itemStats').innerHTML = cards.map((c) => `
    <div class="stat stat--static">
      <span class="stat-icon stat-icon--${c.tone}">${icon(c.icon)}</span>
      <span class="stat-body">
        <span class="stat-label">${c.label}</span>
        <span class="stat-value">${c.value}</span>
        <span class="stat-sub">${c.sub}</span>
      </span>
    </div>`).join('');
}

function renderTable() {
  $('itemHead').innerHTML = `
    <tr>
      <th scope="col">สถานที่</th>
      <th scope="col">เจ้าหน้าที่ประจำพื้นที่</th>
      <th scope="col">การแจ้งเหตุ</th>
      <th scope="col">สถานะ</th>
      <th scope="col">จัดการ</th>
    </tr>`;

  const rows = [...items].sort((a, b) => a.name.localeCompare(b.name, 'th'));

  $('itemBody').innerHTML = rows.length ? rows.map((z) => {
    const officers = officersIn(z.name);
    const used = usageOf(z.name);
    return `
      <tr${z.isActive ? '' : ' class="is-dimmed"'}>
        <td><b>${icon('map-pin', 'icon--xs')} ${esc(z.name)}</b></td>
        <td>${officers
          ? `${officers} คน`
          : '<span class="badge badge--pending">ยังไม่มีเจ้าหน้าที่</span>'}</td>
        <td>${used ? `${used} รายการ` : '<span class="muted">—</span>'}</td>
        <td><span class="badge badge--${z.isActive ? 'done' : 'normal'}">${z.isActive ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}</span></td>
        <td>
          <div class="row-actions">
            <button type="button" class="icon-btn icon-btn--sm" data-action="edit-item" data-id="${esc(z.name)}" aria-label="แก้ไข ${esc(z.name)}" title="แก้ไขชื่อ">${icon('edit')}</button>
            <button type="button" class="icon-btn icon-btn--sm${z.isActive ? ' icon-btn--danger' : ''}" data-action="toggle-item" data-id="${esc(z.name)}"
                    aria-label="${z.isActive ? 'ปิด' : 'เปิด'}การใช้งาน ${esc(z.name)}" title="${z.isActive ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}">${icon(z.isActive ? 'trash' : 'refresh')}</button>
          </div>
        </td>
      </tr>`;
  }).join('')
    : `<tr><td colspan="5"><div class="empty">${icon('inbox')}<span>ยังไม่มีสถานที่ในระบบ</span></div></td></tr>`;

  $('itemMeta').textContent = `${items.length} แห่ง`;
}

function render() {
  renderStats();
  renderTable();
  renderShellCounts();
}

/* ---------- ฟอร์ม ---------- */

const itemDialog = $('itemDialog');

function openItemForm(name = null) {
  const z = name ? items.find((x) => x.name === name) : null;
  const isEdit = Boolean(z);

  itemDialog.innerHTML = `
    <form class="dlg" id="itemForm" novalidate>
      <header class="dlg-head">
        <h2 id="itemFormTitle">${isEdit ? `แก้ไขสถานที่ · ${esc(z.name)}` : 'เพิ่มสถานที่ใหม่'}</h2>
        <button type="button" class="icon-btn" data-action="close-item-form" aria-label="ปิด">${icon('x')}</button>
      </header>

      <div class="dlg-body">
        <div class="field">
          <label for="ifName">ชื่อสถานที่</label>
          <input class="input" id="ifName" value="${esc(z?.name ?? '')}" placeholder="เช่น อาคารเรียนรวม 3" maxlength="80">
          <p class="muted small">ใช้ระดับอาคารหรือพื้นที่ใหญ่ ส่วนห้องหรือจุดที่พบ ผู้แจ้งกรอกเองตอนแจ้งเหตุ</p>
          <p class="field-error" id="ifNameError" hidden></p>
        </div>
        ${isEdit && usageOf(z.name) ? `
        <p class="inline-note">${icon('info', 'icon--xs')} สถานที่นี้ถูกใช้ในเหตุ ${usageOf(z.name)} รายการ การเปลี่ยนชื่อจะมีผลกับรายการเดิมทั้งหมด</p>` : ''}
      </div>

      <footer class="dlg-foot">
        <button type="button" class="btn btn-ghost" data-action="close-item-form">ยกเลิก</button>
        <button type="submit" class="btn btn-primary" id="ifSubmit">${isEdit ? 'บันทึกการแก้ไข' : 'เพิ่มสถานที่'}</button>
      </footer>
    </form>`;

  itemDialog.showModal();
  $('ifName').focus();
  $('itemForm').addEventListener('submit', (event) => {
    event.preventDefault();
    submitItem(isEdit ? z.name : null);
  });
}

function setFieldError(id, message) {
  const errorEl = $(`${id}Error`);
  if (!errorEl) return;
  errorEl.textContent = message;
  errorEl.hidden = !message;
  $(id).closest('.field').classList.toggle('has-error', Boolean(message));
}

async function submitItem(editingName) {
  const name = $('ifName').value.trim();
  const duplicate = items.some((z) => z.name === name && z.name !== editingName);
  const message = !name ? 'กรุณากรอกชื่อสถานที่' : duplicate ? 'มีสถานที่ชื่อนี้อยู่แล้ว' : '';

  setFieldError('ifName', message);
  if (message) {
    $('ifName').focus();
    return;
  }

  $('ifSubmit').disabled = true;
  try {
    if (editingName) {
      // ชื่อเป็นคีย์หลัก การเปลี่ยนชื่อจึงต้องสร้างใหม่แล้วให้ผู้ดูแลย้ายข้อมูลเอง
      // จึงจำกัดให้แก้ได้เฉพาะตอนที่ยังไม่มีเหตุอ้างอิง
      await api(`/api/zones/${encodeURIComponent(editingName)}/`, { method: 'PATCH', body: { name } });
    } else {
      await api('/api/zones/', { method: 'POST', body: { name, isActive: true } });
    }
    itemDialog.close();
    await refreshItems();
    toast(editingName ? 'บันทึกการแก้ไขแล้ว' : `เพิ่มสถานที่ ${name} แล้ว`, 'success');
  } catch (error) {
    $('ifSubmit').disabled = false;
    toast(`บันทึกไม่สำเร็จ: ${error.message}`, 'error');
  }
}

/* ---------- เปิด/ปิดการใช้งาน ---------- */

async function toggleItem(name) {
  const z = items.find((x) => x.name === name);
  const turningOff = z.isActive;

  if (turningOff) {
    const ok = await askConfirm({
      title: `ปิดใช้งาน ${z.name}`,
      message: `ผู้แจ้งจะเลือกสถานที่นี้ไม่ได้อีก แต่เหตุเดิม ${usageOf(name)} รายการยังอยู่ครบ`,
      okText: 'ปิดใช้งาน',
    });
    if (!ok) return;
  }

  try {
    await api(`/api/zones/${encodeURIComponent(name)}/`, {
      method: 'PATCH', body: { isActive: !z.isActive },
    });
    await refreshItems();
    toast(`${turningOff ? 'ปิด' : 'เปิด'}ใช้งาน ${z.name} แล้ว`, 'success');
  } catch (error) {
    toast(`ดำเนินการไม่สำเร็จ: ${error.message}`, 'error');
  }
}

/* ---------- Refresh ---------- */

async function refreshItems() {
  await Promise.all([loadItems(), loadReference()]);
  render();
}

/* ---------- Events ---------- */

function handlePageAction(action, el) {
  if (action === 'new-item') openItemForm();
  if (action === 'edit-item') openItemForm(el.dataset.id);
  if (action === 'toggle-item') toggleItem(el.dataset.id);
  if (action === 'close-item-form') itemDialog.close();
}

itemDialog.addEventListener('click', (event) => {
  if (event.target === itemDialog) itemDialog.close();
});

/* ---------- Init ---------- */

async function onReady() {
  await loadItems();
}

boot();

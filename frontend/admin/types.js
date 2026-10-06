'use strict';

/* หน้าจัดการประเภทเหตุ — เพิ่ม แก้ไข และเปิด/ปิดการใช้งานประเภทเหตุ
   (ขอบเขตภาคเรียนที่ 1 ข้อ 2: ระบบจัดการข้อมูลพื้นฐานของการแจ้งเหตุ)
   ข้อมูลและเมนูมาจาก shared.js (ต้องโหลดก่อนไฟล์นี้)

   ประเภทเหตุถูกอ้างอิงจากเหตุที่แจ้งไว้แล้ว จึงไม่เปิดให้ลบถาวร
   ใช้การปิดใช้งานแทน — ประเภทที่ปิดแล้วจะไม่ปรากฏให้ผู้แจ้งเลือก แต่ประวัติเดิมยังอ่านได้ */

mountShell('types');

const PRESET_COLORS = ['#f26522', '#298adf', '#5b6b7f', '#f2b800', '#f43e31', '#5cc10a', '#8b5cf6', '#0ea5a4'];

let items = [];

/* ---------- Data ---------- */

async function loadItems() {
  const data = await api('/api/incident-types/?page_size=200');
  items = data.results ?? data;
}

// จำนวนเหตุที่ใช้ประเภทนี้ — ใช้เตือนก่อนปิดใช้งาน และบอกว่าประเภทไหนถูกใช้บ่อย
const usageOf = (key) => state.incidents.filter((i) => i.cat === key).length;

/* ---------- Rendering ---------- */

function renderStats() {
  const active = items.filter((t) => t.isActive).length;
  const used = items.filter((t) => usageOf(t.key) > 0).length;

  const cards = [
    { label: 'ประเภททั้งหมด', value: items.length, sub: `${items.length - active} ประเภทถูกปิดใช้งาน`, icon: 'tag', tone: 'blue' },
    { label: 'เปิดใช้งานอยู่', value: active, sub: 'ผู้แจ้งเลือกได้', icon: 'check', tone: 'green' },
    { label: 'มีการแจ้งเหตุแล้ว', value: used, sub: `จากทั้งหมด ${items.length} ประเภท`, icon: 'clipboard', tone: 'blue' },
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
      <th scope="col">ประเภทเหตุ</th>
      <th scope="col">หน่วยงานที่รับผิดชอบ</th>
      <th scope="col">คีย์ระบบ</th>
      <th scope="col">เจ้าหน้าที่</th>
      <th scope="col">การแจ้งเหตุ</th>
      <th scope="col">สถานะ</th>
      <th scope="col">จัดการ</th>
    </tr>`;

  const rows = [...items].sort((a, b) => a.label.localeCompare(b.label, 'th'));

  $('itemBody').innerHTML = rows.length ? rows.map((t) => {
    const officers = OFFICERS.filter((o) => o.cat === t.key).length;
    const used = usageOf(t.key);
    return `
      <tr${t.isActive ? '' : ' class="is-dimmed"'}>
        <td>
          <span class="cat"><span class="cat-dot" style="--c:${esc(t.color)}"></span><b>${esc(t.label)}</b></span>
        </td>
        <td>${esc(t.dept)}</td>
        <td><code class="code-chip">${esc(t.key)}</code></td>
        <td>${officers ? `${officers} คน` : '<span class="muted">ยังไม่มี</span>'}</td>
        <td>${used ? `${used} รายการ` : '<span class="muted">—</span>'}</td>
        <td><span class="badge badge--${t.isActive ? 'done' : 'normal'}">${t.isActive ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}</span></td>
        <td>
          <div class="row-actions">
            <button type="button" class="icon-btn icon-btn--sm" data-action="edit-item" data-id="${esc(t.key)}" aria-label="แก้ไข ${esc(t.label)}" title="แก้ไข">${icon('edit')}</button>
            <button type="button" class="icon-btn icon-btn--sm${t.isActive ? ' icon-btn--danger' : ''}" data-action="toggle-item" data-id="${esc(t.key)}"
                    aria-label="${t.isActive ? 'ปิด' : 'เปิด'}การใช้งาน ${esc(t.label)}" title="${t.isActive ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}">${icon(t.isActive ? 'trash' : 'refresh')}</button>
          </div>
        </td>
      </tr>`;
  }).join('')
    : `<tr><td colspan="7"><div class="empty">${icon('inbox')}<span>ยังไม่มีประเภทเหตุในระบบ</span></div></td></tr>`;

  $('itemMeta').textContent = `${items.length} ประเภท`;
}

function render() {
  renderStats();
  renderTable();
  renderShellCounts();
}

/* ---------- ฟอร์ม ---------- */

const itemDialog = $('itemDialog');

function openItemForm(key = null) {
  const t = key ? items.find((x) => x.key === key) : null;
  const isEdit = Boolean(t);
  const color = t?.color ?? PRESET_COLORS[items.length % PRESET_COLORS.length];

  itemDialog.innerHTML = `
    <form class="dlg" id="itemForm" novalidate>
      <header class="dlg-head">
        <h2 id="itemFormTitle">${isEdit ? `แก้ไขประเภทเหตุ · ${esc(t.label)}` : 'เพิ่มประเภทเหตุใหม่'}</h2>
        <button type="button" class="icon-btn" data-action="close-item-form" aria-label="ปิด">${icon('x')}</button>
      </header>

      <div class="dlg-body">
        <div class="field">
          <label for="ifKey">คีย์ระบบ</label>
          <input class="input" id="ifKey" value="${esc(t?.key ?? '')}" ${isEdit ? 'readonly' : ''}
                 placeholder="เช่น electric (อังกฤษพิมพ์เล็ก ห้ามเว้นวรรค)" maxlength="30">
          <p class="muted small">ใช้อ้างอิงภายในระบบ ตั้งแล้วเปลี่ยนไม่ได้</p>
          <p class="field-error" id="ifKeyError" hidden></p>
        </div>
        <div class="field">
          <label for="ifLabel">ชื่อที่แสดง</label>
          <input class="input" id="ifLabel" value="${esc(t?.label ?? '')}" placeholder="เช่น ไฟฟ้า" maxlength="60">
          <p class="field-error" id="ifLabelError" hidden></p>
        </div>
        <div class="field">
          <label for="ifDept">หน่วยงานที่รับผิดชอบ</label>
          <input class="input" id="ifDept" value="${esc(t?.dept ?? '')}" placeholder="เช่น งานไฟฟ้า" maxlength="80">
          <p class="field-error" id="ifDeptError" hidden></p>
        </div>
        <div class="field">
          <label for="ifColor">สีประจำประเภท</label>
          <div class="color-row">
            <input type="color" class="color-input" id="ifColor" value="${esc(color)}" aria-label="เลือกสีประจำประเภท">
            <div class="color-presets">
              ${PRESET_COLORS.map((c) => `<button type="button" class="color-chip" data-action="pick-color" data-color="${c}" style="--c:${c}" aria-label="ใช้สี ${c}"></button>`).join('')}
            </div>
          </div>
          <p class="muted small">ใช้เป็นจุดสีในตารางและกราฟสถิติ</p>
        </div>
      </div>

      <footer class="dlg-foot">
        <button type="button" class="btn btn-ghost" data-action="close-item-form">ยกเลิก</button>
        <button type="submit" class="btn btn-primary" id="ifSubmit">${isEdit ? 'บันทึกการแก้ไข' : 'เพิ่มประเภทเหตุ'}</button>
      </footer>
    </form>`;

  itemDialog.showModal();
  $(isEdit ? 'ifLabel' : 'ifKey').focus();
  $('itemForm').addEventListener('submit', (event) => {
    event.preventDefault();
    submitItem(isEdit ? t.key : null);
  });
}

function setFieldError(id, message) {
  const errorEl = $(`${id}Error`);
  if (!errorEl) return;
  errorEl.textContent = message;
  errorEl.hidden = !message;
  $(id).closest('.field').classList.toggle('has-error', Boolean(message));
}

async function submitItem(editingKey) {
  const key = $('ifKey').value.trim();
  const label = $('ifLabel').value.trim();
  const dept = $('ifDept').value.trim();

  const checks = [
    ['ifKey', editingKey ? '' : !key ? 'กรุณากรอกคีย์ระบบ'
      : !/^[a-z][a-z0-9_-]*$/.test(key) ? 'ใช้ได้เฉพาะอังกฤษพิมพ์เล็ก ตัวเลข - และ _ และต้องขึ้นต้นด้วยตัวอักษร'
      : items.some((t) => t.key === key) ? 'คีย์นี้ถูกใช้แล้ว' : ''],
    ['ifLabel', label ? '' : 'กรุณากรอกชื่อที่แสดง'],
    ['ifDept', dept ? '' : 'กรุณากรอกหน่วยงานที่รับผิดชอบ'],
  ];

  let firstInvalid = null;
  checks.forEach(([id, message]) => {
    setFieldError(id, message);
    if (message && !firstInvalid) firstInvalid = id;
  });
  if (firstInvalid) {
    $(firstInvalid).focus();
    return;
  }

  const payload = { label, dept, color: $('ifColor').value };
  $('ifSubmit').disabled = true;
  try {
    if (editingKey) {
      await api(`/api/incident-types/${encodeURIComponent(editingKey)}/`, { method: 'PATCH', body: payload });
    } else {
      await api('/api/incident-types/', { method: 'POST', body: { key, ...payload, isActive: true } });
    }
    itemDialog.close();
    await refreshItems();
    toast(editingKey ? 'บันทึกการแก้ไขแล้ว' : `เพิ่มประเภทเหตุ ${label} แล้ว`, 'success');
  } catch (error) {
    $('ifSubmit').disabled = false;
    toast(`บันทึกไม่สำเร็จ: ${error.message}`, 'error');
  }
}

/* ---------- เปิด/ปิดการใช้งาน ---------- */

async function toggleItem(key) {
  const t = items.find((x) => x.key === key);
  const turningOff = t.isActive;

  if (turningOff) {
    const officers = OFFICERS.filter((o) => o.cat === key).length;
    const ok = await askConfirm({
      title: `ปิดใช้งาน ${t.label}`,
      message: `ผู้แจ้งจะเลือกประเภทนี้ไม่ได้อีก แต่เหตุเดิม ${usageOf(key)} รายการยังอยู่ครบ`
        + (officers ? ` มีเจ้าหน้าที่ ${officers} คนรับผิดชอบประเภทนี้อยู่` : ''),
      okText: 'ปิดใช้งาน',
    });
    if (!ok) return;
  }

  try {
    await api(`/api/incident-types/${encodeURIComponent(key)}/`, {
      method: 'PATCH', body: { isActive: !t.isActive },
    });
    await refreshItems();
    toast(`${turningOff ? 'ปิด' : 'เปิด'}ใช้งาน ${t.label} แล้ว`, 'success');
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
  if (action === 'pick-color') $('ifColor').value = el.dataset.color;
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

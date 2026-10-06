'use strict';

/* หน้าจัดการผู้ใช้งาน — เพิ่ม แก้ไข กำหนดสิทธิ์ และปิดการใช้งานบัญชี
   (ขอบเขตภาคเรียนที่ 1 ข้อ 1: ระบบจัดการผู้ใช้งานและการยืนยันตัวตน)
   ข้อมูลและเมนูมาจาก shared.js (ต้องโหลดก่อนไฟล์นี้)

   ผู้ใช้งานเป็นข้อมูลคนละชุดกับ state.incidents จึงเก็บไว้ใน users แยกต่างหาก
   ตัวกรองถูกเก็บไว้ใน URL (?role=officer&active=true) จึงแชร์ลิงก์หรือรีเฟรชแล้วยังอยู่ */

mountShell('users');

const ROLES = {
  admin: 'ผู้ดูแลระบบ',
  officer: 'เจ้าหน้าที่',
  user: 'ผู้แจ้งเหตุ',
};

const ROLE_BADGE = { admin: 'pending', officer: 'progress', user: 'normal' };

const DEFAULTS = { q: '', role: '', active: '' };
const view = { ...DEFAULTS };

let users = [];

const has = (obj, key) => typeof key === 'string' && Object.hasOwn(obj, key);

/* ---------- URL ---------- */

function readParams() {
  const p = new URLSearchParams(location.search);
  view.q = p.get('q') ?? '';
  view.role = has(ROLES, p.get('role')) ? p.get('role') : '';
  view.active = ['true', 'false'].includes(p.get('active')) ? p.get('active') : '';
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
    // ปรับ URL ไม่ได้ — ไม่กระทบการทำงาน
  }
}

/* ---------- Data ---------- */

async function loadUsers() {
  const data = await api('/api/users/?page_size=500');
  users = data.results ?? data;
}

function matchesUser(u, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [u.fullName, u.username, u.email, u.phone].some((v) => String(v ?? '').toLowerCase().includes(q));
}

function filtered() {
  return users
    .filter((u) => !view.role || u.role === view.role)
    .filter((u) => !view.active || String(u.isActive) === view.active)
    .filter((u) => matchesUser(u, view.q));
}

/* ---------- Rendering ---------- */

function renderStats() {
  const total = users.length;
  const cards = [
    { key: '', label: 'ผู้ใช้งานทั้งหมด', icon: 'users', tone: 'blue', value: total,
      sub: `${users.filter((u) => !u.isActive).length} บัญชีถูกปิดใช้งาน` },
    ...Object.entries(ROLES).map(([key, label]) => {
      const n = users.filter((u) => u.role === key).length;
      return {
        key, label, icon: key === 'admin' ? 'user-check' : key === 'officer' ? 'users' : 'user',
        tone: key === 'admin' ? 'red' : key === 'officer' ? 'blue' : 'green',
        value: n, sub: total ? `${Math.round((n / total) * 100)}% ของทั้งหมด` : '—',
      };
    }),
  ];

  $('userStats').innerHTML = cards.map((c) => {
    const active = c.key !== '' && view.role === c.key;
    return `
      <button type="button" class="stat${active ? ' is-active' : ''}" data-action="role-filter" data-role="${c.key}" aria-pressed="${active}">
        <span class="stat-icon stat-icon--${c.tone}">${icon(c.icon)}</span>
        <span class="stat-body">
          <span class="stat-label">${c.label}</span>
          <span class="stat-value">${c.value} คน</span>
          <span class="stat-sub">${c.sub}</span>
        </span>
      </button>`;
  }).join('');
}

function renderFilters() {
  const opt = (value, label, current) => `<option value="${esc(value)}"${current === value ? ' selected' : ''}>${esc(label)}</option>`;
  $('uRole').innerHTML = opt('', 'บทบาท: ทั้งหมด', view.role)
    + Object.entries(ROLES).map(([k, label]) => opt(k, label, view.role)).join('');
  $('uActive').innerHTML = opt('', 'สถานะ: ทั้งหมด', view.active)
    + opt('true', 'ใช้งานอยู่', view.active) + opt('false', 'ปิดใช้งาน', view.active);
}

function officerCell(u) {
  if (u.role !== 'officer') return '<span class="muted">—</span>';
  const o = u.officer;
  if (!o) return '<span class="muted">ยังไม่ตั้งค่า</span>';
  const cat = CATEGORIES[o.cat];
  return `
    <div class="cell-sub-stack">
      <span class="cat"><span class="cat-dot" style="--c:${cat?.color ?? '#999'}"></span>${esc(cat?.label ?? o.cat)}</span>
      <span class="muted small">${icon('map-pin', 'icon--xs')} ${esc(o.zone)} · ${u.activeJobs ?? 0}/${o.capacity} งาน · ${o.shiftStart}–${o.shiftEnd} น.</span>
    </div>`;
}

function userRowHtml(u) {
  const initial = (u.firstName || u.username || '?').slice(0, 1);
  return `
    <tr${u.isActive ? '' : ' class="is-dimmed"'}>
      <td>
        <div class="cell-owner">
          <span class="avatar avatar--sm" aria-hidden="true">${esc(initial)}</span>
          <div class="load-who">
            <strong>${esc(u.fullName || u.username)}</strong>
            <span class="load-sub">@${esc(u.username)}</span>
          </div>
        </div>
      </td>
      <td><span class="badge badge--${ROLE_BADGE[u.role]}">${esc(ROLES[u.role] ?? u.role)}</span></td>
      <td>
        <div class="cell-sub-stack">
          <span>${esc(u.email || '—')}</span>
          <span class="muted small">${esc(u.phone || 'ไม่ระบุเบอร์')}</span>
        </div>
      </td>
      <td>${officerCell(u)}</td>
      <td>
        <span class="badge badge--${u.isActive ? 'done' : 'normal'}">${u.isActive ? 'ใช้งานอยู่' : 'ปิดใช้งาน'}</span>
      </td>
      <td>
        <div class="row-actions">
          <button type="button" class="icon-btn icon-btn--sm" data-action="edit-user" data-id="${esc(u.username)}" aria-label="แก้ไข ${esc(u.fullName)}" title="แก้ไข">${icon('edit')}</button>
          <button type="button" class="icon-btn icon-btn--sm" data-action="reset-password" data-id="${esc(u.username)}" aria-label="ตั้งรหัสผ่านใหม่ให้ ${esc(u.fullName)}" title="ตั้งรหัสผ่านใหม่">${icon('key')}</button>
          ${u.isActive
            ? `<button type="button" class="icon-btn icon-btn--sm icon-btn--danger" data-action="disable-user" data-id="${esc(u.username)}" aria-label="ปิดใช้งาน ${esc(u.fullName)}" title="ปิดใช้งาน">${icon('trash')}</button>`
            : `<button type="button" class="icon-btn icon-btn--sm" data-action="enable-user" data-id="${esc(u.username)}" aria-label="เปิดใช้งาน ${esc(u.fullName)}" title="เปิดใช้งานอีกครั้ง">${icon('refresh')}</button>`}
        </div>
      </td>
    </tr>`;
}

function renderTable() {
  const rows = filtered();
  const active = Object.keys(DEFAULTS).some((k) => view[k] !== DEFAULTS[k]);

  $('userBody').innerHTML = rows.length
    ? rows.map(userRowHtml).join('')
    : `<tr><td colspan="6"><div class="empty">${icon('inbox')}<span>ไม่พบผู้ใช้งานที่ตรงกับเงื่อนไข</span>${active ? '<button type="button" class="btn btn-ghost btn-sm" data-action="clear-filters">ล้างตัวกรอง</button>' : ''}</div></td></tr>`;

  $('userMeta').innerHTML = `พบ <b>${rows.length}</b> คน${active ? ' · <button type="button" class="link-btn" data-action="clear-filters">ล้างตัวกรอง</button>' : ''}`;
  writeParams();
}

function render() {
  renderStats();
  renderFilters();
  renderTable();
  renderShellCounts();
}

/* ---------- ฟอร์มเพิ่ม/แก้ไขผู้ใช้งาน ---------- */

const userDialog = $('userDialog');
const passwordDialog = $('passwordDialog');
const closeBtn = `<button type="button" class="icon-btn" data-action="close-user-form" aria-label="ปิด">${icon('x')}</button>`;

function selectOptions(entries, current) {
  return entries.map(([value, label]) =>
    `<option value="${esc(value)}"${String(current) === String(value) ? ' selected' : ''}>${esc(label)}</option>`).join('');
}

function openUserForm(username = null) {
  const u = username ? users.find((x) => x.username === username) : null;
  const o = u?.officer ?? {};
  const isEdit = Boolean(u);

  userDialog.innerHTML = `
    <form class="dlg" id="userForm" novalidate>
      <header class="dlg-head">
        <h2 id="userFormTitle">${isEdit ? `แก้ไขผู้ใช้งาน · ${esc(u.fullName)}` : 'เพิ่มผู้ใช้งานใหม่'}</h2>
        ${closeBtn}
      </header>

      <div class="dlg-body">
        <div class="form-grid">
          <div class="field">
            <label for="ufUsername">ชื่อผู้ใช้ (สำหรับเข้าสู่ระบบ)</label>
            <input class="input" id="ufUsername" name="username" value="${esc(u?.username ?? '')}"
                   ${isEdit ? 'readonly' : ''} placeholder="เช่น o9 หรือ somchai" maxlength="150">
            <p class="field-error" id="ufUsernameError" hidden></p>
          </div>
          <div class="field">
            <label for="ufRole">บทบาท</label>
            <select class="select" id="ufRole" name="role">
              ${selectOptions(Object.entries(ROLES), u?.role ?? 'user')}
            </select>
          </div>
          <div class="field">
            <label for="ufTitle">คำนำหน้า</label>
            <input class="input" id="ufTitle" name="title" value="${esc(u?.title ?? '')}" placeholder="นาย / นาง / นางสาว" maxlength="20">
          </div>
          <div class="field">
            <label for="ufFirstName">ชื่อ</label>
            <input class="input" id="ufFirstName" name="firstName" value="${esc(u?.firstName ?? '')}" maxlength="150">
            <p class="field-error" id="ufFirstNameError" hidden></p>
          </div>
          <div class="field">
            <label for="ufLastName">นามสกุล</label>
            <input class="input" id="ufLastName" name="lastName" value="${esc(u?.lastName ?? '')}" maxlength="150">
          </div>
          <div class="field">
            <label for="ufEmail">อีเมล</label>
            <input class="input" id="ufEmail" name="email" type="email" value="${esc(u?.email ?? '')}" placeholder="somchai@campus.ac.th">
            <p class="field-error" id="ufEmailError" hidden></p>
          </div>
          <div class="field">
            <label for="ufPhone">เบอร์โทรศัพท์</label>
            <input class="input" id="ufPhone" name="phone" value="${esc(u?.phone ?? '')}" placeholder="08x-xxx-xxxx" maxlength="20">
          </div>
          <div class="field">
            <label for="ufAffiliation">สังกัด / รหัสนักศึกษา</label>
            <input class="input" id="ufAffiliation" name="affiliation" value="${esc(u?.affiliation ?? '')}" maxlength="120">
          </div>
          ${isEdit ? '' : `
          <div class="field">
            <label for="ufPassword">รหัสผ่านเริ่มต้น</label>
            <input class="input" id="ufPassword" name="password" type="password" placeholder="อย่างน้อย 8 ตัวอักษร">
            <p class="field-error" id="ufPasswordError" hidden></p>
          </div>`}
        </div>

        <!-- แสดงเฉพาะเมื่อบทบาทเป็นเจ้าหน้าที่ — ใช้ประกอบการคัดกรองและมอบหมายงาน -->
        <section class="form-section" id="officerFields" ${(u?.role ?? 'user') === 'officer' ? '' : 'hidden'}>
          <h3 class="form-section-title">ข้อมูลการปฏิบัติงาน</h3>
          <p class="muted small">ระบบใช้ข้อมูลนี้คัดกรองและแนะนำเจ้าหน้าที่ที่เหมาะสมในหน้ามอบหมายงาน</p>
          <div class="form-grid">
            <div class="field">
              <label for="ufCat">ประเภทงานที่รับผิดชอบ</label>
              <select class="select" id="ufCat" name="cat">
                ${selectOptions(Object.entries(CATEGORIES).map(([k, c]) => [k, c.label]), o.cat)}
              </select>
            </div>
            <div class="field">
              <label for="ufZone">พื้นที่รับผิดชอบ</label>
              <select class="select" id="ufZone" name="zone">
                ${selectOptions(ZONES.map((z) => [z, z]), o.zone)}
              </select>
            </div>
            <div class="field">
              <label for="ufCapacity">จำนวนงานสูงสุดที่รับพร้อมกัน</label>
              <input class="input" id="ufCapacity" name="capacity" type="number" min="1" max="20" value="${o.capacity ?? 3}">
            </div>
            <div class="field">
              <label for="ufShiftStart">เข้าเวรเวลา</label>
              <input class="input" id="ufShiftStart" name="shiftStart" type="time" value="${o.shiftStart ?? '08:00'}">
            </div>
            <div class="field">
              <label for="ufShiftEnd">ออกเวรเวลา</label>
              <input class="input" id="ufShiftEnd" name="shiftEnd" type="time" value="${o.shiftEnd ?? '16:00'}">
            </div>
          </div>
        </section>
      </div>

      <footer class="dlg-foot">
        <button type="button" class="btn btn-ghost" data-action="close-user-form">ยกเลิก</button>
        <button type="submit" class="btn btn-primary" id="ufSubmit">${isEdit ? 'บันทึกการแก้ไข' : 'เพิ่มผู้ใช้งาน'}</button>
      </footer>
    </form>`;

  userDialog.showModal();
  $('ufRole').addEventListener('change', (event) => {
    $('officerFields').hidden = event.target.value !== 'officer';
  });
  $('userForm').addEventListener('submit', (event) => {
    event.preventDefault();
    submitUserForm(isEdit ? u.username : null);
  });
  (isEdit ? $('ufFirstName') : $('ufUsername')).focus();
}

function setFieldError(id, message) {
  const errorEl = $(`${id}Error`);
  if (!errorEl) return;
  errorEl.textContent = message;
  errorEl.hidden = !message;
  $(id).closest('.field').classList.toggle('has-error', Boolean(message));
}

async function submitUserForm(editingUsername) {
  const value = (id) => $(id)?.value.trim() ?? '';
  const role = $('ufRole').value;

  const username = value('ufUsername');
  const firstName = value('ufFirstName');
  const email = value('ufEmail');
  const password = value('ufPassword');

  // ตรวจความถูกต้องเบื้องต้นก่อนส่ง เพื่อให้ผู้ใช้เห็นข้อผิดพลาดตรงช่องที่กรอกผิด
  const checks = [
    ['ufUsername', editingUsername || username ? '' : 'กรุณากรอกชื่อผู้ใช้'],
    ['ufFirstName', firstName ? '' : 'กรุณากรอกชื่อ'],
    ['ufEmail', !email ? 'กรุณากรอกอีเมล' : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? '' : 'รูปแบบอีเมลไม่ถูกต้อง'],
  ];
  if (!editingUsername) checks.push(['ufPassword', password.length >= 8 ? '' : 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร']);

  let firstInvalid = null;
  checks.forEach(([id, message]) => {
    setFieldError(id, message);
    if (message && !firstInvalid) firstInvalid = id;
  });
  if (firstInvalid) {
    $(firstInvalid).focus();
    return;
  }

  const payload = {
    role,
    title: value('ufTitle'),
    firstName,
    lastName: value('ufLastName'),
    email,
    phone: value('ufPhone'),
    affiliation: value('ufAffiliation'),
  };
  if (!editingUsername) {
    payload.username = username;
    payload.password = password;
  }
  if (role === 'officer') {
    payload.officer = {
      cat: $('ufCat').value,
      zone: $('ufZone').value,
      capacity: Number($('ufCapacity').value) || 3,
      shiftStart: $('ufShiftStart').value,
      shiftEnd: $('ufShiftEnd').value,
    };
  }

  const submitBtn = $('ufSubmit');
  submitBtn.disabled = true;
  try {
    if (editingUsername) {
      await api(`/api/users/${encodeURIComponent(editingUsername)}/`, { method: 'PATCH', body: payload });
    } else {
      await api('/api/users/', { method: 'POST', body: payload });
    }
    userDialog.close();
    await refreshUsers();
    toast(editingUsername ? 'บันทึกการแก้ไขแล้ว' : `เพิ่มผู้ใช้งาน ${payload.firstName} แล้ว`, 'success');
  } catch (error) {
    submitBtn.disabled = false;
    toast(`บันทึกไม่สำเร็จ: ${error.message}`, 'error');
  }
}

/* ---------- ตั้งรหัสผ่านใหม่ ---------- */

function openPasswordForm(username) {
  const u = users.find((x) => x.username === username);
  passwordDialog.innerHTML = `
    <form class="dlg" id="passwordForm" novalidate>
      <header class="dlg-head">
        <h2 id="passwordTitle">ตั้งรหัสผ่านใหม่</h2>
        ${closeBtn}
      </header>
      <div class="dlg-body">
        <p class="muted">กำหนดรหัสผ่านใหม่ให้ <b>${esc(u.fullName)}</b> (@${esc(u.username)}) แล้วแจ้งเจ้าตัวให้เปลี่ยนเมื่อเข้าใช้งานครั้งแรก</p>
        <div class="field">
          <label for="pfPassword">รหัสผ่านใหม่</label>
          <input class="input" id="pfPassword" type="password" placeholder="อย่างน้อย 8 ตัวอักษร" autocomplete="new-password">
          <p class="field-error" id="pfPasswordError" hidden></p>
        </div>
      </div>
      <footer class="dlg-foot">
        <button type="button" class="btn btn-ghost" data-action="close-user-form">ยกเลิก</button>
        <button type="submit" class="btn btn-primary">ตั้งรหัสผ่าน</button>
      </footer>
    </form>`;
  passwordDialog.showModal();
  $('pfPassword').focus();

  $('passwordForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const password = $('pfPassword').value;
    if (password.length < 8) {
      setFieldError('pfPassword', 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร');
      return;
    }
    try {
      const result = await api(`/api/users/${encodeURIComponent(username)}/reset-password/`, {
        method: 'POST', body: { password },
      });
      passwordDialog.close();
      toast(result.detail ?? 'ตั้งรหัสผ่านใหม่แล้ว', 'success');
    } catch (error) {
      toast(`ตั้งรหัสผ่านไม่สำเร็จ: ${error.message}`, 'error');
    }
  });
}

/* ---------- เปิด/ปิดการใช้งานบัญชี ---------- */

async function setActive(username, isActive) {
  const u = users.find((x) => x.username === username);
  try {
    if (isActive) {
      await api(`/api/users/${encodeURIComponent(username)}/`, { method: 'PATCH', body: { isActive: true } });
    } else {
      // DELETE ฝั่งเซิร์ฟเวอร์เป็นการปิดการใช้งาน ไม่ได้ลบข้อมูลจริง เพื่อรักษาประวัติไว้
      await api(`/api/users/${encodeURIComponent(username)}/`, { method: 'DELETE' });
    }
    await refreshUsers();
    toast(`${isActive ? 'เปิด' : 'ปิด'}การใช้งานบัญชี ${u.fullName} แล้ว`, 'success');
  } catch (error) {
    toast(`ดำเนินการไม่สำเร็จ: ${error.message}`, 'error');
  }
}

async function confirmDisable(username) {
  const u = users.find((x) => x.username === username);
  const jobs = u.role === 'officer' ? (u.activeJobs ?? 0) : 0;

  const ok = await askConfirm({
    title: 'ปิดการใช้งานบัญชี',
    message: `${u.fullName} จะเข้าสู่ระบบไม่ได้อีก แต่ประวัติการแจ้งเหตุและงานที่เคยทำยังอยู่ครบ`
      + (jobs ? ` เจ้าหน้าที่คนนี้มีงานค้างอยู่ ${jobs} งาน ควรมอบหมายงานให้คนอื่นก่อน` : ''),
    okText: 'ปิดการใช้งาน',
  });
  if (ok) setActive(username, false);
}

/* ---------- Refresh ---------- */

async function refreshUsers() {
  await loadUsers();
  render();
}

/* ---------- Events ---------- */

function clearFilters() {
  Object.assign(view, DEFAULTS);
  $('uSearch').value = '';
  $('searchInput').value = '';
  render();
}

function handleSearch(value) {
  view.q = value;
  $('uSearch').value = value;
  $('searchInput').value = value;
  renderTable();
}

function handlePageAction(action, el) {
  if (action === 'clear-filters') clearFilters();
  if (action === 'role-filter') {
    view.role = view.role === el.dataset.role && el.dataset.role !== '' ? '' : el.dataset.role;
    render();
  }
  if (action === 'new-user') openUserForm();
  if (action === 'edit-user') openUserForm(el.dataset.id);
  if (action === 'reset-password') openPasswordForm(el.dataset.id);
  if (action === 'disable-user') confirmDisable(el.dataset.id);
  if (action === 'enable-user') setActive(el.dataset.id, true);
  if (action === 'close-user-form') {
    userDialog.close();
    passwordDialog.close();
  }
}

const FIELDS = { uRole: 'role', uActive: 'active' };

document.addEventListener('change', (event) => {
  if (!has(FIELDS, event.target.id)) return;
  view[FIELDS[event.target.id]] = event.target.value;
  render();
});

$('uSearch').addEventListener('input', (event) => handleSearch(event.target.value));

[userDialog, passwordDialog].forEach((dlg) => {
  dlg.addEventListener('click', (event) => {
    if (event.target === dlg) dlg.close();
  });
});

/* ---------- Init ---------- */

// ต้องรอให้ CATEGORIES / ZONES โหลดเสร็จก่อน เพราะฟอร์มเจ้าหน้าที่ใช้เป็นตัวเลือก
async function onReady() {
  readParams();
  $('uSearch').value = view.q;
  $('searchInput').value = view.q;
  await loadUsers();
}

boot();

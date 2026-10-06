'use strict';

/* ตัวช่วยที่ใช้ร่วมกันทุกหน้า (login / register / forgot-password)
   โหลดไฟล์นี้ก่อนสคริปต์ของแต่ละหน้า แล้วเรียกใช้ผ่าน Auth.xxx */

// ไอคอน SVG — ใช้ผ่าน <use href="#i-ชื่อ">
const ICON_SPRITE = `
<svg class="sprite" aria-hidden="true" focusable="false">
  <symbol id="i-user" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></symbol>
  <symbol id="i-lock" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></symbol>
  <symbol id="i-mail" viewBox="0 0 24 24"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></symbol>
  <symbol id="i-arrow-left" viewBox="0 0 24 24"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></symbol>
  <symbol id="i-eye" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></symbol>
  <symbol id="i-eye-off" viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></symbol>
  <symbol id="i-alert" viewBox="0 0 24 24"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></symbol>
  <symbol id="i-clipboard" viewBox="0 0 24 24"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></symbol>
  <symbol id="i-bell" viewBox="0 0 24 24"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></symbol>
  <symbol id="i-check" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></symbol>
</svg>`;

const Auth = (() => {
  const $ = (id) => document.getElementById(id);
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

  // แสดง/ซ่อนข้อความผิดพลาดใต้ช่องกรอก (ข้อความอยู่ใน #<id ของช่อง>Error)
  function setFieldError(input, message) {
    const errorEl = $(`${input.id}Error`);
    const hasError = Boolean(message);
    input.closest('.field').classList.toggle('has-error', hasError);
    input.setAttribute('aria-invalid', String(hasError));
    errorEl.textContent = message;
    errorEl.hidden = !hasError;
  }

  // แบนเนอร์ด้านบนฟอร์ม type = 'error' | 'success'
  function showBanner(type, message) {
    const banner = $('banner');
    banner.className = `banner banner--${type}`;
    $('bannerIcon').firstElementChild.setAttribute('href', type === 'success' ? '#i-check' : '#i-alert');
    $('bannerText').textContent = message;
    banner.hidden = false;
    banner.scrollIntoView({ block: 'nearest' });
  }

  function hideBanner() {
    $('banner').hidden = true;
  }

  // ปุ่มที่มี <span class="btn-label"> ข้างใน
  function setLoading(button, isLoading, loadingText) {
    const label = button.querySelector('.btn-label');
    if (isLoading) {
      label.dataset.idle = label.textContent;
      label.textContent = loadingText;
    } else if (label.dataset.idle) {
      label.textContent = label.dataset.idle;
    }
    button.disabled = isLoading;
    button.setAttribute('aria-busy', String(isLoading));
  }

  function shake(element) {
    element.classList.remove('shake');
    void element.offsetWidth; // รีสตาร์ท animation
    element.classList.add('shake');
  }

  // เมื่อผู้ใช้พิมพ์ใหม่ ให้ล้างข้อความผิดพลาดของช่องนั้นและแบนเนอร์
  function clearErrorsOnInput(inputs) {
    inputs.forEach((input) => {
      input.addEventListener('input', () => {
        setFieldError(input, '');
        hideBanner();
      });
    });
  }

  // ปุ่มตา: <button data-toggle-password="<id ของช่องรหัสผ่าน>">
  function bindPasswordToggles() {
    document.querySelectorAll('[data-toggle-password]').forEach((button) => {
      const input = $(button.dataset.togglePassword);
      const icon = button.querySelector('use');
      button.addEventListener('click', () => {
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        button.setAttribute('aria-pressed', String(show));
        button.setAttribute('aria-label', show ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน');
        icon.setAttribute('href', show ? '#i-eye-off' : '#i-eye');
      });
    });
  }

  /* ---------- การเรียก API ----------
     Django ใช้ session cookie + CSRF token
     - cookie ติดไปเองทุกคำขอ (credentials: 'same-origin')
     - แต่ POST ต้องแนบ header X-CSRFToken ด้วย มิฉะนั้นจะได้ 403
     ต้องเปิดหน้าเว็บผ่าน http://127.0.0.1:8000/... (ที่ Django เสิร์ฟ)
     ไม่ใช่ file:// มิฉะนั้นคุกกี้จะใช้ไม่ได้ */

  const readCookie = (name) =>
    document.cookie.split('; ').find((row) => row.startsWith(`${name}=`))?.split('=')[1] ?? '';

  async function csrfToken() {
    const existing = readCookie('csrftoken');
    if (existing) return existing;
    // ยังไม่มีคุกกี้ — ขอจากเซิร์ฟเวอร์ครั้งแรก
    const response = await fetch('/api/auth/csrf', { credentials: 'same-origin' });
    if (!response.ok) throw new Error('csrf');
    const data = await response.json();
    return data.csrfToken;
  }

  /**
   * เรียก API แล้วคืน { ok, status, data }
   * ไม่ throw เมื่อเซิร์ฟเวอร์ตอบ 4xx/5xx — ให้ผู้เรียกตัดสินใจจาก status เอง
   * (throw เฉพาะตอนต่อเน็ตไม่ได้จริงๆ)
   */
  async function api(path, { method = 'GET', body, headers = {} } = {}) {
    const options = { method, credentials: 'same-origin', headers: { ...headers } };

    if (method !== 'GET' && method !== 'HEAD') {
      options.headers['X-CSRFToken'] = await csrfToken();
    }
    if (body !== undefined) {
      if (body instanceof FormData) {
        options.body = body; // ให้เบราว์เซอร์ตั้ง Content-Type เอง (มี boundary)
      } else {
        options.headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(body);
      }
    }

    const response = await fetch(path, options);
    let data = null;
    try {
      data = await response.json();
    } catch {
      // บางคำตอบไม่มี body เช่น 204
    }
    return { ok: response.ok, status: response.status, data };
  }

  document.body.insertAdjacentHTML('afterbegin', ICON_SPRITE);
  bindPasswordToggles();

  const yearEl = $('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear() + 543; // พ.ศ.

  return { $, wait, isEmail, setFieldError, showBanner, hideBanner, setLoading, shake, clearErrorsOnInput, api };
})();

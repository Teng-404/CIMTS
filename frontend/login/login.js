'use strict';

const { $, wait, setFieldError, showBanner, hideBanner, setLoading, shake, clearErrorsOnInput, api } = Auth;

const CONFIG = {
  // true = จำลองการล็อกอินในหน้าเว็บ (สำหรับทดสอบ UI) / false = เรียก API จริง
  demoMode: false,
  apiUrl: '/api/auth/login',
  // หน้าปลายทางมาจากเซิร์ฟเวอร์ตามบทบาทของผู้ใช้ (admin / officer / user)
  // ค่านี้ใช้เฉพาะตอน demoMode หรือเมื่อเซิร์ฟเวอร์ไม่ได้ส่ง home กลับมา
  fallbackRedirectUrl: '../admin/admin.html',
  redirectDelayMs: 700,
  // บัญชีทดสอบสำหรับ demoMode เท่านั้น — ลบออกเมื่อใช้งานจริง
  demoAccount: { username: 'admin', password: 'admin1234' },
  rememberKey: 'campuscare.rememberedUser',
};

const els = {
  card: $('formCard'),
  form: $('loginForm'),
  username: $('username'),
  password: $('password'),
  remember: $('remember'),
  submit: $('submitBtn'),
};

/* ---------- Validation ---------- */

function validate() {
  const username = els.username.value.trim();
  const password = els.password.value;

  setFieldError(els.username, username ? '' : 'กรุณากรอกชื่อผู้ใช้หรืออีเมล');
  setFieldError(els.password, password ? '' : 'กรุณากรอกรหัสผ่าน');

  const firstInvalid = !username ? els.username : !password ? els.password : null;
  if (firstInvalid) firstInvalid.focus();
  return !firstInvalid;
}

/* ---------- Remember me (เก็บเฉพาะชื่อผู้ใช้ ไม่เก็บรหัสผ่าน) ---------- */

function loadRememberedUser() {
  try {
    return localStorage.getItem(CONFIG.rememberKey) || '';
  } catch {
    return '';
  }
}

function saveRememberedUser(username) {
  try {
    if (els.remember.checked) localStorage.setItem(CONFIG.rememberKey, username);
    else localStorage.removeItem(CONFIG.rememberKey);
  } catch {
    // ใช้ localStorage ไม่ได้ (เช่น โหมดส่วนตัว) — ข้ามไป
  }
}

/* ---------- Authentication ---------- */

async function authenticate(username, password) {
  if (CONFIG.demoMode) {
    await wait(900);
    const account = CONFIG.demoAccount;
    const ok = username === account.username && password === account.password;
    return ok ? { ok: true, home: CONFIG.fallbackRedirectUrl } : { ok: false, message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' };
  }

  const { ok, status, data } = await api(CONFIG.apiUrl, {
    method: 'POST',
    body: { username, password },
  });

  // เซิร์ฟเวอร์ส่ง home มาตามบทบาท เช่น ../officer/jobs.html
  if (ok) return { ok: true, home: data?.home || CONFIG.fallbackRedirectUrl, user: data?.user };

  return {
    ok: false,
    message: status === 401
      ? 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง'
      : 'ระบบขัดข้อง กรุณาลองใหม่อีกครั้งภายหลัง',
  };
}

/* ---------- Events ---------- */

els.form.addEventListener('submit', async (event) => {
  event.preventDefault();
  hideBanner();
  if (!validate()) return;

  const username = els.username.value.trim();
  let redirecting = false;

  setLoading(els.submit, true, 'กำลังเข้าสู่ระบบ…');
  try {
    const result = await authenticate(username, els.password.value);

    if (!result.ok) {
      showBanner('error', result.message);
      shake(els.card);
      els.password.value = '';
      els.password.focus({ preventScroll: true });
      return;
    }

    saveRememberedUser(username);
    showBanner('success', 'เข้าสู่ระบบสำเร็จ');
    if (result.home) {
      redirecting = true;
      setTimeout(() => window.location.assign(result.home), CONFIG.redirectDelayMs);
    }
  } catch {
    showBanner('error', 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่อีกครั้ง');
  } finally {
    if (!redirecting) setLoading(els.submit, false);
  }
});

clearErrorsOnInput([els.username, els.password]);

/* ---------- Init ---------- */

const rememberedUser = loadRememberedUser();
if (rememberedUser) {
  els.username.value = rememberedUser;
  els.remember.checked = true;
  els.password.focus();
} else {
  els.username.focus();
}

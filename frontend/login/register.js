'use strict';

const { $, wait, isEmail, setFieldError, showBanner, hideBanner, setLoading, shake, clearErrorsOnInput, api } = Auth;

const CONFIG = {
  // true = จำลองการสมัครในหน้าเว็บ (สำหรับทดสอบ UI) / false = เรียก API จริง
  demoMode: false,
  apiUrl: '/api/auth/register',
  // หน้าที่จะไปต่อหลังสมัครสำเร็จ (เว้นว่าง = ไม่เปลี่ยนหน้า)
  redirectUrl: 'login.html',
  redirectDelayMs: 1500,
  // อีเมลที่ "ถูกใช้งานแล้ว" สำหรับทดสอบกรณีอีเมลซ้ำใน demoMode เท่านั้น
  demoTakenEmail: 'admin@campus.ac.th',
};

const els = {
  card: $('formCard'),
  form: $('registerForm'),
  firstName: $('firstName'),
  lastName: $('lastName'),
  email: $('email'),
  password: $('password'),
  confirmPassword: $('confirmPassword'),
  terms: $('terms'),
  submit: $('submitBtn'),
  strength: $('strength'),
  strengthLabel: $('strengthLabel'),
  rules: document.querySelectorAll('#passwordRules li'),
};

/* ---------- Password rules & strength ---------- */

const PASSWORD_RULES = {
  length: (password) => password.length >= 8,
  letter: (password) => /\p{L}/u.test(password),
  number: (password) => /\d/.test(password),
};

const STRENGTH_LABELS = ['', 'อ่อน', 'พอใช้', 'ดี', 'แข็งแรง'];

const passwordMeetsRules = (password) => Object.values(PASSWORD_RULES).every((test) => test(password));

function strengthLevel(password) {
  if (!password) return 0;
  const points = [
    password.length >= 8,
    /[a-z]/.test(password) && /[A-Z]/.test(password),
    /\d/.test(password),
    /[^A-Za-z0-9]/.test(password) || password.length >= 12,
  ].filter(Boolean).length;
  return Math.max(points, 1);
}

function updatePasswordFeedback() {
  const password = els.password.value;
  const level = strengthLevel(password);
  els.strength.dataset.level = String(level);
  els.strengthLabel.textContent = STRENGTH_LABELS[level];
  els.rules.forEach((item) => item.classList.toggle('met', PASSWORD_RULES[item.dataset.rule](password)));
}

/* ---------- Validation ---------- */

function validate() {
  const firstName = els.firstName.value.trim();
  const lastName = els.lastName.value.trim();
  const email = els.email.value.trim();
  const { value: password } = els.password;
  const { value: confirmPassword } = els.confirmPassword;

  const checks = [
    [els.firstName, firstName ? '' : 'กรุณากรอกชื่อ'],
    [els.lastName, lastName ? '' : 'กรุณากรอกนามสกุล'],
    [els.email, !email ? 'กรุณากรอกอีเมล' : !isEmail(email) ? 'รูปแบบอีเมลไม่ถูกต้อง' : ''],
    [els.password, !password ? 'กรุณากรอกรหัสผ่าน' : !passwordMeetsRules(password) ? 'รหัสผ่านยังไม่ตรงตามเงื่อนไข' : ''],
    [els.confirmPassword, !confirmPassword ? 'กรุณายืนยันรหัสผ่าน' : confirmPassword !== password ? 'รหัสผ่านไม่ตรงกัน' : ''],
    [els.terms, els.terms.checked ? '' : 'กรุณายอมรับเงื่อนไขการใช้งาน'],
  ];

  let firstInvalid = null;
  for (const [input, message] of checks) {
    setFieldError(input, message);
    if (message && !firstInvalid) firstInvalid = input;
  }
  if (firstInvalid) firstInvalid.focus();
  return !firstInvalid;
}

/* ---------- Registration ---------- */

async function register(payload) {
  if (CONFIG.demoMode) {
    await wait(1000);
    return payload.email.toLowerCase() === CONFIG.demoTakenEmail
      ? { ok: false, message: 'อีเมลนี้ถูกใช้งานแล้ว' }
      : { ok: true };
  }

  const { ok, status, data } = await api(CONFIG.apiUrl, { method: 'POST', body: payload });

  if (ok) return { ok: true };

  // เซิร์ฟเวอร์อาจส่งรายละเอียดข้อผิดพลาดรายช่องมา เช่น รหัสผ่านง่ายเกินไป
  const fieldError = data && !data.detail
    ? Object.values(data).flat().find((m) => typeof m === 'string')
    : null;

  return {
    ok: false,
    message: status === 409
      ? 'อีเมลนี้ถูกใช้งานแล้ว'
      : fieldError || 'ไม่สามารถสมัครสมาชิกได้ กรุณาลองใหม่อีกครั้งภายหลัง',
  };
}

/* ---------- Events ---------- */

els.form.addEventListener('submit', async (event) => {
  event.preventDefault();
  hideBanner();
  if (!validate()) return;

  const payload = {
    firstName: els.firstName.value.trim(),
    lastName: els.lastName.value.trim(),
    email: els.email.value.trim(),
    password: els.password.value,
  };
  let redirecting = false;

  setLoading(els.submit, true, 'กำลังสร้างบัญชี…');
  try {
    const result = await register(payload);

    if (!result.ok) {
      showBanner('error', result.message);
      shake(els.card);
      return;
    }

    showBanner('success', 'สมัครสมาชิกสำเร็จ');
    if (CONFIG.redirectUrl) {
      redirecting = true;
      setTimeout(() => window.location.assign(CONFIG.redirectUrl), CONFIG.redirectDelayMs);
    }
  } catch {
    showBanner('error', 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่อีกครั้ง');
  } finally {
    if (!redirecting) setLoading(els.submit, false);
  }
});

els.password.addEventListener('input', updatePasswordFeedback);

clearErrorsOnInput([els.firstName, els.lastName, els.email, els.password, els.confirmPassword, els.terms]);

/* ---------- Init ---------- */

updatePasswordFeedback();
els.firstName.focus();

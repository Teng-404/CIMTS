'use strict';

const { $, wait, isEmail, setFieldError, showBanner, hideBanner, setLoading, shake, clearErrorsOnInput } = Auth;

const CONFIG = {
  // true = จำลองการส่งอีเมลในหน้าเว็บ (สำหรับทดสอบ UI) / false = เรียก API จริง
  demoMode: true,
  // เซิร์ฟเวอร์ควรตอบ 2xx เสมอ ไม่ว่าอีเมลนั้นจะมีในระบบหรือไม่ (ป้องกันการเดาว่าใครมีบัญชี)
  apiUrl: '/api/auth/forgot-password',
  // ระยะเวลารอก่อนกดส่งอีกครั้งได้ (วินาที)
  cooldownSeconds: 60,
};

const els = {
  card: $('formCard'),
  requestView: $('requestView'),
  sentView: $('sentView'),
  form: $('forgotForm'),
  email: $('email'),
  submit: $('submitBtn'),
  sentTitle: $('sentTitle'),
  sentEmail: $('sentEmail'),
  resend: $('resendBtn'),
  resendLabel: $('resendBtn').querySelector('.btn-label'),
  resendStatus: $('resendStatus'),
  changeEmail: $('changeEmailBtn'),
};

let currentEmail = '';
let cooldownTimer = null;

/* ---------- Request ---------- */

async function requestReset(email) {
  if (CONFIG.demoMode) {
    await wait(900);
    return { ok: true };
  }

  const response = await fetch(CONFIG.apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });

  return response.ok
    ? { ok: true }
    : { ok: false, message: 'ส่งลิงก์ไม่สำเร็จ กรุณาลองใหม่อีกครั้งภายหลัง' };
}

/* ---------- Views ---------- */

function showSentView(email) {
  currentEmail = email;
  els.sentEmail.textContent = email;
  setResendStatus('', '');
  els.requestView.hidden = true;
  els.sentView.hidden = false;
  startCooldown();
  els.sentTitle.focus();
}

function showRequestView() {
  clearInterval(cooldownTimer);
  els.sentView.hidden = true;
  els.requestView.hidden = false;
  els.email.focus();
  els.email.select();
}

function setResendStatus(type, message) {
  els.resendStatus.className = type ? `status status--${type}` : 'status';
  els.resendStatus.textContent = message;
}

function startCooldown() {
  clearInterval(cooldownTimer);
  let remaining = CONFIG.cooldownSeconds;

  const render = () => {
    els.resendLabel.textContent = `ส่งอีกครั้งได้ใน ${remaining} วินาที`;
  };

  els.resend.disabled = true;
  render();

  cooldownTimer = setInterval(() => {
    remaining -= 1;
    if (remaining > 0) {
      render();
      return;
    }
    clearInterval(cooldownTimer);
    els.resendLabel.textContent = 'ส่งอีกครั้ง';
    els.resend.disabled = false;
  }, 1000);
}

/* ---------- Events ---------- */

els.form.addEventListener('submit', async (event) => {
  event.preventDefault();
  hideBanner();

  const email = els.email.value.trim();
  const message = !email ? 'กรุณากรอกอีเมล' : !isEmail(email) ? 'รูปแบบอีเมลไม่ถูกต้อง' : '';
  setFieldError(els.email, message);
  if (message) {
    els.email.focus();
    return;
  }

  setLoading(els.submit, true, 'กำลังส่งลิงก์…');
  try {
    const result = await requestReset(email);

    if (!result.ok) {
      showBanner('error', result.message);
      shake(els.card);
      return;
    }

    showSentView(email);
  } catch {
    showBanner('error', 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่อีกครั้ง');
  } finally {
    setLoading(els.submit, false);
  }
});

els.resend.addEventListener('click', async () => {
  setResendStatus('', '');
  setLoading(els.resend, true, 'กำลังส่ง…');

  let sent = false;
  try {
    const result = await requestReset(currentEmail);
    sent = result.ok;
    setResendStatus(sent ? 'success' : 'error', sent ? 'ส่งลิงก์ให้อีกครั้งแล้ว' : result.message);
  } catch {
    setResendStatus('error', 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่อีกครั้ง');
  }

  setLoading(els.resend, false);
  if (sent) startCooldown();
});

els.changeEmail.addEventListener('click', showRequestView);

clearErrorsOnInput([els.email]);

/* ---------- Init ---------- */

els.email.focus();

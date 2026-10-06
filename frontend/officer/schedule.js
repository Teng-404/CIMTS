'use strict';

/* หน้าตารางเข้าเวร — ตารางเข้าเวรรายสัปดาห์ของฉัน เลื่อนดูสัปดาห์ก่อนหน้า/ถัดไปได้
   ข้อมูล และเมนูมาจาก shared.js (ต้องโหลดก่อนไฟล์นี้)

   เวลาเข้าเวรดึงจากโปรไฟล์จริงของเจ้าหน้าที่ (/api/auth/me -> officer.shiftStart/shiftEnd)
   ส่วนรูปแบบวันยังเป็นจันทร์-ศุกร์ทำงาน เสาร์-อาทิตย์หยุด เพราะ backend ยังไม่มีตารางเวรรายวัน
   หากต้องการกำหนดเวรรายวันได้เอง ต้องเพิ่ม model ตารางเวรในฝั่ง backend ก่อน */

mountShell('schedule');

const DAY_NAMES = ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์', 'อาทิตย์'];
const DAY_NAMES_SHORT = ['จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.', 'อา.'];
const MONTH_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

// ช่วงเวลาเข้าเวรของเจ้าหน้าที่คนนี้ (เติมจากโปรไฟล์จริงใน onReady)
// null = วันหยุด (ดัชนี 0 = จันทร์)
let SHIFT_PATTERN = [null, null, null, null, null, null, null];
let shiftHours = 8;

let weekOffset = 0;

function startOfThisWeek() {
  const now = new Date();
  const mondayIndex = (now.getDay() + 6) % 7; // แปลงให้จันทร์ = 0
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayIndex);
  return monday;
}

function weekDates(offset) {
  const monday = startOfThisWeek();
  return Array.from({ length: 7 }, (_, i) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i + offset * 7));
}

const isSameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

function renderWeek() {
  const dates = weekDates(weekOffset);
  const today = new Date();
  const first = dates[0];
  const last = dates[6];
  const sameMonth = first.getMonth() === last.getMonth();

  $('weekLabel').textContent = sameMonth
    ? `${first.getDate()} – ${last.getDate()} ${MONTH_SHORT[first.getMonth()]} ${first.getFullYear() + 543}`
    : `${first.getDate()} ${MONTH_SHORT[first.getMonth()]} – ${last.getDate()} ${MONTH_SHORT[last.getMonth()]} ${last.getFullYear() + 543}`;

  $('weekNav').innerHTML = `
    <button type="button" class="icon-btn icon-btn--sm" data-action="week-prev" aria-label="สัปดาห์ก่อนหน้า">${icon('chevron-left')}</button>
    ${weekOffset !== 0 ? `<button type="button" class="btn btn-ghost btn-sm" data-action="week-today">สัปดาห์นี้</button>` : ''}
    <button type="button" class="icon-btn icon-btn--sm" data-action="week-next" aria-label="สัปดาห์ถัดไป">${icon('chevron-right')}</button>`;

  $('weekGrid').innerHTML = dates.map((d, i) => {
    const shift = SHIFT_PATTERN[i];
    const isToday = isSameDay(d, today);
    return `
      <div class="week-day${isToday ? ' week-day--today' : ''}${shift ? '' : ' week-day--off'}">
        <div class="week-day-name">${DAY_NAMES_SHORT[i]}</div>
        <div class="week-day-date">${d.getDate()}</div>
        <div class="week-day-shift${shift ? '' : ' is-off'}">${shift ?? 'วันหยุด'}</div>
      </div>`;
  }).join('');

  const workDays = SHIFT_PATTERN.filter(Boolean).length;
  const totalHours = workDays * shiftHours;
  $('weekSummary').textContent = `เข้าเวรสัปดาห์นี้ ${workDays} วัน · รวม ${totalHours} ชั่วโมง`;
}

/* ---------- Events ---------- */

function handlePageAction(action) {
  if (action === 'week-prev') weekOffset -= 1;
  if (action === 'week-next') weekOffset += 1;
  if (action === 'week-today') weekOffset = 0;
  renderWeek();
}

/* ---------- Init ---------- */

// ใช้เวลาเข้าเวรจริงของเจ้าหน้าที่ที่ล็อกอินอยู่ (boot เรียกให้หลังโหลด /api/auth/me เสร็จ)
function onReady() {
  const { shiftStart, shiftEnd } = state.shift ?? {};
  if (!shiftStart || !shiftEnd) return;

  const label = `${shiftStart} – ${shiftEnd}`;
  SHIFT_PATTERN = [label, label, label, label, label, null, null];

  // ชั่วโมงต่อวัน ใช้คำนวณยอดรวมท้ายตาราง (รองรับเวรข้ามเที่ยงคืน)
  const toMinutes = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const span = toMinutes(shiftEnd) - toMinutes(shiftStart);
  shiftHours = Math.round((span > 0 ? span : span + 24 * 60) / 60);
}

function render() {
  renderWeek();
  renderShellCounts();
}

boot();

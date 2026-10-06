'use strict';

/* หน้าเบอร์ติดต่อฉุกเฉิน — รายชื่อและเบอร์โทรสำหรับติดต่อโดยตรงเมื่อเป็นเหตุฉุกเฉินจริง
   ไม่ผ่านคิวมอบหมายงานเหมือนการแจ้งเหตุทั่วไป เพราะเหตุที่เป็นอันตรายถึงชีวิตต้องการความช่วยเหลือทันที
   เมนูมาจาก shared.js (ต้องโหลดก่อนไฟล์นี้) */

mountShell('contacts');

// เบอร์ตัวอย่างทั้งหมด (ข้อมูลสมมติ) ยกเว้นเบอร์หน่วยงานภายนอกซึ่งเป็นเบอร์จริงของประเทศไทย
const INTERNAL_CONTACTS = [
  { name: 'ศูนย์รักษาความปลอดภัย (ตลอด 24 ชม.)', phone: '021234567', ext: '191', desc: 'เหตุฉุกเฉินในพื้นที่มหาวิทยาลัย เช่น อัคคีภัย อุบัติเหตุ หรือมีผู้บุกรุก' },
  { name: 'ห้องพยาบาล / หน่วยปฐมพยาบาล', phone: '021234567', ext: '199', desc: 'เจ็บป่วยหรือได้รับบาดเจ็บฉุกเฉินภายในมหาวิทยาลัย' },
  { name: 'งานอาคารสถานที่ (นอกเวลาทำการ)', phone: '021234567', ext: '150', desc: 'ไฟฟ้า ประปา หรือระบบอาคารขัดข้องรุนแรงนอกเวลาทำการ' },
  { name: 'ศูนย์เทคโนโลยีสารสนเทศ (นอกเวลาทำการ)', phone: '021234567', ext: '160', desc: 'ระบบเครือข่ายหรือเซิร์ฟเวอร์หลักของมหาวิทยาลัยล่มนอกเวลาทำการ' },
];

const EXTERNAL_CONTACTS = [
  { name: 'แจ้งเหตุด่วนเหตุร้าย (ตำรวจ)', phone: '191', desc: 'คดีอาญา ผู้บุกรุกมีอาวุธ หรือเหตุร้ายที่ต้องการตำรวจโดยตรง' },
  { name: 'แจ้งเหตุเพลิงไหม้ (ดับเพลิง)', phone: '199', desc: 'เพลิงไหม้ที่ลุกลามเกินกว่าจะควบคุมได้เอง' },
  { name: 'การแพทย์ฉุกเฉิน (สายด่วน)', phone: '1669', desc: 'เจ็บป่วยหรือบาดเจ็บรุนแรงที่ต้องการรถพยาบาลด่วน' },
];

const fmtDisplay = (c) => (c.ext ? `${c.phone.slice(0, 2)}-${c.phone.slice(2, 5)}-${c.phone.slice(5)} ต่อ ${c.ext}` : c.phone);
const telHref = (c) => `tel:${c.phone}${c.ext ? `,${c.ext}` : ''}`;

function contactCardHtml(c) {
  return `
    <div class="contact-card">
      <span class="contact-icon">${icon('phone')}</span>
      <div class="contact-body">
        <strong>${esc(c.name)}</strong>
        <p>${esc(c.desc)}</p>
        <a class="btn btn-primary contact-call" href="${telHref(c)}">${icon('phone', 'icon--xs')}${esc(fmtDisplay(c))}</a>
      </div>
    </div>`;
}

function render() {
  $('emergencyBanner').innerHTML = `
    <span class="emergency-icon">${icon('alert')}</span>
    <div class="emergency-text">
      <strong>เหตุที่เป็นอันตรายถึงชีวิตหรือทรัพย์สินร้ายแรง ให้โทรแจ้งทันที</strong>
      <span>อย่ารอผลการแจ้งเหตุในระบบ — โทรควบคู่กันไปได้เลย แล้วค่อยแจ้งเหตุในระบบเพื่อบันทึกรายละเอียดภายหลัง</span>
    </div>`;

  $('internalContacts').innerHTML = INTERNAL_CONTACTS.map(contactCardHtml).join('');
  $('externalContacts').innerHTML = EXTERNAL_CONTACTS.map(contactCardHtml).join('');
  renderShellCounts();
}

/* ---------- Init ---------- */

boot();

/* أدوات عامة مشتركة */

const SERIAL_ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function genSerial() {
  const d = new Date();
  const ymd = String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
  let s = '';
  crypto.getRandomValues(new Uint8Array(6)).forEach((x) => { s += SERIAL_ABC[x % SERIAL_ABC.length]; });
  return 'PP-' + ymd + '-' + s;
}

export function today() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

export const fmt = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const nz = (v) => parseFloat(v) || 0;

export function baseName(n) {
  return n.replace(/\.[^.]+$/, '').replace(/[^\w\u0600-\u06FF-]+/g, '_').slice(0, 60) || 'file';
}

export const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

export const normPhone = (p) => String(p || '').replace(/\D/g, '');

export const typeLabel = (t) => (t === 'quote' ? 'عرض السعر' : t === 'boq' ? 'المقايسة' : 'الفاتورة');
export const typeName = (t) => (t === 'quote' ? 'عرض سعر' : t === 'boq' ? 'مقايسة' : t === 'album' ? 'ألبوم صور' : t === 'stamp' ? 'ملف مختوم' : 'فاتورة');

export const pagesLabel = (n) => (n > 2 ? n + ' صفحات' : n === 2 ? 'صفحتان' : 'صفحة واحدة');

/* إجماليات الفاتورة/العرض */
export function totals(items, disc, vr) {
  const sub = items.reduce((s, i) => s + nz(i.q) * nz(i.p), 0);
  const after = Math.max(0, sub - nz(disc));
  const vat = (after * nz(vr)) / 100;
  return { sub, after, vat, total: after + vat };
}

export const secTotal = (s) => (s.items || []).reduce((a, i) => a + nz(i.q) * nz(i.p), 0);
export const boqTotal = (secs) => (secs || []).reduce((a, s) => a + secTotal(s), 0);

/* تطبيع رقم واتساب */
export function waNum(ph, cc) {
  let d = String(ph || '').trim();
  if (!d) return '';
  const plus = d.startsWith('+') || d.startsWith('00');
  d = d.replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  cc = String(cc || '').replace(/\D/g, '');
  if (!plus) {
    if (cc) {
      if (d.startsWith('0')) d = cc + d.slice(1);
      else if (!d.startsWith(cc)) d = cc + d;
    } else if (d.startsWith('0')) return 'NOCC';
  }
  return d;
}

export const msgText = (what, no) => 'السلام عليكم، مرفق ' + what + ' رقم ' + no + ' من شركة بوينت أب.';

export const verifyUrl = (serial) => location.origin + '/?verify=' + encodeURIComponent(serial);
export const verifyShort = (serial) => location.host + '/?verify=' + serial;

export function errMsg(e) {
  return (e && (e.message || e.error_description)) || 'خطأ غير معروف';
}

export function loadImg(src) {
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('تعذر تحميل الصورة'));
    i.src = src;
  });
}

/* تصغير صورة إلى Blob بصيغة JPEG */
export async function shrinkToBlob(file, max, quality) {
  const url = URL.createObjectURL(file);
  try {
    const im = await loadImg(url);
    const sc = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(im.naturalWidth * sc);
    c.height = Math.round(im.naturalHeight * sc);
    const x = c.getContext('2d');
    x.fillStyle = '#fff';
    x.fillRect(0, 0, c.width, c.height);
    x.drawImage(im, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', quality));
    if (!blob) throw new Error('تعذر قراءة الصورة');
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function copyText(t) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(t); return true; }
  } catch (e) { /* fallback below */ }
  try {
    const a = document.createElement('textarea');
    a.value = t;
    a.style.cssText = 'position:fixed;top:0;opacity:0';
    document.body.appendChild(a);
    a.focus();
    a.select();
    const ok = document.execCommand('copy');
    a.remove();
    return ok;
  } catch (e) { return false; }
}

/* تفضيلات شخصية بسيطة في localStorage */
export function getPref(k, d) {
  try { const v = localStorage.getItem('pp-' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; }
}
export function setPref(k, v) {
  try { localStorage.setItem('pp-' + k, JSON.stringify(v)); } catch (e) { /* ignore */ }
}

/* اللوجو والعلامة المائية المشتركة */
import { today, verifyShort } from './util.js';

export const LOGO_URL = '/logo.png';
export const FONT = 'Tajawal,Arial,sans-serif';

let logoP = null;
export function logo() {
  if (!logoP) {
    logoP = new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => { logoP = null; rej(new Error('تعذر تحميل اللوجو')); };
      i.src = LOGO_URL;
    });
  }
  return logoP;
}

let logoBytesP = null;
export function logoBytes() {
  if (!logoBytesP) logoBytesP = fetch(LOGO_URL).then((r) => r.arrayBuffer()).catch((e) => { logoBytesP = null; throw e; });
  return logoBytesP;
}

/* انتظر الخط واللوجو قبل أي رسم على Canvas */
export async function ready() {
  const im = await logo();
  try {
    await Promise.all([document.fonts.load('400 26px Tajawal'), document.fonts.load('700 26px Tajawal'), document.fonts.load('800 26px Tajawal')]);
  } catch (e) { /* الخط الاحتياطي */ }
  return im;
}

/* شبكة لوجو مائلة −30° + الرقم التسلسلي + شريط سفلي */
export function paintMark(x, w, h, op, serial, date, logoImg) {
  const lw = Math.min(w, h) * 0.28, lh = (lw * logoImg.naturalHeight) / logoImg.naturalWidth, gx = lw * 1.5, gy = lh * 2.7, R = Math.hypot(w, h) / 2, fs = Math.max(10, Math.round(lw * 0.09));
  x.save();
  x.translate(w / 2, h / 2);
  x.rotate(-Math.PI / 6);
  x.globalAlpha = op;
  x.textAlign = 'center';
  x.direction = 'ltr';
  x.font = 'bold ' + fs + 'px sans-serif';
  x.lineWidth = fs * 0.12;
  x.strokeStyle = '#000';
  x.fillStyle = '#fff';
  let row = 0;
  for (let yy = -R; yy < R; yy += gy, row++) {
    for (let xx = -R + (row % 2 ? gx / 2 : 0); xx < R; xx += gx) {
      x.drawImage(logoImg, xx - lw / 2, yy - lh / 2, lw, lh);
      x.strokeText(serial, xx, yy + lh / 2 + fs * 1.3);
      x.fillText(serial, xx, yy + lh / 2 + fs * 1.3);
    }
  }
  x.restore();
  const fh = Math.max(30, Math.round(h * 0.04));
  x.save();
  x.fillStyle = 'rgba(15,12,8,0.78)';
  x.fillRect(0, h - fh, w, fh);
  x.fillStyle = '#f2c85b';
  x.textBaseline = 'middle';
  x.font = 'bold ' + Math.round(fh * 0.5) + 'px sans-serif';
  x.textAlign = 'right';
  x.direction = 'rtl';
  const brand = 'بوينت أب  |  Point Up';
  x.fillText(brand, w - fh * 0.4, h - fh / 2);
  const room = w - fh * 1.4 - x.measureText(brand).width;
  const left = serial + '   ' + (date || today()) + (serial !== 'DRAFT' ? '   ' + verifyShort(serial) : '');
  let px = Math.round(fh * 0.5);
  x.direction = 'ltr';
  x.textAlign = 'left';
  x.font = 'bold ' + px + 'px sans-serif';
  while (px > 9 && x.measureText(left).width > room) { px--; x.font = 'bold ' + px + 'px sans-serif'; }
  x.fillText(left, fh * 0.4, h - fh / 2);
  x.restore();
}

export function newPage(W = 1240, H = 1754) {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const x = c.getContext('2d');
  x.fillStyle = '#fff';
  x.fillRect(0, 0, W, H);
  x.direction = 'rtl';
  x.textBaseline = 'alphabetic';
  return [c, x];
}

/* رسم نص بخط Tajawal */
export function txt(x, t, px, xp, y, al, col, wt) {
  x.font = (wt || 400) + ' ' + px + 'px ' + FONT;
  x.fillStyle = col || '#1d1710';
  x.textAlign = al || 'right';
  x.fillText(t, xp, y);
}

export function fit(x, t, mw) {
  t = String(t || '');
  while (x.measureText(t).width > mw && t.length > 1) t = t.slice(0, -1);
  return t;
}

/* تحويل صفحات Canvas إلى PDF بمقاس A4 */
export async function canvasesToPdf(cs, meta, quality = 0.9) {
  const { PDFDocument } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  for (const c of cs) {
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', quality));
    const im = await doc.embedJpg(new Uint8Array(await blob.arrayBuffer()));
    const pg = doc.addPage([595.28, 841.89]);
    pg.drawImage(im, { x: 0, y: 0, width: 595.28, height: 841.89 });
  }
  doc.setTitle(meta.title);
  doc.setSubject(meta.subject);
  doc.setKeywords(meta.keywords);
  doc.setProducer('Point Up');
  return new Blob([await doc.save()], { type: 'application/pdf' });
}

export const toImgUrl = (c, q = 0.82) => c.toDataURL('image/jpeg', q);

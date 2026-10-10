/* رسم ألبوم الصور */
import { loadImg } from './util.js';
import { ready, paintMark, newPage, txt, fit, canvasesToPdf, FONT } from './watermark.js';

export const GRID = { 1: [1, 1], 2: [2, 1], 4: [2, 2], 6: [3, 2] };

/* m: { title, project, client, album_date, no, serial, per_page }  photos: [{src, cap}] */
export async function albumCanvases(m, photos) {
  const logoImg = await ready();
  const W = 1240, H = 1754, R = W - 70, L = 70, out = [];
  {
    const [c, x] = newPage(W, H);
    const lw = 640, lh = (lw * logoImg.naturalHeight) / logoImg.naturalWidth;
    x.drawImage(logoImg, (W - lw) / 2, 230, lw, lh);
    x.fillStyle = '#a97608';
    x.fillRect(L + 80, 230 + lh + 50, W - 2 * L - 160, 5);
    let y = 230 + lh + 170;
    txt(x, m.title || 'ألبوم صور', 70, W / 2, y, 'center', '#a97608', 800);
    y += 100;
    if (m.project) { txt(x, 'المشروع: ' + m.project, 44, W / 2, y, 'center', '#1d1710', 700); y += 76; }
    if (m.client) { txt(x, 'العميل: ' + m.client, 40, W / 2, y, 'center', '#1d1710', 700); y += 76; }
    txt(x, 'التاريخ: \u202A' + m.album_date + '\u202C', 32, W / 2, y, 'center', '#6d6354');
    y += 56;
    txt(x, 'رقم الألبوم: ' + m.no, 32, W / 2, y, 'center', '#6d6354');
    y += 56;
    txt(x, 'عدد الصور: ' + photos.length, 32, W / 2, y, 'center', '#6d6354');
    txt(x, 'بوينت أب | Point Up', 36, W / 2, H - 190, 'center', '#1d1710', 700);
    paintMark(x, W, H, 0.1, m.serial, m.album_date, logoImg);
    out.push(c);
  }
  const per = Number(m.per_page) || 4, [rn, cn] = GRID[per] || [2, 2], pn = Math.ceil(photos.length / per), gap = 22, y0 = 205, y1 = H - 110;
  const cw = (R - L - gap * (cn - 1)) / cn, ch = (y1 - y0 - gap * (rn - 1)) / rn;
  for (let p = 0; p < pn; p++) {
    const [c, x] = newPage(W, H);
    const lw = 190, lh = (lw * logoImg.naturalHeight) / logoImg.naturalWidth;
    x.drawImage(logoImg, L, 40, lw, lh);
    txt(x, m.project || m.title || 'ألبوم صور', 34, R, 88, 'right', '#a97608', 800);
    if (m.client) txt(x, 'العميل: ' + m.client, 26, R, 130, 'right', '#6d6354');
    x.fillStyle = '#a97608';
    x.fillRect(L, 170, R - L, 4);
    for (let k = 0; k < per; k++) {
      const idx = p * per + k;
      if (idx >= photos.length) break;
      const r = Math.floor(k / cn), cc = k % cn, cx = R - (cc + 1) * cw - cc * gap, cy = y0 + r * (ch + gap), ph = photos[idx];
      x.fillStyle = '#faf6ec';
      x.fillRect(cx, cy, cw, ch);
      x.strokeStyle = '#e2d8c4';
      x.lineWidth = 2;
      x.strokeRect(cx, cy, cw, ch);
      const ih = ch - 56, aw = cw - 16, ah = ih - 16;
      try {
        const im = await loadImg(ph.src), sc = Math.min(aw / im.naturalWidth, ah / im.naturalHeight), w = im.naturalWidth * sc, h = im.naturalHeight * sc;
        x.drawImage(im, cx + (cw - w) / 2, cy + 8 + (ah - h) / 2, w, h);
      } catch (e) {
        txt(x, 'تعذر تحميل الصورة', 26, cx + cw / 2, cy + ih / 2, 'center', '#b3261e');
      }
      x.fillStyle = '#a97608';
      x.beginPath();
      x.arc(cx + cw - 26, cy + 26, 18, 0, 7);
      x.fill();
      txt(x, String(idx + 1), 20, cx + cw - 26, cy + 33, 'center', '#fff', 700);
      if (ph.cap) {
        x.font = '400 26px ' + FONT;
        txt(x, fit(x, ph.cap, cw - 30), 26, cx + cw / 2, cy + ch - 18, 'center', '#1d1710');
      }
    }
    if (pn > 1) txt(x, 'صفحة ' + (p + 1) + ' من ' + pn, 22, W / 2, H - 90, 'center', '#6d6354');
    paintMark(x, W, H, 0.1, m.serial, m.album_date, logoImg);
    out.push(c);
  }
  return out;
}

export async function albumPdf(m, photos) {
  const cs = await albumCanvases(m, photos);
  return canvasesToPdf(cs, { title: m.no, subject: 'Point Up album ' + m.no + ' ' + m.serial, keywords: [m.serial, m.no] }, 0.86);
}

export function albumText(m, count) {
  const L = ['*شركة بوينت أب | Point Up*', 'ألبوم صور رقم: ' + m.no, m.title || ''];
  if (m.project) L.push('المشروع: ' + m.project);
  if (m.client) L.push('العميل: ' + m.client);
  L.push('التاريخ: ' + m.album_date, 'عدد الصور: ' + count, '', 'الرقم التسلسلي: ' + m.serial);
  return L.join('\n');
}

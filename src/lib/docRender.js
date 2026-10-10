/* رسم الفاتورة/عرض السعر/المقايسة على Canvas ثم PDF وExcel */
import { fmt, nz, secTotal, loadImg, typeName } from './util.js';
import { ready, paintMark, newPage, txt, fit, canvasesToPdf, FONT } from './watermark.js';
import { fileUrl, attachmentPaths } from './api.js';

export const QR_DEFAULT = { wa: '/qr-wa-default.jpg', fb: '/qr-fb-default.jpg' };

/*
 * doc: { type, no, serial, doc_date, client, client_phone, project, items, boq, discount, vat_rate,
 *        subtotal, vat_amount, total, currency, notes, company_snapshot, attachments }
 * assets: { imgs: [url], qr: {wa, fb} }
 */
export async function docAssets(doc) {
  const co = doc.company_snapshot || {};
  const qr = {};
  for (const k of ['wa', 'fb']) {
    const p = co['qr_' + k + '_path'];
    try { qr[k] = p ? await fileUrl(p) : QR_DEFAULT[k]; } catch (e) { qr[k] = QR_DEFAULT[k]; }
  }
  const imgs = [];
  for (const p of attachmentPaths(doc.attachments)) imgs.push(await fileUrl(p));
  return { qr, imgs };
}

export async function docCanvases(doc, assets) {
  assets = assets || (await docAssets(doc));
  if (doc.type === 'boq') return boqCanvases(doc);
  const logoImg = await ready();
  const items = doc.items || [];
  const W = 1240, H = 1754, per = 12, pages = Math.max(1, Math.ceil(items.length / per)), out = [], R = W - 70, L = 70, cur = doc.currency || '';
  const isQ = doc.type === 'quote';
  const co = doc.company_snapshot || {};
  for (let p = 0; p < pages; p++) {
    const [c, x] = newPage(W, H);
    const T = (t, px, xp, y, al, col, wt) => txt(x, t, px, xp, y, al, col, wt);
    const lw = 300, lh = (lw * logoImg.naturalHeight) / logoImg.naturalWidth;
    x.drawImage(logoImg, L, 45, lw, lh);
    T(isQ ? 'عرض سعر' : 'فاتورة', 64, R, 105, 'right', '#a97608', 800);
    T('رقم: ' + doc.no, 30, R, 152, 'right');
    T('التاريخ: \u202A' + doc.doc_date + '\u202C', 28, R, 192, 'right', '#6d6354');
    let y = 250;
    T('بوينت أب | Point Up', 30, R, y, 'right', '#1d1710', 700);
    y += 38;
    if (!isQ) {
      if (co.addr) { T(co.addr, 24, R, y, 'right', '#6d6354'); y += 34; }
      if (co.phone) { x.direction = 'ltr'; T(co.phone, 24, R, y, 'right', '#6d6354'); x.direction = 'rtl'; y += 34; }
      if (co.cr) { T('السجل التجاري: ' + co.cr, 24, R, y, 'right', '#6d6354'); y += 34; }
      if (co.tax) T('الرقم الضريبي: ' + co.tax, 24, R, y, 'right', '#6d6354');
    }
    x.fillStyle = '#a97608';
    x.fillRect(L, 400, R - L, 4);
    T('العميل: ' + (doc.client || ''), 32, R, 455, 'right', '#1d1710', 700);
    if (doc.client_phone) { x.direction = 'ltr'; T('الهاتف: ' + doc.client_phone, 26, R, 495, 'right', '#6d6354'); x.direction = 'rtl'; }
    if (doc.project) T('المشروع: ' + doc.project, 26, R, 535, 'right', '#6d6354');
    const ty = 570, cols = [[R - 80, R], [R - 640, R - 80], [R - 770, R - 640], [R - 930, R - 770], [L, R - 930]], hd = ['م', 'البيان', 'الكمية', 'السعر', 'الإجمالي'];
    x.fillStyle = '#a97608';
    x.fillRect(L, ty, R - L, 56);
    cols.forEach((cl, i) => T(hd[i], 26, (cl[0] + cl[1]) / 2, ty + 38, 'center', '#fff', 700));
    const rows = items.slice(p * per, (p + 1) * per);
    let ry = ty + 56;
    rows.forEach((it, k) => {
      if (k % 2) { x.fillStyle = '#faf6ec'; x.fillRect(L, ry, R - L, 52); }
      x.font = '400 26px ' + FONT;
      T(String(p * per + k + 1), 26, (cols[0][0] + cols[0][1]) / 2, ry + 35, 'center');
      T(fit(x, it.d, 520), 26, R - 95, ry + 35, 'right');
      x.direction = 'ltr';
      T(String(it.q), 26, (cols[2][0] + cols[2][1]) / 2, ry + 35, 'center');
      T(fmt(it.p), 26, (cols[3][0] + cols[3][1]) / 2, ry + 35, 'center');
      T(fmt(nz(it.q) * nz(it.p)), 26, (cols[4][0] + cols[4][1]) / 2, ry + 35, 'center', '#1d1710', 700);
      x.direction = 'rtl';
      x.fillStyle = '#e2d8c4';
      x.fillRect(L, ry + 51, R - L, 1);
      ry += 52;
    });
    if (p === pages - 1) {
      ry += 30;
      const bx = L, bw = 520;
      const line = (lb, v, bold) => {
        T(lb, bold ? 32 : 26, bx + bw - 10, ry, 'right', bold ? '#a97608' : '#1d1710', bold ? 800 : 400);
        x.direction = 'ltr';
        T(v, bold ? 32 : 26, bx + 10, ry, 'left', bold ? '#a97608' : '#1d1710', bold ? 800 : 400);
        x.direction = 'rtl';
        ry += bold ? 0 : 42;
      };
      line('المجموع الفرعي', fmt(doc.subtotal));
      line('الخصم', fmt(doc.discount));
      line('الضريبة (' + nz(doc.vat_rate) + '٪)', fmt(doc.vat_amount));
      x.fillStyle = '#e2d8c4';
      x.fillRect(bx, ry - 28, bw, 2);
      ry += 18;
      line('الإجمالي', fmt(doc.total) + (cur ? ' ' + cur : ''), true);
      if (doc.notes) {
        const ny = Math.min(ry + 80, H - 230);
        T('ملاحظات:', 26, R, ny, 'right', '#a97608', 700);
        x.font = '400 26px ' + FONT;
        let ln = '', yy = ny + 40;
        for (const w of String(doc.notes).split(' ')) {
          const t = ln ? ln + ' ' + w : w;
          if (x.measureText(t).width > R - L - 420 && ln) { T(ln, 26, R, yy, 'right'); ln = w; yy += 38; } else ln = t;
        }
        if (ln) T(ln, 26, R, yy, 'right');
      }
    }
    if (pages > 1) T('صفحة ' + (p + 1) + ' من ' + pages, 22, W / 2, H - 90, 'center', '#6d6354');
    paintMark(x, W, H, 0.12, doc.serial, doc.doc_date, logoImg);
    if (p === pages - 1 && !isQ) {
      let qx = L;
      for (const k of ['wa', 'fb']) {
        const src = assets.qr && assets.qr[k];
        if (!src) continue;
        try {
          const qi = await loadImg(src);
          x.fillStyle = '#fff';
          x.fillRect(qx - 5, H - 215, 120, 120);
          x.drawImage(qi, qx, H - 210, 110, 110);
          T(k === 'wa' ? 'واتساب' : 'فيسبوك', 20, qx + 55, H - 84, 'center', '#6d6354');
          qx += 140;
        } catch (e) { /* تخطَّ الباركود */ }
      }
    }
    out.push(c);
  }
  if (assets.imgs && assets.imgs.length) {
    const [c, x] = newPage(W, H);
    txt(x, 'مرفقات ' + (isQ ? 'عرض السعر' : 'الفاتورة') + ' رقم ' + doc.no, 38, R, 110, 'right', '#a97608', 800);
    x.fillStyle = '#a97608';
    x.fillRect(L, 140, R - L, 4);
    let yy = 180;
    for (const u of assets.imgs) {
      const im = await loadImg(u), sc = Math.min((R - L) / im.naturalWidth, 680 / im.naturalHeight), w = im.naturalWidth * sc, h = im.naturalHeight * sc;
      x.drawImage(im, (W - w) / 2, yy, w, h);
      yy += h + 40;
    }
    paintMark(x, W, H, 0.12, doc.serial, doc.doc_date, logoImg);
    out.push(c);
  }
  return out;
}

/* تقسيم صفحات المقايسة (منفصل لسهولة الاختبار) */
export function boqLayout(doc, measure) {
  const H = 1754, R = 1170, L = 70;
  const wrap = (t, px, mw) => {
    const o = [];
    for (const para of String(t || '').split('\n')) {
      let ln = '';
      for (const w of para.split(' ')) {
        const tt = ln ? ln + ' ' + w : w;
        if (measure(tt, px) > mw && ln) { o.push(ln); ln = w; } else ln = tt;
      }
      o.push(ln);
    }
    return o;
  };
  const rows = [];
  let sn = 0;
  (doc.boq || []).forEach((s) => {
    sn++;
    rows.push({ k: 's', no: sn, name: s.name || '', tot: secTotal(s), h: 58 });
    (s.items || []).forEach((i, ii) => {
      const ls = wrap(i.d, 24, 470), us = wrap(i.u, 21, 100);
      rows.push({ k: 'i', no: sn + '.' + (ii + 1), ls, us, q: i.q, p: i.p, h: Math.max(56, ls.length * 34 + 20, us.length * 30 + 20) });
    });
  });
  const lim = H - 120, pages = [];
  let cur = { rows: [], top: 450 }, y = 450 + 56;
  rows.forEach((r, i) => {
    const nx = rows[i + 1], need = r.h + (r.k === 's' && nx ? nx.h : 0);
    if (y + need > lim && cur.rows.length) { pages.push(cur); cur = { rows: [], top: 215 }; y = 215 + 56; }
    cur.rows.push(r);
    y += r.h;
  });
  const grand = (doc.boq || []).reduce((a, s) => a + secTotal(s), 0);
  const notesL = doc.notes ? wrap(doc.notes, 26, R - L - 100) : [];
  const tail = (grand > 0 ? 110 : 0) + (notesL.length ? 60 + notesL.length * 38 : 0);
  if (y + tail > lim) { pages.push(cur); cur = { rows: [], top: 215 }; }
  pages.push(cur);
  return { pages, grand, notesL };
}

async function boqCanvases(doc) {
  const logoImg = await ready();
  const W = 1240, H = 1754, R = W - 70, L = 70, cu = doc.currency || '';
  const pr = document.createElement('canvas').getContext('2d');
  const measure = (t, px) => { pr.font = '400 ' + px + 'px ' + FONT; return pr.measureText(t).width; };
  const { pages, grand, notesL } = boqLayout(doc, measure);
  const cols = [[R - 110, R], [R - 610, R - 110], [R - 730, R - 610], [R - 840, R - 730], [R - 970, R - 840], [L, R - 970]], hd = ['البند', 'التوصيف', 'الوحدة', 'الكمية', 'الفئة', 'الإجمالي'];
  const mid = (i) => (cols[i][0] + cols[i][1]) / 2;
  const out = [];
  for (let p = 0; p < pages.length; p++) {
    const [c, x] = newPage(W, H);
    const T = (t, px, xp, yy, al, col, wt) => txt(x, t, px, xp, yy, al, col, wt);
    const num = (t, px, xp, yy, al, col, wt) => { x.direction = 'ltr'; T(t, px, xp, yy, al, col, wt); x.direction = 'rtl'; };
    const pg = pages[p];
    if (p === 0) {
      const lw = 300, lh = (lw * logoImg.naturalHeight) / logoImg.naturalWidth;
      x.drawImage(logoImg, L, 45, lw, lh);
      T('مقايسة أعمال', 60, R, 105, 'right', '#a97608', 800);
      T('رقم: ' + doc.no, 30, R, 152);
      T('التاريخ: \u202A' + doc.doc_date + '\u202C', 28, R, 192, 'right', '#6d6354');
      T('بوينت أب | Point Up', 30, R, 250, 'right', '#1d1710', 700);
      x.fillStyle = '#a97608';
      x.fillRect(L, 300, R - L, 4);
      let ty = 355;
      if (doc.client) { T('الجهة: ' + doc.client, 30, R, ty, 'right', '#1d1710', 700); ty += 44; }
      if (doc.project) T('المقايسة: ' + doc.project, 28, R, ty, 'right', '#6d6354');
    } else {
      const lw = 190, lh = (lw * logoImg.naturalHeight) / logoImg.naturalWidth;
      x.drawImage(logoImg, L, 40, lw, lh);
      T('مقايسة أعمال — ' + doc.no, 34, R, 90, 'right', '#a97608', 800);
      if (doc.project) T(doc.project, 24, R, 132, 'right', '#6d6354');
      x.fillStyle = '#a97608';
      x.fillRect(L, 170, R - L, 4);
    }
    const ty0 = pg.top, hr = pg.rows.length > 0;
    if (hr) {
      x.fillStyle = '#a97608';
      x.fillRect(L, ty0, R - L, 56);
      cols.forEach((cl, i) => T(hd[i], 24, (cl[0] + cl[1]) / 2, ty0 + 38, 'center', '#fff', 700));
    }
    let ry = ty0 + (hr ? 56 : 0);
    pg.rows.forEach((r) => {
      if (r.k === 's') {
        x.fillStyle = '#efe4c8';
        x.fillRect(L, ry, R - L, r.h);
        T(r.no + ' — ' + r.name, 28, R - 15, ry + 38, 'right', '#1d1710', 800);
        if (r.tot > 0) num(fmt(r.tot), 26, mid(5), ry + 38, 'center', '#a97608', 800);
      } else {
        T(r.no, 22, mid(0), ry + 36, 'center', '#6d6354');
        r.ls.forEach((l, k) => T(l, 24, R - 125, ry + 36 + k * 34, 'right'));
        r.us.forEach((l, k) => T(l, 21, mid(2), ry + 34 + k * 30, 'center'));
        if (r.q !== '' && r.q != null) num(String(r.q), 24, mid(3), ry + 36, 'center');
        if (nz(r.p) > 0) {
          num(fmt(r.p), 24, mid(4), ry + 36, 'center');
          num(fmt(nz(r.q) * nz(r.p)), 24, mid(5), ry + 36, 'center', '#1d1710', 700);
        }
      }
      x.fillStyle = '#e2d8c4';
      x.fillRect(L, ry + r.h - 1, R - L, 1);
      ry += r.h;
    });
    if (hr) {
      x.fillStyle = '#e2d8c4';
      [R - 110, R - 610, R - 730, R - 840, R - 970, L, R].forEach((vx) => x.fillRect(vx, ty0 + 56, 1, ry - ty0 - 56));
    }
    if (p === pages.length - 1) {
      let yy = ry + 26;
      if (grand > 0) {
        x.fillStyle = '#faf6ec';
        x.fillRect(L, yy - 6, R - L, 64);
        T('الإجمالي العام', 32, R - 15, yy + 38, 'right', '#a97608', 800);
        num(fmt(grand) + (cu ? ' ' + cu : ''), 32, L + 15, yy + 38, 'left', '#a97608', 800);
        yy += 100;
      }
      if (notesL.length) {
        T('ملاحظات:', 26, R, yy + 20, 'right', '#a97608', 700);
        notesL.forEach((l, k) => T(l, 26, R, yy + 58 + k * 38, 'right'));
      }
    }
    if (pages.length > 1) T('صفحة ' + (p + 1) + ' من ' + pages.length, 22, W / 2, H - 90, 'center', '#6d6354');
    paintMark(x, W, H, 0.12, doc.serial, doc.doc_date, logoImg);
    out.push(c);
  }
  return out;
}

export async function docPdf(doc, assets) {
  const cs = await docCanvases(doc, assets);
  const kind = doc.type === 'quote' ? 'quotation' : doc.type === 'boq' ? 'BOQ' : 'invoice';
  return canvasesToPdf(cs, { title: doc.no, subject: 'Point Up ' + kind + ' ' + doc.no + ' ' + doc.serial, keywords: [doc.serial, doc.no] });
}

/* ===== Excel ===== */
async function xlsxLib() { return import('xlsx'); }

export async function docXlsx(doc) {
  const XLSX = await xlsxLib();
  if (doc.type === 'boq') return boqXlsx(XLSX, doc);
  const co = doc.company_snapshot || {}, cu = doc.currency || '', isQ = doc.type === 'quote';
  const A = [['بوينت أب | Point Up'], ...(isQ ? [] : [[co.addr || ''], [co.phone || ''], [co.cr ? 'السجل التجاري: ' + co.cr : ''], [co.tax ? 'الرقم الضريبي: ' + co.tax : '']]), [], [isQ ? 'عرض سعر رقم' : 'فاتورة رقم', doc.no, '', 'التاريخ', doc.doc_date], ['العميل', doc.client, '', 'الهاتف', doc.client_phone || ''], ['المشروع', doc.project || ''], [], ['م', 'البيان', 'الكمية', 'سعر الوحدة', 'الإجمالي']];
  const f = A.length + 1, items = doc.items || [];
  items.forEach((it, i) => A.push([i + 1, it.d, nz(it.q), nz(it.p), { t: 'n', v: nz(it.q) * nz(it.p), f: 'C' + (f + i) + '*D' + (f + i) }]));
  const l = f + items.length - 1, s = l + 2;
  A.push([], ['', '', '', 'المجموع الفرعي', { t: 'n', v: nz(doc.subtotal), f: items.length ? 'SUM(E' + f + ':E' + l + ')' : '0' }], ['', '', '', 'الخصم', nz(doc.discount)], ['', '', '', 'الضريبة ٪', nz(doc.vat_rate)], ['', '', '', 'قيمة الضريبة', { t: 'n', v: nz(doc.vat_amount), f: 'MAX(0,E' + s + '-E' + (s + 1) + ')*E' + (s + 2) + '/100' }], ['', '', '', 'الإجمالي ' + (cu ? '(' + cu + ')' : ''), { t: 'n', v: nz(doc.total), f: 'MAX(0,E' + s + '-E' + (s + 1) + ')+E' + (s + 3) }], [], ['الرقم التسلسلي', doc.serial], ['ملاحظات', doc.notes || '']);
  const ws = XLSX.utils.aoa_to_sheet(A);
  ws['!cols'] = [{ wch: 14 }, { wch: 42 }, { wch: 10 }, { wch: 16 }, { wch: 18 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, isQ ? 'عرض سعر' : 'فاتورة');
  wb.Workbook = { Views: [{ RTL: true }] };
  return new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

function boqXlsx(XLSX, doc) {
  const A = [['بوينت أب | Point Up'], ['مقايسة أعمال' + (doc.project ? ' — ' + doc.project : '')], ['الجهة', doc.client || '', '', 'التاريخ', doc.doc_date], ['رقم المقايسة', doc.no], [], ['البند', 'التوصيف', 'الوحدة', 'الكمية', 'الفئة', 'الإجمالي']];
  const secRows = [];
  (doc.boq || []).forEach((s, si) => {
    const sr = A.length + 1, f = sr + 1, l = sr + s.items.length;
    secRows.push(sr);
    A.push([si + 1, s.name, '', '', '', s.items.length ? { t: 'n', v: secTotal(s), f: 'SUM(F' + f + ':F' + l + ')' } : '']);
    s.items.forEach((i, ii) => {
      const r = A.length + 1;
      A.push([si + 1 + '.' + (ii + 1), i.d, i.u, i.q, i.p, { t: 'n', v: nz(i.q) * nz(i.p), f: 'D' + r + '*E' + r }]);
    });
  });
  const g = (doc.boq || []).reduce((a, s) => a + secTotal(s), 0);
  A.push([], ['', '', '', '', 'الإجمالي العام' + (doc.currency ? ' (' + doc.currency + ')' : ''), { t: 'n', v: g, f: secRows.length ? secRows.map((r) => 'F' + r).join('+') : '0' }], [], ['الرقم التسلسلي', doc.serial], ['ملاحظات', doc.notes || '']);
  const ws = XLSX.utils.aoa_to_sheet(A);
  ws['!cols'] = [{ wch: 8 }, { wch: 70 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 16 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'مقايسة');
  wb.Workbook = { Views: [{ RTL: true }] };
  return new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/* سجل المستندات كملف Excel */
export async function registerXlsx(rows) {
  const XLSX = await xlsxLib();
  const A = [['الرقم', 'النوع', 'التاريخ', 'العميل', 'الهاتف', 'المشروع', 'المجموع الفرعي', 'الخصم', 'الضريبة', 'الإجمالي', 'العملة', 'الرقم التسلسلي', 'ملاحظات']];
  rows.forEach((r) => A.push([r.no, typeName(r.type), r.doc_date, r.client || '', r.client_phone || '', r.project || '', nz(r.subtotal), nz(r.discount), nz(r.vat_amount), nz(r.total), r.currency || '', r.serial, r.notes || '']));
  const ws = XLSX.utils.aoa_to_sheet(A);
  ws['!cols'] = [{ wch: 16 }, { wch: 10 }, { wch: 12 }, { wch: 24 }, { wch: 16 }, { wch: 24 }, { wch: 14 }, { wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 8 }, { wch: 20 }, { wch: 30 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'السجل');
  wb.Workbook = { Views: [{ RTL: true }] };
  return new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/* نص المستند للإرسال */
export function docText(doc) {
  const cu = doc.currency ? ' ' + doc.currency : '';
  const lbl = doc.type === 'quote' ? 'عرض السعر' : doc.type === 'boq' ? 'المقايسة' : 'الفاتورة';
  const L = ['*شركة بوينت أب | Point Up*', lbl + ' رقم: ' + doc.no, 'التاريخ: ' + doc.doc_date];
  if (doc.client) L.push('العميل: ' + doc.client);
  if (doc.project) L.push('المشروع: ' + doc.project);
  L.push('');
  if (doc.type === 'boq') {
    (doc.boq || []).forEach((s, si) => {
      L.push(si + 1 + '- ' + s.name);
      s.items.forEach((i) => L.push('   • ' + i.d + (i.u ? ' (' + i.u + ')' : '') + (i.q !== '' && i.q != null ? ' × ' + i.q : '') + (nz(i.p) > 0 ? ' = ' + fmt(nz(i.q) * nz(i.p)) : '')));
    });
  } else (doc.items || []).forEach((i, k) => L.push(k + 1 + '- ' + i.d + ' × ' + i.q + ' × ' + fmt(i.p) + ' = ' + fmt(nz(i.q) * nz(i.p))));
  if (nz(doc.total) > 0) {
    L.push('');
    if (nz(doc.discount)) L.push('الخصم: ' + fmt(doc.discount));
    if (nz(doc.vat_amount)) L.push('الضريبة: ' + fmt(doc.vat_amount));
    L.push('*الإجمالي: ' + fmt(doc.total) + cu + '*');
  }
  if (doc.notes) L.push('', 'ملاحظات: ' + doc.notes);
  L.push('', 'الرقم التسلسلي: ' + doc.serial);
  return L.join('\n');
}

/* ختم ملف PDF أو صورة بالعلامة المائية */
import { baseName, today, loadImg, verifyShort } from './util.js';
import { ready, paintMark, logoBytes } from './watermark.js';

export async function stampImage(f, op, serial) {
  const logoImg = await ready();
  const url = URL.createObjectURL(f);
  let img;
  try { img = await loadImg(url); } finally { URL.revokeObjectURL(url); }
  let w = img.naturalWidth, h = img.naturalHeight;
  const sc = Math.min(1, 4000 / Math.max(w, h));
  w = Math.round(w * sc);
  h = Math.round(h * sc);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d');
  x.drawImage(img, 0, 0, w, h);
  paintMark(x, w, h, op, serial, today(), logoImg);
  const type = f.type === 'image/jpeg' ? 'image/jpeg' : 'image/png';
  const blob = await new Promise((r) => c.toBlob(r, type, 0.92));
  return { blob, name: baseName(f.name) + '_' + serial + (type === 'image/jpeg' ? '.jpg' : '.png'), pages: 1 };
}

export async function stampPdf(f, op, serial) {
  const { PDFDocument, rgb, degrees, StandardFonts } = await import('pdf-lib');
  const doc = await PDFDocument.load(await f.arrayBuffer(), { ignoreEncryption: true });
  const png = await doc.embedPng(await logoBytes());
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const th = Math.PI / 6, co = Math.cos(th), si = Math.sin(th);
  const footer = 'Point Up  |  ' + serial + '  |  ' + today() + '  |  ' + verifyShort(serial);
  for (const p of doc.getPages()) {
    const { width: w, height: h } = p.getSize();
    const lw = Math.min(w, h) * 0.28, lh = (lw * png.height) / png.width, gx = lw * 1.5, gy = lh * 2.7, R = Math.hypot(w, h) / 2, fs = lw * 0.09;
    const tw = font.widthOfTextAtSize(serial, fs);
    let row = 0;
    for (let v = -R; v < R; v += gy, row++) {
      for (let u = -R + (row % 2 ? gx / 2 : 0); u < R; u += gx) {
        const cx = w / 2 + u * co - v * si, cy = h / 2 + u * si + v * co;
        p.drawImage(png, { x: cx - ((lw / 2) * co - (lh / 2) * si), y: cy - ((lw / 2) * si + (lh / 2) * co), width: lw, height: lh, rotate: degrees(30), opacity: op });
        const v2 = v - (lh / 2 + fs * 1.3), tx = w / 2 + u * co - v2 * si, ty = h / 2 + u * si + v2 * co;
        p.drawText(serial, { x: tx - (tw / 2) * co, y: ty - (tw / 2) * si, size: fs, font, rotate: degrees(30), color: rgb(0.5, 0.35, 0.03), opacity: Math.min(1, op + 0.15) });
      }
    }
    const fh = Math.max(18, h * 0.035);
    let size = fh * 0.45;
    while (size > 5 && font.widthOfTextAtSize(footer, size) > w - fh) size -= 0.5;
    p.drawRectangle({ x: 0, y: 0, width: w, height: fh, color: rgb(0.06, 0.05, 0.03), opacity: 0.8 });
    p.drawText(footer, { x: fh * 0.5, y: fh * 0.3, size, font, color: rgb(0.95, 0.78, 0.36) });
  }
  doc.setSubject('Point Up verified copy ' + serial);
  doc.setKeywords([serial]);
  doc.setProducer('Point Up');
  const bytes = await doc.save();
  return { blob: new Blob([bytes], { type: 'application/pdf' }), name: baseName(f.name) + '_' + serial + '.pdf', pages: doc.getPageCount() };
}

/* معاينة أول صفحة من PDF عبر pdf.js */
export async function renderPdfFirstPage(blob, canvas) {
  const pdfjs = await import('pdfjs-dist');
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), isEvalSupported: false }).promise;
  const pg = await pdf.getPage(1);
  const v0 = pg.getViewport({ scale: 1 }), sc = Math.min(2, 900 / v0.width), v = pg.getViewport({ scale: sc });
  canvas.width = v.width;
  canvas.height = v.height;
  await pg.render({ canvasContext: canvas.getContext('2d'), viewport: v, canvas }).promise;
}

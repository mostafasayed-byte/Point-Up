/* طباعة HTML مشتركة (العقود والإيصالات): ورقة + علامة مائية + شريط سفلي يتكرران في كل صفحة */
import { paintGrid } from './watermark.js';
import { verifyUrl } from './util.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const nl = (x) => esc(x).replace(/\n/g, '<br>');
export const DOTS = '................';
export const dot = (v) => (String(v ?? '').trim() ? esc(String(v).trim()) : DOTS);

export const PAPER = { A4: [210, 297], A5: [148, 210], Letter: [216, 279] };
export const WM_OP = 0.11;
const MM = 3.7795; // px لكل مم
const FOOT_MM = 12; // مساحة الشريط السفلي في كل صفحة

/* أبعاد الورقة بالمم حسب الاتجاه */
export function paperMm(po) {
  const [w, h] = PAPER[po.sz] || PAPER.A4;
  return po.or === 'landscape' ? [h, w] : [w, h];
}

export const pageCss = (po) => `@page{size:${po.sz} ${po.or};margin:${po.mg}mm}`;

/* بلاطة العلامة المائية بمقاس منطقة المحتوى في الصفحة (لوجو مائل + الرقم التسلسلي) */
export function wmTile(logoImg, serial, po) {
  const [pw, ph] = paperMm(po);
  const W = 1000, H = Math.round((W * (ph - 2 * po.mg)) / (pw - 2 * po.mg));
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  paintGrid(c.getContext('2d'), W, H, WM_OP, serial, logoImg);
  return c.toDataURL('image/png');
}

/* اللوجو كـ data URL حتى يعمل داخل ملف HTML المحفوظ */
let logoD = '';
export function logoData(logoImg) {
  if (!logoD) {
    const c = document.createElement('canvas');
    c.width = 500;
    c.height = Math.round((500 * logoImg.naturalHeight) / logoImg.naturalWidth);
    c.getContext('2d').drawImage(logoImg, 0, 0, c.width, c.height);
    logoD = c.toDataURL('image/png');
  }
  return logoD;
}

/* رأس الورقة: اللوجو + اسم الشركة + سطور إضافية */
export function headHtml(logo, lines) {
  return `<div class="cx-hd"><img src="${esc(logo)}" alt="Point Up"><div><b>بوينت أب — شركة مقاولات عامة وتوريدات</b>${(lines || []).map((l) => `<div class="t">${l}</div>`).join('')}</div></div>`;
}

/* الورقة كاملة. o: {po, wm, serial, date, layer, cls} و inner = المحتوى */
export function paperHtml(o, inner) {
  const { po } = o, [pw] = paperMm(po);
  const wm = o.wm ? `<div class="cx-wm" style="inset:${po.mg}mm;background-image:url(${o.wm})"></div>` : '';
  const ver = o.serial !== 'DRAFT' ? ' · ' + esc(verifyUrl(o.serial)) : '';
  const ft = `<div class="cx-ft"><span>بوينت أب | Point Up</span><span class="s">${esc(o.serial)} · ${esc(o.date)}${ver}</span></div>`;
  return `<div class="cx-doc${o.cls ? ' ' + o.cls : ''}" style="width:${pw}mm;padding:${po.mg}mm;font-size:${po.fs}px">${wm}${o.layer || ''}<table class="cx-pg"><tfoot><tr><td><div class="cx-sp"></div></td></tr></tfoot><tbody><tr><td>${inner}</td></tr></tbody></table>${ft}</div>`;
}

/* تقدير عدد الصفحات من ارتفاع المحتوى المعروض */
export function estimatePages(el, po) {
  const [pw, ph] = paperMm(po);
  const want = (pw - 2 * po.mg) * MM, have = el.offsetWidth || want;
  const pageH = (ph - 2 * po.mg - FOOT_MM) * MM;
  return Math.max(1, Math.ceil((el.offsetHeight * (have / want)) / pageH));
}

export const PRINT_CSS = `
.cx-doc{box-sizing:border-box;position:relative;margin:0 auto;max-width:100%;background:#fff;color:#222;font-family:Tajawal,Arial,sans-serif;line-height:1.85;direction:rtl;text-align:right;box-shadow:0 2px 14px rgba(0,0,0,.35);-webkit-print-color-adjust:exact;print-color-adjust:exact}
.cx-doc *{box-sizing:border-box}
.cx-wm{position:absolute;z-index:0;pointer-events:none;background-repeat:repeat-y;background-position:top center;background-size:100% auto;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.cx-pg{position:relative;z-index:1;width:100%;border-collapse:collapse}
.cx-pg>tbody>tr>td,.cx-pg>tfoot>tr>td{padding:0;border:0}
.cx-pg>tfoot{display:none}
.cx-sp{height:${FOOT_MM}mm}
.cx-doc table{font-size:inherit}
.cx-doc td,.cx-doc th{color:#222;border-color:#ddd;font-size:inherit}
.cx-doc p{margin:4px 0}
.cx-hd{display:flex;align-items:center;gap:12px;border-bottom:3px solid #a97608;padding-bottom:8px}
.cx-hd img{width:150px;max-width:35%;height:auto}
.cx-hd .t{font-size:.85em;color:#6d6354}
.cx-tt{text-align:center;color:#1d160a;font-size:1.3em;font-weight:800;margin:12px 0 6px}
.cx-mt{display:flex;flex-wrap:wrap;justify-content:space-between;gap:4px 18px;font-size:.93em;margin:6px 0}
.cx-keep{break-inside:avoid;page-break-inside:avoid}
.cx-sg{width:100%;border-collapse:collapse;margin-top:22px}
.cx-doc .cx-sg td{width:50%;height:130px;border:1px solid #bbb;vertical-align:top;text-align:center;padding:8px}
.cx-nt{margin-top:12px;border:1px dashed #a97608;padding:8px}
.cx-ft{position:relative;z-index:2;display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:14px;padding:4px 10px;min-height:8mm;background:rgba(15,12,8,.85);color:#f2c85b;font-size:9.5px;font-weight:700;line-height:1.4;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.cx-ft .s{direction:ltr;text-align:left;font-family:ui-monospace,monospace;word-break:break-all}
.rc .cx-hd img{width:90px}
.rc .cx-hd{padding-bottom:4px;font-size:.92em}
.rc .cx-tt{margin:6px 0 2px;font-size:1.25em}
.rc .cx-mt{margin:2px 0}
.rc-amt{float:left;margin:2px 0 4px 12px;border:2px solid #a97608;border-radius:10px;text-align:center;font-size:1.6em;font-weight:800;padding:4px 14px;color:#8a6420;direction:rtl}
.rc-s{line-height:1.8}
.rc-t{width:100%;border-collapse:collapse;margin:6px 0;clear:both}
.cx-doc .rc-t th,.cx-doc .rc-t td{border:1px solid #cdbf9f;padding:3px 6px;text-align:right;vertical-align:top}
.cx-doc .rc-t th{background:#f5ecd6;color:#5a4310;font-weight:700;white-space:nowrap}
.cx-doc .rc-b th,.cx-doc .rc-b td{text-align:center}
.rc-void{border:2px solid #c62828;color:#c62828;font-weight:800;padding:4px 8px;margin:6px 0;text-align:center}
.rc-terms{font-size:.82em;color:#444;line-height:1.6}
.rc .cx-sg{margin-top:8px}
.cx-doc.rc .cx-sg td{height:80px;padding:4px 8px;line-height:1.6}
.rc-ft{text-align:center;font-size:.8em;color:#8a6420;margin-top:4px}
.rc-copy{display:inline-block;font-size:.6em;border:1.5px solid #8a6420;color:#8a6420;border-radius:6px;padding:0 8px;vertical-align:middle}
.rc-tight{line-height:1.45}
.rc-tight .rc-s{line-height:1.5}
.rc-tight .rc-terms{font-size:.75em;margin:2px 0}
.cx-doc.rc-tight .cx-sg td{height:58px}
.rc-tight .rc-t{margin:3px 0}
.rc-tight .cx-hd img{width:70px}
.cx-void{position:absolute;inset:0;z-index:3;display:flex;align-items:center;justify-content:center;pointer-events:none;overflow:hidden}
.cx-void span{transform:rotate(-30deg);color:rgba(198,40,40,.6);border:8px solid rgba(198,40,40,.6);border-radius:18px;padding:0 34px;font-size:110px;font-weight:800;line-height:1.3}
@media print{
html,body{background:#fff!important;margin:0!important;padding:0!important}
body>*:not(.cx-print){display:none!important}
.cx-print{position:static!important;inset:auto!important;overflow:visible!important;background:#fff!important;padding:0!important}
.cx-print .noprint{display:none!important}
.cx-print .cx-pp{overflow:visible!important}
.cx-doc{width:auto!important;max-width:none!important;padding:0!important;margin:0!important;box-shadow:none!important}
.cx-wm{position:fixed!important;inset:0!important;background-repeat:no-repeat!important;background-size:100% 100%!important}
.cx-void{position:fixed!important}
.cx-ft{position:fixed!important;left:0;right:0;bottom:0;margin:0!important}
.cx-pg>tfoot{display:table-footer-group}
}`;

/* ملف HTML مستقل للحفظ أو المشاركة */
export function fullHtml(docHtml, po, title) {
  return '<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' + esc(title) + '</title><link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700;800&display=swap" rel="stylesheet"><style>body{margin:0;background:#eee;padding:12px}' + PRINT_CSS + pageCss(po) + '</style></head><body><div class="cx-print">' + docHtml + '</div></body></html>';
}

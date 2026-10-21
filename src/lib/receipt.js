/* إيصال استلام نقدية: الورقة المطبوعة (من الصف المحفوظ) + النص + Excel */
import { esc, nl, dot, headHtml, paperHtml } from './printDoc.js';
import { tafqeet, plainUnit } from './tafqeet.js';
import { arDate } from './contract.js';
import { fmt, verifyUrl } from './util.js';

export const PURPOSES = ['دفعة مقدمة', 'دفعة تحت الحساب', 'دفعة ختامية', 'ثمن توريدات', 'أتعاب إشراف', 'أخرى'];
export const RC_PAPER = { sz: 'A5', or: 'landscape', mg: 8, fs: 12 };

export const curName = (cur) => String(cur || '').trim() || 'جنيه مصري';
const isEgp = (cur) => !String(cur || '').trim() || /جنيه|EGP|ج\.?\s?م/i.test(cur);

/* المبلغ كتابةً حسب عملة الشركة */
export const amountWords = (amount, cur) => (Number(amount) > 0 ? tafqeet(amount, isEgp(cur) ? undefined : { unit: plainUnit(curName(cur)), sub: null }) : '');

/* المسدد حتى تاريخه والمتبقي (المتبقي فقط عند وجود إجمالي التعاقد) */
export function balance(r, prev) {
  const total = Number(r.contract_total) || 0, paid = (Number(prev) || 0) + (Number(r.amount) || 0);
  return { total, prev: Number(prev) || 0, paid, rest: Math.max(0, total - paid) };
}

const coLines = (co) => {
  const l = [co.addr && esc(co.addr), co.phone && '<span dir="ltr">' + esc(co.phone) + '</span>', co.cr && 'السجل التجاري: ' + esc(co.cr), co.tax && 'الرقم الضريبي: ' + esc(co.tax)].filter(Boolean);
  return l.length ? [l.join(' — ')] : [];
};

/* r = صف الإيصال (أو مسودة بنفس الحقول). o: {po, logo, wm, tight, prev, copy, draft} */
export function rcHtml(r, o) {
  const cur = esc(curName(r.currency)), amt = fmt(r.amount), b = balance(r, o.prev), isVoid = r.status === 'void';
  const no = o.draft ? '—' : r.no, serial = o.draft ? 'DRAFT' : r.serial;
  const words = r.amount_words || amountWords(r.amount, r.currency);
  const body = `<div class="cx-mt"><span>رقم الإيصال: <b dir="ltr">${esc(no)}</b>${o.draft ? ' · مسودة' : ''}</span><span>التاريخ: ${esc(arDate(r.receipt_date))}</span><span>طريقة السداد: <b>نقدًا</b></span></div>
<div class="rc-amt">${amt} ${cur}</div>
<p class="rc-s">استلمنا نحن شركة بوينت أب من السيد / <b>${dot(r.client)}</b> مبلغ وقدره <b>${amt} ${cur}</b> (<b>${esc(words) || '................'}</b>) <b>نقدًا</b>، وذلك <b>${esc(r.purpose) || '................'}</b>${r.project ? ' عن مشروع <b>' + esc(r.project) + '</b>' : ''}.</p>
<table class="rc-t"><tr><th>هاتف العميل</th><td dir="ltr">${esc(r.client_phone) || '—'}</td><th>المشروع</th><td>${esc(r.project) || '—'}</td></tr>
<tr><th>المبلغ</th><td>${amt} ${cur}</td><th>الغرض</th><td>${esc(r.purpose) || '—'}</td></tr>
${r.notes ? `<tr><th>ملاحظات</th><td colspan="3">${nl(r.notes)}</td></tr>` : ''}</table>
${b.total ? `<table class="rc-t rc-b"><tr><th>إجمالي التعاقد</th><th>المسدد سابقًا</th><th>المسدد بهذا الإيصال</th><th>المسدد حتى تاريخه</th><th>المتبقي</th></tr><tr><td>${fmt(b.total)}</td><td>${fmt(b.prev)}</td><td>${amt}</td><td>${fmt(b.paid)}</td><td><b>${fmt(b.rest)}</b></td></tr></table>` : ''}
${isVoid ? `<div class="rc-void">⚠️ هذا الإيصال ملغي${r.void_reason ? ' — السبب: ' + esc(r.void_reason) : ''}</div>` : ''}
<p class="rc-terms"><b>أحكام الإيصال:</b> ١- يُعد هذا الإيصال مخالصة بقيمة المبلغ الوارد به فقط، ولا يُعتبر مخالصة نهائية عن باقي مستحقات الشركة. ٢- لا يُعتد بهذا الإيصال إلا إذا كان موقعًا من المستلم ومختومًا بخاتم الشركة. ٣- حُرر هذا الإيصال من نسختين، نسخة للعميل ونسخة للشركة.</p>
<table class="cx-sg cx-keep"><tr><td><b>المستلم (بوينت أب)</b><br>${dot(r.received_by)}<br>التوقيع والختم:</td><td><b>المُسلِّم (العميل)</b><br>${dot(r.client)}<br>التوقيع:</td></tr></table>
<div class="rc-ft">بوينت أب · Point Up</div>`;
  const inner = headHtml(o.logo, coLines(r.company_snapshot || {})) + `<div class="cx-tt">إيصال استلام نقدية${o.copy ? ' <span class="rc-copy">نسخة</span>' : ''}</div>${body}`;
  const layer = isVoid ? '<div class="cx-void"><span>ملغي</span></div>' : '';
  return paperHtml({ po: o.po, wm: o.wm, serial, date: r.receipt_date, layer, cls: 'rc' + (o.tight ? ' rc-tight' : '') }, inner);
}

/* نص الإيصال للنسخ */
export function rcText(r) {
  const cur = curName(r.currency);
  return `إيصال استلام نقدية رقم ${r.no} — ${arDate(r.receipt_date)}\nاستلمنا نحن شركة بوينت أب من السيد / ${r.client} مبلغ وقدره ${fmt(r.amount)} ${cur} (${r.amount_words || amountWords(r.amount, r.currency)}) نقدًا، وذلك ${r.purpose || ''}${r.project ? ' عن مشروع ' + r.project : ''}.\n` + (r.status === 'void' ? '⚠️ هذا الإيصال ملغي' + (r.void_reason ? ' — السبب: ' + r.void_reason : '') + '\n' : '') + (r.serial ? 'الرقم التسلسلي: ' + r.serial + '\nللتحقق: ' + verifyUrl(r.serial) + '\n' : '') + 'بوينت أب';
}

export const rcWaText = (r) => 'السلام عليكم، مرفق إيصال استلام نقدية رقم ' + r.no + ' بمبلغ ' + fmt(r.amount) + ' ' + curName(r.currency) + ' من شركة بوينت أب.';

export const statusName = (s) => (s === 'void' ? 'ملغي' : 'ساري');

/* تصدير الإيصالات المفلترة إلى Excel مع مجموع السارية */
export async function rcXlsx(rows) {
  const XLSX = await import('xlsx');
  const A = [['الرقم', 'التاريخ', 'العميل', 'المشروع', 'الغرض', 'المبلغ', 'الحالة', 'الرقم التسلسلي', 'المستلم']];
  rows.forEach((r) => A.push([r.no, r.receipt_date, r.client || '', r.project || '', r.purpose || '', Number(r.amount) || 0, statusName(r.status), r.serial, r.received_by || '']));
  const n = rows.length + 1;
  const sum = rows.filter((r) => r.status !== 'void').reduce((s, r) => s + (Number(r.amount) || 0), 0);
  A.push([], ['', '', '', '', 'إجمالي السارية', { t: 'n', v: sum, f: rows.length ? 'SUMIF(G2:G' + n + ',"ساري",F2:F' + n + ')' : '0' }]);
  const ws = XLSX.utils.aoa_to_sheet(A);
  ws['!cols'] = [{ wch: 14 }, { wch: 12 }, { wch: 24 }, { wch: 24 }, { wch: 18 }, { wch: 14 }, { wch: 8 }, { wch: 20 }, { wch: 18 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'الإيصالات');
  wb.Workbook = { Views: [{ RTL: true }] };
  return new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

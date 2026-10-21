/* تفقيط المبالغ بالعربية (جنيه وقرش — معدود مذكر). يدعم حتى 999,999,999.99 */

const ONES = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة'];
const TENS = ['', 'عشرة', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
const HUNDREDS = ['', 'مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];

/* صيغ المعدود: one=1 وحده، two=2 وحده، few=3..10، many=11..99، base=المضاف إليه (100، 1000، …) */
export const EGP = { one: 'جنيه مصري واحد', two: 'جنيهان مصريان', few: 'جنيهات مصرية', many: 'جنيهًا مصريًا', base: 'جنيه مصري' };
export const PIASTER = { one: 'قرش واحد', two: 'قرشان', few: 'قروش', many: 'قرشًا', base: 'قرش' };
const THOUSAND = { one: 'ألف', two: 'ألفان', few: 'آلاف', many: 'ألفًا', base: 'ألف' };
const MILLION = { one: 'مليون', two: 'مليونان', few: 'ملايين', many: 'مليونًا', base: 'مليون' };

/* 1..999 بالكلمات */
function under1000(n) {
  const h = Math.floor(n / 100), r = n % 100, parts = [];
  if (h) parts.push(HUNDREDS[h]);
  if (r) {
    if (r < 10) parts.push(ONES[r]);
    else if (r === 10) parts.push('عشرة');
    else if (r === 11) parts.push('أحد عشر');
    else if (r === 12) parts.push('اثنا عشر');
    else if (r < 20) parts.push(ONES[r - 10] + ' عشر');
    else parts.push((r % 10 ? ONES[r % 10] + ' و' : '') + TENS[Math.floor(r / 10)]);
  }
  return parts.join(' و');
}

/* عدد + معدوده. tail=true إذا جاء بعده جزء آخر (لا يتصل بالمعدود مباشرة) */
function counted(n, f, tail) {
  if (n === 1) return f.one;
  if (n === 2) return f.two;
  const r = n % 100, w = under1000(n);
  if (r >= 3 && r <= 10) return w + ' ' + f.few;
  if (r >= 11) return w + ' ' + (tail ? f.many : f.base);
  return w + ' ' + f.base;
}

/* العدد الصحيح بالكلمات بدون معدود نهائي (المعدود يُضاف لاحقًا) */
function intWords(n) {
  const m = Math.floor(n / 1e6), t = Math.floor((n % 1e6) / 1000), r = n % 1000, parts = [];
  if (m) parts.push(counted(m, MILLION, !!(t || r)));
  if (t) parts.push(counted(t, THOUSAND, !!r));
  if (r) parts.push(under1000(r));
  return parts.join(' و');
}

/* المبلغ الصحيح مع المعدود (جنيه / قرش) */
function amountWords(n, f) {
  if (n === 1) return f.one;
  if (n === 2) return f.two;
  let w = intWords(n);
  const r = n % 100;
  // مائتان/ألفان/مليونان تُحذف نونها عند الإضافة المباشرة للمعدود
  w = w.replace(/(مائتان|ألفان|مليونان)$/, (x) => x.slice(0, -1));
  if (r === 0 || (n > 100 && (r === 1 || r === 2))) return w + ' ' + f.base;
  if (r >= 3 && r <= 10) return w + ' ' + f.few;
  return w + ' ' + f.many;
}

/* tafqeet(3500) => "فقط ثلاثة آلاف وخمسمائة جنيه مصري لا غير" */
export function tafqeet(amount, { unit = EGP, sub = PIASTER } = {}) {
  const v = Math.round(Number(amount) * 100);
  if (!isFinite(v) || v < 0 || v > 99999999999) return '';
  const n = Math.floor(v / 100), p = v % 100;
  let s;
  if (!n && !p) s = 'صفر ' + unit.base;
  else if (!p) s = amountWords(n, unit);
  else if (!sub) s = (n ? amountWords(n, unit) : 'صفر ' + unit.base) + ' و' + p + '/100';
  else if (!n) s = amountWords(p, sub);
  else s = amountWords(n, unit) + ' و' + amountWords(p, sub);
  return 'فقط ' + s + ' لا غير';
}

/* عملة غير الجنيه: صيغة واحدة للمعدود */
export const plainUnit = (name) => ({ one: name + ' واحد', two: name + ' اثنان', few: name, many: name, base: name });

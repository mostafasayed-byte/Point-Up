/* الحفظ على الجهاز والمشاركة */
import { getPref, waNum } from './util.js';

export const hasPicker = typeof window !== 'undefined' && !!window.showSaveFilePicker;

/* يعيد رسالة نصية بنتيجة الحفظ */
export async function doSave(name, blob) {
  if (hasPicker && getPref('gpick', false)) {
    try {
      const h = await window.showSaveFilePicker({ suggestedName: name });
      const w = await h.createWritable();
      await w.write(blob);
      await w.close();
      return 'تم الحفظ: ' + name;
    } catch (e) {
      if (e && e.name === 'AbortError') return 'أُلغي الحفظ.';
      console.error(e);
    }
  }
  const u = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = u;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 60000);
  return 'تم التنزيل: ' + name;
}

/* كاش ملفات PDF الجاهزة للمشاركة (المشاركة تحتاج ضغطة مباشرة) */
const cache = new Map();
export function cachedFile(key, make, name) {
  if (!cache.has(key)) {
    const p = Promise.resolve().then(make).then((b) => new File([b], name, { type: b.type || 'application/pdf' }));
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return cache.get(key);
}

function whyNo(f) {
  if (!navigator.share) return 'هذا المتصفح لا يدعم المشاركة المباشرة';
  if (!navigator.canShare) return 'هذا المتصفح لا يدعم مشاركة الملفات';
  if (!navigator.canShare({ files: [f] })) return 'هذا المتصفح لا يدعم مشاركة هذا النوع من الملفات';
  return '';
}

/* يعيد {text, link?:{url,name}} */
export async function shareFile(f, text) {
  let why = whyNo(f);
  if (!why) {
    try {
      await navigator.share({ files: [f], title: f.name, text });
      return { text: 'تمت المشاركة.' };
    } catch (e) {
      if (e && e.name === 'AbortError') return { text: 'أُلغيت المشاركة.' };
      if (e && e.name === 'NotAllowedError') {
        return { text: 'الملف جاهز. اضغط زر المشاركة مرة أخرى الآن لإرساله (يطلب المتصفح ضغطة مباشرة).', link: { url: URL.createObjectURL(f), name: f.name } };
      }
      console.error(e);
      why = 'تعذرت المشاركة (' + ((e && e.name) || 'خطأ') + ')';
    }
  }
  const saved = await doSave(f.name, f);
  return { text: why + '. ' + saved + ' — جرّب زر "طرق أخرى للإرسال".', link: { url: URL.createObjectURL(f), name: f.name } };
}

/* يعيد {text, link?} */
export function openWa(phone, text, cc) {
  if (!String(phone || '').trim()) return { text: 'أدخل هاتف العميل أولاً.' };
  const n = waNum(phone, cc);
  if (n === 'NOCC') return { text: 'أدخل رمز الدولة في "بيانات الشركة" (مثال: 20 لمصر، 966 للسعودية) أو اكتب الرقم بصيغة دولية +…' };
  const url = 'https://wa.me/' + n + '?text=' + encodeURIComponent(text);
  const w = window.open(url, '_blank', 'noopener');
  if (w) return { text: 'تم فتح واتساب. أرسل الملف بزر "مشاركة" ثم اختر المحادثة.' };
  return { text: 'اضغط للفتح:', link: { url, name: 'فتح محادثة واتساب', external: true } };
}

export function waLink(phone, text, cc) {
  const n = waNum(phone, cc);
  return 'https://wa.me/' + (n && n !== 'NOCC' ? n : '') + '?text=' + encodeURIComponent(text);
}

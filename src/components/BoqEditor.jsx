import { useRef } from 'react';
import { fmt, nz, uuid, secTotal } from '../lib/util';

const blankLine = () => ({ id: uuid(), d: '', u: '', q: '', p: '' });
export const blankSec = () => ({ id: uuid(), name: '', items: [blankLine()] });
const str = (v) => (v === '' || v == null ? '' : String(v));

export const withIds = (secs) => (secs || []).map((s) => ({ id: uuid(), name: s.name || '', items: (s.items && s.items.length ? s.items : [{}]).map((i) => ({ id: uuid(), d: i.d || '', u: i.u || '', q: str(i.q), p: str(i.p) })) }));

/* تنظيف المقايسة قبل الإصدار: السعر والكمية يجوز يكونوا فاضيين */
export function cleanBoq(secs) {
  return secs
    .map((s) => ({
      name: (s.name || '').trim(),
      items: s.items.filter((i) => (i.d || '').trim()).map((i) => ({ d: i.d.trim(), u: (i.u || '').trim(), q: i.q === '' ? '' : nz(i.q), p: i.p === '' ? '' : nz(i.p) })),
    }))
    .filter((s) => s.name || s.items.length);
}

/* استيراد من Excel: صف الترويسة فيه "التوصيف" و"الكمية"، ثم B=التوصيف C=الوحدة D=الكمية E=الفئة */
export function parseBoqRows(rows) {
  const hi = rows.findIndex((r) => r.some((c) => String(c).includes('التوصيف')) && r.some((c) => String(c).includes('الكمية')));
  if (hi < 0) throw new Error('لم أجد صف العناوين (البند / التوصيف / الوحدة / الكمية)');
  const secs = [];
  let cur = null;
  for (const r of rows.slice(hi + 1)) {
    const b = String(r[1] ?? '').replace(/\s+/g, ' ').trim();
    if (!b) continue;
    const c = String(r[2] ?? '').replace(/\s+/g, ' ').trim(), dq = r[3] ?? '', e = r[4] ?? '';
    if (!c && dq === '' && e === '') { cur = { name: b, items: [] }; secs.push(cur); }
    else {
      if (!cur) { cur = { name: 'بنود', items: [] }; secs.push(cur); }
      cur.items.push({ d: b, u: c, q: dq === '' ? '' : dq, p: e === '' ? '' : e });
    }
  }
  if (!secs.length) throw new Error('لم أجد بنوداً في الملف');
  return secs;
}

export default function BoqEditor({ secs, setSecs }) {
  const box = useRef(null);
  const upd = (si, fn) => setSecs((a) => a.map((s, k) => (k === si ? fn(s) : s)));
  const updLine = (si, id, k, v) => upd(si, (s) => ({ ...s, items: s.items.map((i) => (i.id === id ? { ...i, [k]: v } : i)) }));
  const move = (si, d) => setSecs((a) => {
    const j = si + d;
    if (j < 0 || j >= a.length) return a;
    const b = a.slice();
    [b[si], b[j]] = [b[j], b[si]];
    return b;
  });
  const delSec = (si) => setSecs((a) => {
    const s = a[si];
    if (!(a.length > 1 || s.items.length > 1 || s.name)) return a;
    const b = a.filter((_, k) => k !== si);
    return b.length ? b : [blankSec()];
  });
  const addSec = () => {
    setSecs((a) => [...a, blankSec()]);
    setTimeout(() => { const l = box.current && box.current.querySelectorAll('.bsec'); if (l && l.length) l[l.length - 1].scrollIntoView({ behavior: 'smooth' }); }, 50);
  };

  return (
    <>
      <div ref={box}>
        {secs.map((s, si) => (
          <div className="bsec" key={s.id}>
            <div className="bh"><b>بند رئيسي {si + 1}</b></div>
            <input type="text" placeholder="اسم البند الرئيسي (مثال: أعمال الدهانات)" aria-label="اسم البند الرئيسي" value={s.name} onChange={(e) => { const v = e.target.value; upd(si, (x) => ({ ...x, name: v })); }} />
            <div className="acts">
              <button type="button" className="alt sm" aria-label="تحريك لأعلى" onClick={() => move(si, -1)}>▲</button>
              <button type="button" className="alt sm" aria-label="تحريك لأسفل" onClick={() => move(si, 1)}>▼</button>
              <button type="button" className="alt sm" aria-label="حذف البند الرئيسي" onClick={() => delSec(si)}>حذف البند</button>
            </div>
            {s.items.map((it) => (
              <div className="bit" key={it.id}>
                <textarea rows={2} placeholder="التوصيف" aria-label="التوصيف" value={it.d} onChange={(e) => updLine(si, it.id, 'd', e.target.value)} />
                <input list="units" type="text" placeholder="الوحدة" aria-label="الوحدة" value={it.u} onChange={(e) => updLine(si, it.id, 'u', e.target.value)} />
                <input type="number" inputMode="decimal" step="any" placeholder="الكمية" aria-label="الكمية" value={it.q} onChange={(e) => updLine(si, it.id, 'q', e.target.value)} />
                <input type="number" inputMode="decimal" step="any" placeholder="الفئة (السعر)" aria-label="الفئة" value={it.p} onChange={(e) => updLine(si, it.id, 'p', e.target.value)} />
                <div className="lt">{fmt(nz(it.q) * nz(it.p))}</div>
                <button type="button" className="rm" aria-label="حذف السطر" onClick={() => upd(si, (x) => (x.items.length > 1 ? { ...x, items: x.items.filter((i) => i.id !== it.id) } : { ...x, items: [blankLine()] }))}>حذف السطر</button>
              </div>
            ))}
            <div className="bf">
              <button type="button" className="alt sm" onClick={() => upd(si, (x) => ({ ...x, items: [...x.items, blankLine()] }))}>+ إضافة سطر</button>
              <span className="note">مجموع البند: {fmt(secTotal(s))}</span>
            </div>
          </div>
        ))}
      </div>
      <button className="alt big" type="button" onClick={addSec}>+ إضافة بند رئيسي</button>
      <datalist id="units">{['م2', 'م3', 'م.ط', 'عدد', 'مقطوعية', 'طن', 'كجم'].map((u) => <option key={u} value={u} />)}</datalist>
    </>
  );
}

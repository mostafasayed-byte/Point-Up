import { useEffect, useRef, useState } from 'react';
import { arErr } from '../lib/supabase';
import { issueContract, saveSettings } from '../lib/api';
import { CTYPES, OWNER, REP, builtin, tplFor, blankContract, loadDraft, saveDraft, newClause, conHtml, conText } from '../lib/contract';
import { today, coFrom } from '../lib/util';
import { useApp, Msg, busy, fail } from './common';
import PrintPreview from './PrintPreview';

const PENDING_NO = 'يُحدَّد عند الإصدار';

/* رسالة واضحة لو لم يُشغَّل ملف ترحيل العقود في Supabase */
function issueErr(e) {
  const m = String((e && e.message) || '');
  if ((e && (e.code === 'PGRST202' || e.code === '42883' || e.code === '23514')) || /issue_contract|stamp_register_kind_check/i.test(m)) {
    return 'خدمة العقود غير مفعّلة في قاعدة البيانات. شغّل ملف supabase/contracts_migration.sql في Supabase ثم أعد المحاولة.';
  }
  return arErr(e);
}

export default function ContractTab() {
  const app = useApp();
  const { org, settings } = app;
  const [d, setD] = useState(() => loadDraft() || blankContract('تشطيبات', settings));
  const [preview, setPreview] = useState(null); // 'draft' | 'final'
  const [working, setWorking] = useState(false);
  const [msg, setMsg] = useState(null);
  const [tplMsg, setTplMsg] = useState(null);
  const busyRef = useRef(false);

  useEffect(() => { saveDraft(d); }, [d]);

  const set = (k, v) => setD((c) => ({ ...c, [k]: v }));
  const setP = (p, k, v) => setD((c) => ({ ...c, [p]: { ...c[p], [k]: v } }));
  const setCl = (id, k, v) => setD((c) => ({ ...c, clauses: c.clauses.map((x) => (x.id === id ? { ...x, [k]: v } : x)) }));
  const move = (i, dr) => setD((c) => {
    const a = c.clauses.slice(), j = i + dr;
    if (j < 0 || j >= a.length) return c;
    [a[i], a[j]] = [a[j], a[i]];
    return { ...c, clauses: a };
  });
  const del = (id) => { if (window.confirm('حذف البند؟')) setD((c) => ({ ...c, clauses: c.clauses.filter((x) => x.id !== id) })); };

  const changeType = (t) => {
    if (t === d.ctype) return;
    if (!window.confirm('تحميل نموذج بنود «' + t + '»؟ سيتم استبدال البنود الحالية.')) return;
    setD((c) => ({ ...c, ctype: t, clauses: tplFor(t, settings) }));
  };

  const saveTpl = async () => {
    setTplMsg(busy('جارٍ الحفظ…'));
    try {
      const list = d.clauses.filter((c) => c.t.trim() || c.x.trim()).map((c) => ({ t: c.t, x: c.x }));
      const s = await saveSettings(org.id, { ...settings, contract_templates: { ...(settings.contract_templates || {}), [d.ctype]: list } });
      app.setSettings(s);
      setTplMsg('تم حفظ البنود الحالية كنموذج افتراضي لعقد «' + d.ctype + '» (مشترك بين الشريكين).');
    } catch (e) {
      setTplMsg(fail('تعذر الحفظ: ' + arErr(e)));
    }
  };

  const restoreTpl = () => {
    if (!window.confirm('استعادة البنود الأصلية لعقد «' + d.ctype + '»؟ سيتم استبدال البنود الحالية.')) return;
    setD((c) => ({ ...c, clauses: builtin(c.ctype) }));
    setTplMsg('تمت استعادة البنود الأصلية. لجعلها الافتراضية مجددًا اضغط «حفظ كنموذج افتراضي لهذا النوع».');
  };

  const fresh = () => {
    if (!window.confirm('مسح كل البيانات وبدء عقد جديد؟')) return;
    setD(blankContract(d.ctype, settings));
    setMsg(null);
    setTplMsg(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /* إصدار: رقم + سيريال يُسجَّلان فقط. إعادة الطباعة تستخدم نفس الرقم */
  const issue = async (renew) => {
    if (busyRef.current) return;
    if (!d.p1.name.trim()) return setMsg(fail('اكتب اسم الطرف الأول (العميل) أولاً.'));
    if (d.no && d.serial && !renew) { setMsg(null); return setPreview('final'); }
    if (renew && !window.confirm('إصدار رقم عقد جديد لهذه المسودة بدلًا من ' + d.no + '؟')) return;
    busyRef.current = true;
    setWorking(true);
    setMsg(busy('جارٍ إصدار رقم العقد…'));
    try {
      const r = await issueContract({ ctype: d.ctype, client: d.p1.name.trim() });
      if (!r || !r.no || !r.serial) throw new Error('لم يُرجع الخادم رقم العقد.');
      setD((c) => ({ ...c, no: r.no, serial: r.serial, issued_on: today() }));
      app.stampsChanged();
      setMsg('تم إصدار العقد رقم ' + r.no + ' — الرقم التسلسلي: ' + r.serial);
      setPreview('final');
    } catch (e) {
      console.error(e);
      setMsg(fail('تعذر إصدار رقم العقد، ولم تُفتح الطباعة: ' + issueErr(e)));
    } finally {
      busyRef.current = false;
      setWorking(false);
    }
  };

  const issued = !!(d.no && d.serial);
  const rep = d.p1.cap !== OWNER;
  const T = (label, val, on, props) => (
    <>
      <label>{label}</label>
      <input type="text" className="rtl" value={val} onChange={(e) => on(e.target.value)} {...props} />
    </>
  );

  const fin = preview === 'final';
  const no = fin ? d.no : '—', serial = fin ? d.serial : 'DRAFT';
  const co = coFrom(settings);

  return (
    <>
      <section>
        <h2>بيانات العقد</h2>
        <label htmlFor="c_type">نوع العقد (يحمّل نموذج بنود جاهز)</label>
        <select id="c_type" className="rtl-sel" value={d.ctype} onChange={(e) => changeType(e.target.value)}>
          {CTYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <label htmlFor="c_no">رقم العقد</label>
        <input type="text" id="c_no" readOnly className={issued ? 'ltr' : 'rtl'} value={issued ? d.no + '  ·  ' + d.serial : PENDING_NO} />
        {T('اسم المشروع / وصف العمل', d.title, (v) => set('title', v))}
        <div className="g2">
          <div><label htmlFor="c_date">تاريخ العقد</label><input type="date" id="c_date" value={d.date} onChange={(e) => set('date', e.target.value)} /></div>
          <div><label htmlFor="c_val">قيمة العقد (جنيه، اختياري)</label><input type="number" id="c_val" min="0" inputMode="decimal" value={d.val} onChange={(e) => set('val', e.target.value)} /></div>
        </div>
        {T('موقع التنفيذ', d.place, (v) => set('place', v))}
        {T('مدة التنفيذ (مثال: 90 يومًا)', d.dur, (v) => set('dur', v))}
      </section>

      <section>
        <h2>الطرف الأول (العميل)</h2>
        {T('الاسم بالكامل', d.p1.name, (v) => setP('p1', 'name', v))}
        <div className="g2">
          <div><label htmlFor="c_nid">رقم البطاقة (14 رقمًا)</label><input type="text" id="c_nid" className="ltr" inputMode="numeric" maxLength={14} value={d.p1.nid} onChange={(e) => setP('p1', 'nid', e.target.value.replace(/\D/g, '').slice(0, 14))} /></div>
          <div><label htmlFor="c_ph">رقم التليفون</label><input type="tel" id="c_ph" value={d.p1.phone} onChange={(e) => setP('p1', 'phone', e.target.value)} /></div>
        </div>
        {d.p1.nid && d.p1.nid.length !== 14 && <div className="note err">رقم البطاقة يجب أن يكون 14 رقمًا ({d.p1.nid.length} الآن).</div>}
        {T('العنوان', d.p1.addr, (v) => setP('p1', 'addr', v))}
        <label htmlFor="c_cap">صفة الموقّع</label>
        <select id="c_cap" className="rtl-sel" value={rep ? REP : OWNER} onChange={(e) => setP('p1', 'cap', e.target.value)}>
          <option value={OWNER}>المالك</option>
          <option value={REP}>نائب / وكيل عن المالك</option>
        </select>
        {rep && (
          <>
            {T('اسم المالك الأصلي', d.p1.owner, (v) => setP('p1', 'owner', v))}
            {T('توضيح الصفة (وكالة رقم / تفويض / مدير...)', d.p1.capNote, (v) => setP('p1', 'capNote', v))}
          </>
        )}
      </section>

      <section>
        <h2>الطرف الثاني (المقاول): شركة بوينت أب</h2>
        <div className="g2">
          <div>{T('اسم الممثل عن الشركة', d.p2.name, (v) => setP('p2', 'name', v))}</div>
          <div>{T('صفته', d.p2.title, (v) => setP('p2', 'title', v))}</div>
        </div>
        <p className="note">العنوان والسجل التجاري والرقم الضريبي تُطبع تلقائيًا من بيانات الشركة (الموجود منها فقط).</p>
      </section>

      <section>
        <h2>بنود العقد ({d.clauses.length})</h2>
        {d.clauses.map((c, i) => (
          <div className="cx-cl" key={c.id}>
            <div className="cx-clh">
              <b>البند ({i + 1})</b>
              <input type="text" className="rtl" placeholder="عنوان البند" aria-label={'عنوان البند ' + (i + 1)} value={c.t} onChange={(e) => setCl(c.id, 't', e.target.value)} />
              <button className="alt sm" type="button" aria-label="تحريك لأعلى" disabled={i === 0} onClick={() => move(i, -1)}>▲</button>
              <button className="alt sm" type="button" aria-label="تحريك لأسفل" disabled={i === d.clauses.length - 1} onClick={() => move(i, 1)}>▼</button>
              <button className="danger sm" type="button" aria-label="حذف البند" onClick={() => del(c.id)}>✕</button>
            </div>
            <textarea rows={4} placeholder="وصف البند" aria-label={'وصف البند ' + (i + 1)} value={c.x} onChange={(e) => setCl(c.id, 'x', e.target.value)} />
          </div>
        ))}
        <button className="alt" type="button" style={{ marginTop: 10 }} onClick={() => setD((c) => ({ ...c, clauses: [...c.clauses, newClause()] }))}>＋ بند جديد</button>
        <div className="acts">
          <button className="alt sm" type="button" onClick={saveTpl}>حفظ كنموذج افتراضي لهذا النوع</button>
          <button className="alt sm" type="button" onClick={restoreTpl}>استعادة النموذج الأصلي</button>
        </div>
        <Msg m={tplMsg} />
      </section>

      <section>
        <label htmlFor="c_notes" style={{ marginTop: 0 }}>ملاحظة في آخر العقد (اختياري)</label>
        <textarea id="c_notes" className="cx-ta" rows={3} value={d.notes} onChange={(e) => set('notes', e.target.value)} />
      </section>

      <section>
        <button className="big" type="button" disabled={working} onClick={() => issue(false)}>{issued ? 'طباعة العقد رقم ' + d.no : 'إصدار وطباعة'}</button>
        <div className="acts">
          <button className="alt" type="button" onClick={() => setPreview('draft')}>معاينة (مسودة)</button>
          {issued && <button className="alt" type="button" disabled={working} onClick={() => issue(true)}>إصدار رقم جديد</button>}
          <button className="danger" type="button" onClick={fresh}>عقد جديد (مسح)</button>
        </div>
        <Msg m={msg} />
        <p className="note">يُحفظ العقد تلقائيًا كمسودة على هذا الجهاز فقط ولا يُرسل محتواه لقاعدة البيانات. عند الإصدار يُسجَّل رقم العقد والرقم التسلسلي ونوع العقد واسم العميل فقط للتحقق، وإعادة الطباعة تستخدم نفس الرقم.</p>
      </section>

      {preview && (
        <PrintPreview
          fileName={fin ? 'عقد_' + d.no + '_' + d.serial : 'عقد_مسودة'}
          serial={serial}
          defaults={{ sz: 'A4', or: 'portrait' }}
          text={conText(d, no)}
          phone={d.p1.phone}
          onClose={() => setPreview(null)}
          build={(o) => conHtml(d, { ...o, no, serial, draft: !fin, date: fin ? d.issued_on || today() : today(), co })}
        />
      )}
    </>
  );
}

import { useEffect, useRef, useState } from 'react';
import { arErr } from '../lib/supabase';
import { issueReceipt, voidReceipt, listReceipts, allReceipts, paidBefore, knownClients, forgetClients } from '../lib/api';
import { PURPOSES, RC_PAPER, curName, amountWords, balance, rcHtml, rcText, rcWaText, rcXlsx, statusName } from '../lib/receipt';
import { arDate } from '../lib/contract';
import { doSave, openWa } from '../lib/files';
import { fmt, today, coFrom, copyText, errMsg } from '../lib/util';
import { useApp, Msg, Check, busy, fail } from './common';
import PrintPreview from './PrintPreview';

const PENDING_NO = 'يُحدَّد عند الإصدار';
const OTHER = 'أخرى';

/* أرقام فقط بحد أقصى خانتين عشريتين (يقبل الأرقام العربية) */
function cleanAmt(v) {
  v = String(v).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/٫/g, '.').replace(/[^\d.]/g, '');
  const [i, ...f] = v.split('.');
  return f.length ? i + '.' + f.join('').slice(0, 2) : i;
}

function rcErr(e) {
  const m = String((e && e.message) || '');
  if ((e && (e.code === 'PGRST202' || e.code === '42883' || e.code === '42P01')) || /issue_receipt|void_receipt|relation .*receipts/i.test(m)) {
    return 'خدمة الإيصالات غير مفعّلة في قاعدة البيانات. شغّل ملف supabase/receipts_migration.sql في Supabase ثم أعد المحاولة.';
  }
  if (/client_required/.test(m)) return 'اسم العميل مطلوب.';
  if (/amount_required/.test(m)) return 'المبلغ يجب أن يكون أكبر من صفر.';
  if (/reason_required/.test(m)) return 'سبب الإلغاء إلزامي.';
  if (/not_found_or_already_void/.test(m)) return 'الإيصال ملغي بالفعل أو غير موجود.';
  return arErr(e);
}

const blankForm = (who, keep) => ({
  date: today(), client: keep ? keep.client : '', phone: keep ? keep.phone : '', project: keep ? keep.project : '',
  amount: '', purpose: PURPOSES[1], other: '', notes: '', total: keep ? keep.total : '', by: who || '',
});

export default function ReceiptTab({ active }) {
  const app = useApp();
  const { org, settings, member } = app;
  const who = (member && member.display_name) || '';
  const [f, setF] = useState(() => blankForm(who));
  const [keepClient, setKeepClient] = useState(false);
  const [open, setOpen] = useState(true);
  const [clients, setClients] = useState(null);
  const [prev, setPrev] = useState(null); // {busy}|{amt}|{err}
  const [working, setWorking] = useState(false);
  const [msg, setMsg] = useState(null);
  const [preview, setPreview] = useState(null); // {row, prev, draft, copy}
  const busyRef = useRef(false);
  const co = coFrom(settings);
  const cur = curName(co.cur);

  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const words = amountWords(f.amount, co.cur);

  useEffect(() => {
    if (active && !clients) knownClients().then(setClients).catch(() => setClients(new Map()));
  }, [active, clients]);

  /* المسدد سابقًا لنفس العميل والمشروع */
  useEffect(() => {
    const c = f.client.trim(), p = f.project.trim();
    if (!c || !p) { setPrev(null); return undefined; }
    let off = false;
    setPrev({ busy: true });
    const t = setTimeout(() => {
      paidBefore(c, p).then((amt) => { if (!off) setPrev({ amt }); }).catch((e) => { if (!off) setPrev({ err: rcErr(e) }); });
    }, 450);
    return () => { off = true; clearTimeout(t); };
  }, [f.client, f.project]);

  const cEntry = clients && clients.get(f.client.trim().toLowerCase());
  const projOpts = cEntry && cEntry.projects.size ? [...cEntry.projects] : clients ? [...new Set([...clients.values()].flatMap((x) => [...x.projects]))].slice(0, 200) : [];

  const purpose = f.purpose === OTHER ? f.other.trim() : f.purpose;
  const asRow = () => ({
    receipt_date: f.date || today(), client: f.client.trim(), client_phone: f.phone.trim() || null, project: f.project.trim() || null,
    amount: Number(f.amount) || 0, amount_words: words, currency: co.cur.trim() || null, purpose, notes: f.notes.trim() || null,
    contract_total: Number(f.total) > 0 ? Number(f.total) : null, received_by: f.by.trim() || null,
    company_snapshot: { ...co, name: org.name },
  });

  const validate = () => {
    if (!f.client.trim()) return 'اكتب اسم العميل.';
    if (!(Number(f.amount) > 0)) return 'اكتب المبلغ المستلم (أكبر من صفر).';
    if (f.purpose === OTHER && !f.other.trim()) return 'اكتب غرض الدفعة.';
    return '';
  };

  const draftPreview = () => {
    const err = validate();
    if (err) return setMsg(fail(err));
    setMsg(null);
    setPreview({ row: { ...asRow(), no: '—', serial: 'DRAFT', status: 'active' }, prev: (prev && prev.amt) || 0, draft: true });
  };

  const [ver, setVer] = useState(0);

  const issue = async () => {
    if (busyRef.current) return;
    const err = validate();
    if (err) return setMsg(fail(err));
    busyRef.current = true;
    setWorking(true);
    setMsg(busy('جارٍ إصدار الإيصال…'));
    try {
      const row = await issueReceipt(asRow());
      if (!row || !row.no || !row.serial) throw new Error('لم يُرجع الخادم بيانات الإيصال.');
      let p = 0;
      if (row.project) { try { p = await paidBefore(row.client, row.project, row.created_at); } catch (e) { p = (prev && prev.amt) || 0; } }
      setPreview({ row, prev: p, draft: false, copy: false });
      setF(blankForm(who, keepClient ? f : null));
      setOpen(false);
      forgetClients();
      setClients(null);
      app.stampsChanged();
      setVer((n) => n + 1);
      setMsg('تم إصدار الإيصال رقم ' + row.no + ' — الرقم التسلسلي: ' + row.serial);
    } catch (e) {
      console.error(e);
      setMsg(fail('تعذر إصدار الإيصال (البيانات محفوظة في النموذج): ' + rcErr(e)));
    } finally {
      busyRef.current = false;
      setWorking(false);
    }
  };

  const fin = preview && !preview.draft;

  return (
    <>
      <section>
        <div className="bf" style={{ marginTop: 0 }}>
          <h2 style={{ margin: 0 }}>إيصال استلام نقدية</h2>
          <button className="alt sm" type="button" onClick={() => setOpen((o) => !o)}>{open ? 'إخفاء النموذج' : 'إيصال جديد'}</button>
        </div>
        {open && (
          <>
            <label htmlFor="r_no">رقم الإيصال</label>
            <input type="text" id="r_no" className="rtl" readOnly value={PENDING_NO} />
            <label htmlFor="r_date">التاريخ</label>
            <input type="date" id="r_date" value={f.date} onChange={(e) => set('date', e.target.value)} />
            <label htmlFor="r_client">اسم العميل (المُسلِّم) *</label>
            <input type="text" id="r_client" className="rtl" list="rc-clients" autoComplete="off" value={f.client} onChange={(e) => set('client', e.target.value)} />
            <datalist id="rc-clients">{clients && [...clients.values()].map((c) => <option key={c.name} value={c.name} />)}</datalist>
            <div className="g2">
              <div><label htmlFor="r_phone">هاتف العميل</label><input type="tel" id="r_phone" value={f.phone} onChange={(e) => set('phone', e.target.value)} /></div>
              <div><label htmlFor="r_proj">المشروع</label><input type="text" id="r_proj" className="rtl" list="rc-projects" autoComplete="off" value={f.project} onChange={(e) => set('project', e.target.value)} /></div>
            </div>
            <datalist id="rc-projects">{projOpts.map((p) => <option key={p} value={p} />)}</datalist>
            <label htmlFor="r_amt">المبلغ المستلم ({cur}) *</label>
            <input type="text" id="r_amt" className="ltr" inputMode="decimal" value={f.amount} onChange={(e) => set('amount', cleanAmt(e.target.value))} placeholder="0.00" />
            <div className="rc-words" aria-live="polite">{words || 'اكتب المبلغ ليظهر كتابةً'}</div>
            <label htmlFor="r_purpose">غرض الدفعة</label>
            <select id="r_purpose" className="rtl-sel" value={f.purpose} onChange={(e) => set('purpose', e.target.value)}>
              {PURPOSES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            {f.purpose === OTHER && <input type="text" className="rtl" aria-label="غرض الدفعة" placeholder="اكتب غرض الدفعة" style={{ marginTop: 6 }} value={f.other} onChange={(e) => set('other', e.target.value)} />}
            <div className="g2">
              <div><label htmlFor="r_total">إجمالي التعاقد (اختياري)</label><input type="text" id="r_total" className="ltr" inputMode="decimal" value={f.total} onChange={(e) => set('total', cleanAmt(e.target.value))} /></div>
              <div><label htmlFor="r_by">المستلم (الموظف)</label><input type="text" id="r_by" className="rtl" value={f.by} onChange={(e) => set('by', e.target.value)} /></div>
            </div>
            <label htmlFor="r_notes">ملاحظات (اختياري)</label>
            <textarea id="r_notes" className="cx-ta" rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)} />
            <p className="note">طريقة السداد: <b>نقدًا</b></p>
            {prev && (
              <div className="note">
                {prev.busy && <><span className="spin" />جارٍ حساب المسدد سابقًا…</>}
                {prev.err && <span className="err">تعذر حساب المسدد سابقًا: {prev.err}</span>}
                {prev.amt != null && (() => {
                  const b = balance({ amount: f.amount, contract_total: f.total }, prev.amt);
                  return <>المسدد سابقًا: <b>{fmt(prev.amt)}</b> — بعد هذا الإيصال: <b>{fmt(b.paid)}</b>{b.total ? <> — المتبقي: <b>{fmt(b.rest)}</b></> : null}</>;
                })()}
              </div>
            )}
            <Check checked={keepClient} onChange={setKeepClient}>إيصال آخر لنفس العميل (الاحتفاظ بالعميل والمشروع بعد الإصدار)</Check>
            <button className="big" type="button" disabled={working} onClick={issue}>إصدار وطباعة</button>
            <button className="alt big" type="button" onClick={draftPreview}>معاينة (مسودة)</button>
          </>
        )}
        <Msg m={msg} />
        <p className="note">الإيصال الصادر لا يُعدَّل ولا يُحذف؛ لتصحيح خطأ: ألغِ الإيصال بسبب واضح ثم أصدر إيصالًا جديدًا.</p>
      </section>

      <ReceiptHistory active={active} ver={ver} onPrint={setPreview} />

      {preview && (
        <PrintPreview
          fileName={fin ? 'إيصال_' + preview.row.no + '_' + preview.row.serial : 'إيصال_مسودة'}
          serial={fin ? preview.row.serial : 'DRAFT'}
          defaults={RC_PAPER}
          fitOne
          text={rcText(preview.row)}
          phone={preview.row.client_phone}
          onClose={() => setPreview(null)}
          build={(o) => rcHtml(preview.row, { ...o, prev: preview.prev, copy: preview.copy, draft: preview.draft })}
        />
      )}
    </>
  );
}

const STATUS = [['all', 'الكل'], ['active', 'سارية'], ['void', 'ملغية']];

function ReceiptHistory({ active, ver, onPrint }) {
  const app = useApp();
  const [q, setQ] = useState('');
  const [dq, setDq] = useState('');
  const [status, setStatus] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [rows, setRows] = useState(null);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(0);
  const [sum, setSum] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState(null);
  const [xmsg, setXmsg] = useState(null);
  const [asCopy, setAsCopy] = useState(false);
  const reqId = useRef(0);
  const filt = { q: dq, status, from, to };

  useEffect(() => { const t = setTimeout(() => setDq(q), 350); return () => clearTimeout(t); }, [q]);

  const load = async (pg) => {
    const id = ++reqId.current;
    setLoading(true);
    setErr('');
    try {
      const [d, all] = await Promise.all([listReceipts({ page: pg, ...filt }), pg === 0 ? allReceipts(filt) : Promise.resolve(null)]);
      if (id !== reqId.current) return;
      setRows((r) => (pg === 0 ? d.rows : [...(r || []), ...d.rows]));
      setCount(d.count);
      setPage(pg);
      if (all) {
        const act = all.filter((r) => r.status !== 'void');
        const keys = new Set(act.map((r) => (r.client || '').trim().toLowerCase() + '|' + (r.project || '').trim().toLowerCase()));
        setSum({ n: act.length, total: act.reduce((s, r) => s + (Number(r.amount) || 0), 0), one: dq && act.length && keys.size === 1 && act[0].project ? act[0] : null });
      }
    } catch (e) {
      if (id === reqId.current) setErr(rcErr(e));
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  };

  useEffect(() => { if (active) load(0); }, [active, dq, status, from, to, ver]); // eslint-disable-line react-hooks/exhaustive-deps

  const reprint = async (r) => {
    let p = 0;
    if (r.project) {
      setMsg(busy('جارٍ التجهيز…'));
      try { p = await paidBefore(r.client, r.project, r.created_at); } catch (e) { return setMsg(fail('تعذر حساب المسدد سابقًا: ' + rcErr(e))); }
    }
    setMsg(null);
    onPrint({ row: r, prev: p, draft: false, copy: asCopy });
  };

  const doVoid = async (r) => {
    const reason = window.prompt('سبب إلغاء الإيصال ' + r.no + ' (إلزامي):', '');
    if (reason == null) return;
    if (!reason.trim()) return setMsg(fail('سبب الإلغاء إلزامي، لم يُلغَ الإيصال.'));
    if (!window.confirm('تأكيد إلغاء الإيصال ' + r.no + ' بمبلغ ' + fmt(r.amount) + '؟ لا يمكن التراجع عن الإلغاء.')) return;
    setMsg(busy('جارٍ الإلغاء…'));
    try {
      await voidReceipt(r.id, reason.trim());
      setMsg('تم إلغاء الإيصال ' + r.no + '.');
      load(0);
    } catch (e) {
      setMsg(fail('تعذر الإلغاء: ' + rcErr(e)));
    }
  };

  const xl = async () => {
    setXmsg(busy('جارٍ التجهيز…'));
    try {
      const all = await allReceipts(filt);
      if (!all.length) return setXmsg('لا توجد إيصالات بهذا البحث.');
      setXmsg(await doSave('pointup-receipts-' + today() + '.xlsx', await rcXlsx(all)));
    } catch (e) {
      setXmsg(fail('تعذر التصدير: ' + errMsg(e)));
    }
  };

  return (
    <section>
      <h2>سجل الإيصالات</h2>
      <label htmlFor="rh_q">بحث بالعميل أو المشروع أو الرقم</label>
      <input type="text" id="rh_q" className="rtl" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="g2">
        <div><label htmlFor="rh_st">الحالة</label>
          <select id="rh_st" className="rtl-sel" value={status} onChange={(e) => setStatus(e.target.value)}>{STATUS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </div>
        <div />
        <div><label htmlFor="rh_from">من تاريخ</label><input type="date" id="rh_from" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><label htmlFor="rh_to">إلى تاريخ</label><input type="date" id="rh_to" value={to} onChange={(e) => setTo(e.target.value)} /></div>
      </div>
      {sum && (
        <div className="tot">
          <div><span>الإيصالات السارية: {sum.n}</span><b>{fmt(sum.total)}</b></div>
          {sum.one && <div className="g"><span>إجمالي المسدد — {sum.one.client} / {sum.one.project}</span><span>{fmt(sum.total)}</span></div>}
        </div>
      )}
      <Check checked={asCopy} onChange={setAsCopy}>طباعة كنسخة (تظهر علامة «نسخة» عند إعادة الطباعة)</Check>
      <Msg m={msg} />
      {err && <div><Msg m={fail('تعذر تحميل السجل: ' + err)} /><button className="alt" type="button" onClick={() => load(0)}>إعادة المحاولة</button></div>}
      {!rows && !err && <div className="note"><span className="spin" />جارٍ التحميل…</div>}
      {rows && !rows.length && <p className="note">لا توجد إيصالات.</p>}
      {rows && rows.map((r) => {
        const v = r.status === 'void';
        return (
          <div className={'inv rc-row' + (v ? ' rc-v' : '')} key={r.id}>
            <div className="bf" style={{ marginTop: 0 }}>
              <b>{r.no}</b>
              <span className={'rc-badge' + (v ? ' v' : '')}>{statusName(r.status)}</span>
            </div>
            <div className="rc-main">{r.client}{r.project ? ' — ' + r.project : ''}</div>
            <div className="note" style={{ marginTop: 2 }}>{arDate(r.receipt_date)} · <b>{fmt(r.amount)} {curName(r.currency)}</b>{r.purpose ? ' · ' + r.purpose : ''}</div>
            {v && <div className="note err" style={{ marginTop: 2 }}>ملغي{r.void_reason ? ' — السبب: ' + r.void_reason : ''}</div>}
            <div className="acts">
              <button className="alt sm" type="button" onClick={() => reprint(r)}>عرض / طباعة</button>
              {!v && <button className="danger sm" type="button" onClick={() => doVoid(r)}>إلغاء</button>}
              <button className="alt sm" type="button" onClick={() => setMsg(openWa(r.client_phone, rcWaText(r), app.settings.cc))}>واتساب للعميل</button>
              <button className="alt sm" type="button" onClick={async () => setMsg((await copyText(rcText(r))) ? 'تم نسخ نص الإيصال.' : fail('تعذر النسخ التلقائي.'))}>نسخ نص الإيصال</button>
            </div>
          </div>
        );
      })}
      {rows && rows.length < count && <button className="alt big" type="button" disabled={loading} onClick={() => load(page + 1)}>{loading ? 'جارٍ التحميل…' : 'تحميل المزيد (' + rows.length + ' من ' + count + ')'}</button>}
      <button className="alt" type="button" style={{ marginTop: 10 }} onClick={xl}>تصدير Excel</button>
      <Msg m={xmsg} />
    </section>
  );
}

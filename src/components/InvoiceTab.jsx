import { useEffect, useMemo, useRef, useState } from 'react';
import BOQ_TPL from '../data/boq_template.json';
import { arErr } from '../lib/supabase';
import { issueDocument, saveSettings, uploadBlob, removeFiles, fileUrl, attachmentPaths } from '../lib/api';
import { docCanvases, docAssets, QR_DEFAULT } from '../lib/docRender';
import { exportDoc, shareDoc, waDoc, sendOpts, prewarmDoc } from '../lib/docActions';
import { toImgUrl } from '../lib/watermark';
import { fmt, nz, today, totals, boqTotal, shrinkToBlob, uuid, getPref, setPref, errMsg } from '../lib/util';
import { useApp, Msg, PagesView, Check, busy, fail } from './common';
import BoqEditor, { blankSec, withIds, cleanBoq, parseBoqRows } from './BoqEditor';
import SendDialog from './SendDialog';

const PENDING_NO = 'سيُحدَّد عند الإصدار';
const blankItem = () => ({ id: uuid(), d: '', q: '', p: '' });
const coFrom = (s) => ({ addr: s.addr || '', phone: s.phone || '', tax: s.tax || '', cr: s.cr == null || s.cr === '' ? '313026' : s.cr, cc: s.cc || '', cur: s.cur || '' });

export default function InvoiceTab({ cloneReq }) {
  const app = useApp();
  const { org, settings } = app;
  const [type, setType] = useState('invoice');
  const [co, setCo] = useState(() => coFrom(settings));
  const [coMsg, setCoMsg] = useState(null);
  const [qrMsg, setQrMsg] = useState({});
  const [date, setDate] = useState(today());
  const [client, setClient] = useState('');
  const [cphone, setCphone] = useState('');
  const [proj, setProj] = useState('');
  const [items, setItems] = useState([blankItem()]);
  const [disc, setDisc] = useState('0');
  const [vat, setVat] = useState('0');
  const [notes, setNotes] = useState('');
  const [secs, setSecs] = useState([blankSec()]);
  const [att, setAtt] = useState([]); // [{blob,url}]
  const [prefs, setPrefs] = useState(() => getPref('pref', { p: false, x: false }));
  const [preview, setPreview] = useState(null);
  const [issued, setIssued] = useState(null);
  const [working, setWorking] = useState(false);
  const [failed, setFailed] = useState(false);
  const [msg, setMsg] = useState(null);
  const [msg2, setMsg2] = useState(null);
  const [send, setSend] = useState(null);
  const attRef = useRef(null);
  const B = type === 'boq', Q = type === 'quote';

  useEffect(() => { setCo(coFrom(settings)); }, [org.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const updPrefs = (k, v) => { const p = { ...prefs, [k]: v }; setPrefs(p); setPref('pref', p); };

  /* ===== بيانات الشركة ===== */
  const saveCo = async () => {
    setCoMsg(busy('جارٍ الحفظ…'));
    try {
      const s = await saveSettings(org.id, { ...settings, ...co });
      app.setSettings(s);
      setCoMsg('تم حفظ بيانات الشركة.');
    } catch (e) {
      setCoMsg(fail('تعذر الحفظ: ' + arErr(e)));
    }
  };

  const uploadQr = async (k, f) => {
    if (!f) return;
    setQrMsg((m) => ({ ...m, [k]: busy('جارٍ الرفع…') }));
    let path = '';
    try {
      const blob = await shrinkToBlob(f, 320, 0.9);
      path = await uploadBlob(`${org.id}/branding/qr_${k}-${Date.now()}.jpg`, blob);
      const s = await saveSettings(org.id, { ...settings, ['qr_' + k + '_path']: path });
      app.setSettings(s);
      setQrMsg((m) => ({ ...m, [k]: 'تم رفع الباركود.' }));
    } catch (e) {
      if (path) removeFiles([path]);
      setQrMsg((m) => ({ ...m, [k]: fail('تعذر رفع الصورة: ' + arErr(e)) }));
    }
  };

  /* ===== الحسابات ===== */
  const liveItems = items.map((i) => ({ d: i.d.trim(), q: nz(i.q), p: nz(i.p) })).filter((i) => i.d || i.q || i.p);
  const t = totals(liveItems, disc, vat);
  const grand = useMemo(() => boqTotal(secs), [secs]);

  const setItem = (id, k, v) => setItems((a) => a.map((i) => (i.id === id ? { ...i, [k]: v } : i)));
  const addItem = () => {
    if (Q && items.length >= 30) return setMsg(fail('عرض السعر حده الأقصى 30 سطراً.'));
    setItems((a) => [...a, blankItem()]);
  };

  /* ===== المرفقات ===== */
  const addAtt = async (files) => {
    const next = att.slice();
    for (const f of files) {
      if (next.length >= 2) { setMsg(fail('الحد الأقصى صورتان.')); break; }
      try {
        const blob = await shrinkToBlob(f, 800, 0.68);
        next.push({ blob, url: URL.createObjectURL(blob) });
      } catch (e) { setMsg(fail('تعذر قراءة إحدى الصور.')); }
    }
    setAtt(next);
  };

  /* ===== بناء المستند ===== */
  const buildDoc = () => {
    const snapshot = { ...settings, ...co, name: org.name };
    const base = { type, doc_date: date || today(), client: client.trim(), client_phone: cphone.trim() || null, project: proj.trim() || null, notes: notes.trim(), currency: co.cur.trim(), company_snapshot: snapshot };
    if (B) {
      const boq = cleanBoq(secs);
      const g = boqTotal(boq);
      return { ...base, items: [], boq, discount: 0, vat_rate: 0, subtotal: g, vat_amount: 0, total: g };
    }
    const its = liveItems.filter((i) => i.d && i.q > 0);
    const tt = totals(its, disc, vat);
    return { ...base, items: its, boq: [], discount: nz(disc), vat_rate: nz(vat), subtotal: tt.sub, vat_amount: tt.vat, total: tt.total };
  };
  const hasContent = (d) => (d.type === 'boq' ? d.boq.some((s) => s.items.length) : d.items.length > 0);

  const validate = (d) => {
    if (!hasContent(d)) return 'أضف بنداً واحداً على الأقل (بيان' + (d.type === 'boq' ? '' : ' + كمية') + ').';
    if (d.type === 'quote' && d.items.length > 30) return 'عرض السعر حده الأقصى 30 سطراً.';
    return '';
  };

  const doPreview = async () => {
    const d = { ...buildDoc(), no: PENDING_NO, serial: 'DRAFT', attachments: [] };
    const err = validate(d);
    if (err) return setMsg(fail(err));
    setMsg(busy('جارٍ تجهيز المعاينة…'));
    try {
      const assets = await docAssets(d);
      assets.imgs = B ? [] : att.map((a) => a.url);
      const cs = await docCanvases(d, assets);
      setPreview(cs.map((c) => toImgUrl(c, 0.8)));
      setMsg(null);
    } catch (e) {
      console.error(e);
      setMsg(fail('تعذر تجهيز المعاينة: ' + errMsg(e)));
    }
  };

  const issue = async () => {
    if (issued || working) return;
    const d = buildDoc();
    if (!d.client) { setMsg(fail(B ? 'اكتب اسم الجهة / العميل أولاً.' : 'اكتب اسم العميل أولاً.')); document.getElementById('i_client').focus(); return; }
    const err = validate(d);
    if (err) return setMsg(fail(err));
    setWorking(true);
    setMsg2(null);
    const uploaded = [];
    try {
      if (!B) {
        for (let i = 0; i < att.length; i++) {
          setMsg(busy('جارٍ رفع المرفقات (' + (i + 1) + ' من ' + att.length + ')…'));
          uploaded.push(await uploadBlob(`${org.id}/attachments/${uuid()}.jpg`, att[i].blob));
        }
      }
      setMsg(busy('جارٍ الإصدار والحفظ…'));
      const row = await issueDocument({ ...d, attachments: uploaded });
      if (!row || !row.no) throw new Error('لم يُرجع الخادم بيانات المستند.');
      setIssued(row);
      setFailed(false);
      setPreview(null);
      prewarmDoc(row);
      app.docsChanged();
      setMsg('تم إصدار ' + (Q ? 'عرض السعر ' : B ? 'المقايسة ' : 'الفاتورة ') + row.no + ' — حُفظ في السجل الدائم للشركة. الرقم التسلسلي: ' + row.serial);
      if (prefs.p) setMsg2(await exportDoc(row, 'pdf'));
      if (prefs.x) { const r = await exportDoc(row, 'xl'); setMsg2((m) => (m ? { ...r, text: (m.text || m) + ' — ' + r.text } : r)); }
    } catch (e) {
      console.error(e);
      await removeFiles(uploaded);
      setFailed(true);
      setMsg(fail('لم يتم الإصدار: ' + arErr(e) + ' — بياناتك ما زالت على الشاشة، اضغط "إعادة المحاولة".'));
    } finally {
      setWorking(false);
    }
  };

  const reset = () => {
    setIssued(null); setFailed(false);
    att.forEach((a) => URL.revokeObjectURL(a.url));
    setAtt([]); setClient(''); setCphone(''); setProj(''); setNotes(''); setDisc('0'); setVat('0');
    setItems([blankItem()]); setSecs([blankSec()]); setDate(today()); setMsg(null); setMsg2(null); setPreview(null);
  };

  const changeType = (ty) => {
    if (issued) return setMsg(fail('اضغط "مستند جديد" أولاً لتبدأ مستنداً آخر.'));
    setType(ty);
    setPreview(null);
  };

  /* ===== نسخة جديدة للتعديل من السجل ===== */
  useEffect(() => {
    if (!cloneReq) return;
    const r = cloneReq.row;
    (async () => {
      reset();
      setType(r.type || 'invoice');
      setClient(r.client || ''); setCphone(r.client_phone || ''); setProj(r.project || ''); setNotes(r.notes || '');
      setDisc(String(nz(r.discount))); setVat(String(nz(r.vat_rate)));
      const its = (r.items || []).map((i) => ({ id: uuid(), d: i.d || '', q: String(i.q ?? ''), p: String(i.p ?? '') }));
      setItems(its.length ? its : [blankItem()]);
      setSecs(r.type === 'boq' && (r.boq || []).length ? withIds(r.boq) : [blankSec()]);
      const paths = attachmentPaths(r.attachments);
      let note = '';
      if (paths.length) {
        try {
          const a = [];
          for (const p of paths) { const blob = await (await fetch(await fileUrl(p))).blob(); a.push({ blob, url: URL.createObjectURL(blob) }); }
          setAtt(a);
        } catch (e) { note = ' (تعذر نسخ المرفقات)'; }
      }
      setMsg('تم نسخ ' + r.no + ' كمسودة جديدة. راجعها ثم أصدرها برقم جديد.' + note);
    })();
  }, [cloneReq]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ===== المقايسة ===== */
  const loadTpl = () => {
    setSecs(withIds(BOQ_TPL));
    setProj('فرع مدينة المستقبل');
    setMsg('تم تحميل نموذج مقايسة فرع المستقبل (' + BOQ_TPL.length + ' بنداً رئيسياً). عدّل أو أضف ما شئت ثم عاين وأصدر.');
  };
  const importBoq = async (f) => {
    if (!f) return;
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
      const s = parseBoqRows(rows);
      setSecs(withIds(s));
      setMsg('تم استيراد ' + s.length + ' بنداً رئيسياً من الملف. راجعها ثم أصدر.');
    } catch (x) {
      setMsg(fail('تعذر الاستيراد: ' + errMsg(x)));
    }
  };

  const lockOnIssue = !!issued;

  return (
    <>
      <nav id="typeb">
        {[['invoice', 'فاتورة'], ['quote', 'عرض سعر'], ['boq', 'مقايسة']].map(([k, l]) => (
          <button key={k} type="button" className={type === k ? 'on' : ''} onClick={() => changeType(k)}>{l}</button>
        ))}
      </nav>
      {type !== 'invoice' && (
        <div className="note">{B ? 'المقايسة: تحمل اسم الشركة والعلامة المائية فقط، وتُصدَّر Excel وPDF مختوم. يمكنك إضافة أي بند أو تعديله قبل الإصدار.' : 'عرض السعر: حتى 30 سطراً، ويحمل اسم الشركة والعلامة المائية فقط، بدون السجل التجاري أو العنوان أو الباركودات.'}</div>
      )}

      <section>
        <details>
          <summary>بيانات الشركة (تُحفظ مرة واحدة لكل الشركة)</summary>
          <label htmlFor="c_addr">العنوان</label>
          <input type="text" id="c_addr" className="rtl" value={co.addr} onChange={(e) => setCo({ ...co, addr: e.target.value })} />
          <label htmlFor="c_phone">الهاتف</label>
          <input type="text" id="c_phone" className="ltr" value={co.phone} onChange={(e) => setCo({ ...co, phone: e.target.value })} />
          <label htmlFor="c_tax">الرقم الضريبي</label>
          <input type="text" id="c_tax" className="ltr" value={co.tax} onChange={(e) => setCo({ ...co, tax: e.target.value })} />
          <label htmlFor="c_cr">رقم السجل التجاري</label>
          <input type="text" id="c_cr" className="ltr" value={co.cr} onChange={(e) => setCo({ ...co, cr: e.target.value })} />
          {['wa', 'fb'].map((k) => (
            <div key={k}>
              <label htmlFor={'q_' + k}>{k === 'wa' ? 'باركود واتساب (صورة واضحة وكاملة)' : 'باركود فيسبوك (صورة)'}</label>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <QrThumb path={settings['qr_' + k + '_path']} fallback={QR_DEFAULT[k]} />
                <input type="file" id={'q_' + k} accept="image/*" onChange={(e) => { uploadQr(k, e.target.files[0]); e.target.value = ''; }} />
              </div>
              <Msg m={qrMsg[k] || (settings['qr_' + k + '_path'] ? 'تم رفع الباركود.' : 'يُستخدم الباركود الافتراضي.')} />
            </div>
          ))}
          <label htmlFor="c_cc">رمز الدولة لأرقام واتساب (مثال: 20 لمصر، 966 للسعودية)</label>
          <input type="text" id="c_cc" className="ltr" inputMode="numeric" value={co.cc} onChange={(e) => setCo({ ...co, cc: e.target.value })} />
          <label htmlFor="c_cur">العملة (تظهر بجانب المبالغ)</label>
          <input type="text" id="c_cur" className="rtl" placeholder="مثال: ر.س أو ج.م أو د.إ" value={co.cur} onChange={(e) => setCo({ ...co, cur: e.target.value })} />
          <button className="big" type="button" onClick={saveCo}>حفظ بيانات الشركة</button>
          <Msg m={coMsg} />
        </details>
      </section>

      <section>
        <h2>{Q ? 'بيانات عرض السعر' : B ? 'بيانات المقايسة' : 'بيانات الفاتورة'}</h2>
        <div className="g2">
          <div>
            <label htmlFor="i_no">{Q ? 'رقم العرض' : B ? 'رقم المقايسة' : 'رقم الفاتورة'}</label>
            <input type="text" id="i_no" readOnly value={issued ? issued.no : PENDING_NO} style={issued ? { direction: 'ltr', textAlign: 'left' } : { fontSize: 13 }} />
          </div>
          <div>
            <label htmlFor="i_date">التاريخ</label>
            <input type="date" id="i_date" value={date} disabled={lockOnIssue} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        <label htmlFor="i_client">{B ? 'الجهة / العميل' : 'اسم العميل'}</label>
        <input type="text" id="i_client" className="rtl" value={client} onChange={(e) => setClient(e.target.value)} />
        <label htmlFor="i_cphone">هاتف العميل</label>
        <input type="text" id="i_cphone" className="ltr" inputMode="tel" value={cphone} onChange={(e) => setCphone(e.target.value)} />
        <label htmlFor="i_proj">{B ? 'اسم المقايسة (المشروع / الفرع)' : 'المشروع'}</label>
        <input type="text" id="i_proj" className="rtl" value={proj} onChange={(e) => setProj(e.target.value)} />

        {!B && (
          <div>
            <h2 style={{ marginTop: 14 }}>البنود</h2>
            <div id="items">
              {items.map((it) => (
                <div className="it" key={it.id}>
                  <input className="d" type="text" placeholder="البيان (مثال: دهانات الواجهة)" aria-label="البيان" value={it.d} onChange={(e) => setItem(it.id, 'd', e.target.value)} />
                  <input type="number" inputMode="decimal" step="any" placeholder="الكمية" aria-label="الكمية" value={it.q} onChange={(e) => setItem(it.id, 'q', e.target.value)} />
                  <input type="number" inputMode="decimal" step="any" placeholder="السعر" aria-label="السعر" value={it.p} onChange={(e) => setItem(it.id, 'p', e.target.value)} />
                  <div className="lt">{fmt(nz(it.q) * nz(it.p))}</div>
                  <button className="rm" type="button" onClick={() => items.length > 1 && setItems((a) => a.filter((x) => x.id !== it.id))}>حذف البند</button>
                </div>
              ))}
            </div>
            <button className="alt" type="button" style={{ marginTop: 8 }} onClick={addItem}>+ إضافة بند</button>
            <div className="g2">
              <div><label htmlFor="i_disc">الخصم (مبلغ)</label><input type="number" id="i_disc" inputMode="decimal" step="any" value={disc} onChange={(e) => setDisc(e.target.value)} /></div>
              <div><label htmlFor="i_vat">الضريبة ٪</label><input type="number" id="i_vat" inputMode="decimal" step="any" value={vat} onChange={(e) => setVat(e.target.value)} /></div>
            </div>
            <div className="tot">
              <div><span>المجموع الفرعي</span><span>{fmt(t.sub)}</span></div>
              <div><span>الخصم</span><span>{fmt(disc)}</span></div>
              <div><span>الضريبة ({nz(vat)}٪)</span><span>{fmt(t.vat)}</span></div>
              <div className="g"><span>الإجمالي</span><span>{fmt(t.total)} {co.cur}</span></div>
            </div>
          </div>
        )}

        {B && (
          <div>
            <h2 style={{ marginTop: 14 }}>بنود المقايسة</h2>
            <div className="acts"><button className="alt" type="button" onClick={loadTpl}>تحميل نموذج مقايسة فرع المستقبل</button></div>
            <label htmlFor="b_imp">أو استيراد مقايسة من ملف Excel (بنفس ترتيب أعمدة نموذجك)</label>
            <input type="file" id="b_imp" accept=".xlsx,.xls" onChange={(e) => { importBoq(e.target.files[0]); e.target.value = ''; }} />
            <BoqEditor secs={secs} setSecs={setSecs} />
            <div id="b_tot">الإجمالي العام: {fmt(grand)} {co.cur}</div>
          </div>
        )}

        <label htmlFor="i_notes">ملاحظات / شروط الدفع</label>
        <input type="text" id="i_notes" className="rtl" value={notes} onChange={(e) => setNotes(e.target.value)} />

        {!B && (
          <>
            <label htmlFor="i_img">إرفاق صور (حتى 2، تظهر في صفحة مرفقات بملف PDF)</label>
            <input type="file" id="i_img" ref={attRef} accept="image/*" multiple onChange={(e) => { addAtt([...e.target.files]); e.target.value = ''; }} />
            <div className="thumbs">
              {att.map((a, i) => (
                <div className="thumb" key={a.url}>
                  <img src={a.url} alt="صورة مرفقة" />
                  <button type="button" aria-label="حذف الصورة" onClick={() => { URL.revokeObjectURL(a.url); setAtt(att.filter((_, k) => k !== i)); }}>×</button>
                </div>
              ))}
            </div>
          </>
        )}

        <Check checked={prefs.p} onChange={(v) => updPrefs('p', v)}>حفظ نسخة PDF في جهازي بعد الإصدار</Check>
        <Check checked={prefs.x} onChange={(v) => updPrefs('x', v)}>حفظ نسخة Excel في جهازي بعد الإصدار</Check>

        <button className="alt big" type="button" onClick={doPreview}>معاينة قبل الإصدار</button>
        <PagesView pages={preview} title="معاينة (لم تُصدر بعد)" onClose={() => setPreview(null)} closeLabel="إغلاق المعاينة" />
        <button className="big" type="button" disabled={working || !!issued} onClick={issue}>
          {working ? 'جارٍ الإصدار…' : failed ? 'إعادة المحاولة' : issued ? 'تم الإصدار ✓' : Q ? 'إصدار عرض السعر وحفظه' : B ? 'إصدار المقايسة وحفظها' : 'إصدار الفاتورة وحفظها'}
        </button>
        <Msg m={msg} />
        <Msg m={msg2} />
        {issued && (
          <div className="acts">
            <button type="button" onClick={async () => { setMsg2(busy('جارٍ التجهيز…')); setMsg2(await exportDoc(issued, 'xl')); }}>Excel</button>
            <button type="button" onClick={async () => { setMsg2(busy('جارٍ التجهيز…')); setMsg2(await exportDoc(issued, 'pdf')); }}>PDF مختوم</button>
            <button type="button" onClick={async () => { setMsg2(busy('جارٍ تجهيز الملف…')); setMsg2(await shareDoc(issued)); }}>مشاركة PDF</button>
            <button className="alt" type="button" onClick={() => setSend(sendOpts(issued))}>طرق أخرى للإرسال</button>
            <button className="alt" type="button" onClick={() => setMsg2(waDoc(issued, settings.cc))}>واتساب للعميل</button>
            <button className="alt" type="button" onClick={reset}>مستند جديد</button>
          </div>
        )}
      </section>
      <SendDialog opts={send} onClose={() => setSend(null)} />
    </>
  );
}

function QrThumb({ path, fallback }) {
  const [src, setSrc] = useState(fallback);
  useEffect(() => {
    let live = true;
    if (path) fileUrl(path).then((u) => live && setSrc(u)).catch(() => live && setSrc(fallback));
    else setSrc(fallback);
    return () => { live = false; };
  }, [path, fallback]);
  return <img src={src} alt="الباركود الحالي" style={{ width: 56, height: 56, objectFit: 'contain', border: '1px solid var(--line)', borderRadius: 6, background: '#fff' }} />;
}


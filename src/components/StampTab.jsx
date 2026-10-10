import { useEffect, useRef, useState } from 'react';
import { arErr } from '../lib/supabase';
import { addStamp, listStamps, allStamps } from '../lib/api';
import { stampImage, stampPdf, renderPdfFirstPage } from '../lib/stamp';
import { doSave, shareFile } from '../lib/files';
import { genSerial, today, typeName, errMsg } from '../lib/util';
import { useApp, Msg, busy, fail } from './common';

export default function StampTab({ active }) {
  const app = useApp();
  const [file, setFile] = useState(null);
  const [note, setNote] = useState('');
  const [serial, setSerial] = useState(genSerial);
  const [op, setOp] = useState(20);
  const [out, setOut] = useState(null);
  const [imgUrl, setImgUrl] = useState('');
  const [showPdf, setShowPdf] = useState(false);
  const [working, setWorking] = useState(false);
  const [msg, setMsg] = useState(null);
  const [reg, setReg] = useState(null);
  const [regErr, setRegErr] = useState('');
  const [csvMsg, setCsvMsg] = useState(null);
  const pc = useRef(null);

  const loadReg = async () => {
    setRegErr('');
    try { setReg(await listStamps(30)); } catch (e) { setRegErr(arErr(e)); }
  };
  useEffect(() => { if (active) loadReg(); }, [active, app.stampVer]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (f) => {
    setFile(f || null);
    setOut(null);
    if (imgUrl) URL.revokeObjectURL(imgUrl);
    setImgUrl('');
    setShowPdf(false);
    setMsg(null);
    setSerial(genSerial());
  };

  const go = async () => {
    if (!file || working) return;
    setWorking(true);
    setOut(null);
    setShowPdf(false);
    if (imgUrl) URL.revokeObjectURL(imgUrl);
    setImgUrl('');
    setMsg(busy('جارٍ التطبيق…'));
    try {
      const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
      const r = isPdf ? await stampPdf(file, op / 100, serial) : await stampImage(file, op / 100, serial);
      let text = isPdf ? 'تم ختم ' + r.pages + ' صفحة. الرقم: ' + serial : 'تم الختم. الرقم: ' + serial;
      if (isPdf) {
        setShowPdf(true);
        try { await new Promise((res) => setTimeout(res, 0)); await renderPdfFirstPage(r.blob, pc.current); } catch (e) { console.error(e); setShowPdf(false); text += ' (المعاينة غير متاحة، لكن الملف جاهز للحفظ)'; }
      } else setImgUrl(URL.createObjectURL(r.blob));
      setOut(r);
      try {
        await addStamp({ orgId: app.org.id, serial, file_name: file.name, note: note.trim() });
        app.stampsChanged();
      } catch (e) {
        text += ' — تنبيه: تعذر تسجيل الرقم في السجل السحابي (' + arErr(e) + ').';
      }
      setMsg(text);
    } catch (e) {
      console.error(e);
      setMsg(fail('تعذر ختم هذا الملف: ' + errMsg(e)));
    } finally {
      setWorking(false);
    }
  };

  const save = async () => {
    if (!out) return;
    setMsg(await doSave(out.name, out.blob));
  };

  const share = async () => {
    if (!out) return;
    setMsg(await shareFile(new File([out.blob], out.name, { type: out.blob.type || 'application/pdf' }), 'ملف مختوم من شركة بوينت أب.'));
  };

  const csv = async () => {
    setCsvMsg(busy('جارٍ التحميل…'));
    try {
      const rows = await allStamps();
      const q = (s) => '"' + String(s ?? '').replace(/"/g, '""') + '"';
      const t = '\uFEFFserial,date,kind,file,note\n' + rows.map((r) => [r.serial, r.stamped_on, r.kind, r.file_name, r.note].map(q).join(',')).join('\n');
      setCsvMsg(await doSave('pointup-register-' + today() + '.csv', new Blob([t], { type: 'text/csv;charset=utf-8' })));
    } catch (e) {
      setCsvMsg(fail('تعذر التصدير: ' + arErr(e)));
    }
  };

  return (
    <>
      <section>
        <h2>١. اختر الملف</h2>
        <input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" onChange={(e) => pick(e.target.files[0])} />
        <label htmlFor="note">ملاحظة للسجل (اسم العميل أو المشروع) — لا تظهر على الملف</label>
        <input type="text" id="note" className="rtl" placeholder="مثال: عرض سعر — مشروع الفيلا" value={note} onChange={(e) => setNote(e.target.value)} />
      </section>
      <section>
        <h2>٢. الرقم التسلسلي</h2>
        <div className="row">
          <input type="text" readOnly aria-label="الرقم التسلسلي" value={serial} />
          <button className="alt" type="button" onClick={() => { setSerial(genSerial()); setOut(null); }}>رقم جديد</button>
        </div>
        <label htmlFor="op">شفافية العلامة: {op}٪</label>
        <input type="range" id="op" min="8" max="45" value={op} onChange={(e) => setOp(Number(e.target.value))} />
        <button className="big" type="button" disabled={!file || working} onClick={go}>طبّق العلامة</button>
        <Msg m={msg} />
        {imgUrl && <img src={imgUrl} alt="معاينة الملف بعد الختم" style={{ maxWidth: '100%', borderRadius: 8, border: '1px solid var(--line)', marginTop: 10, display: 'block' }} />}
        <canvas ref={pc} style={{ display: showPdf ? 'block' : 'none', maxWidth: '100%', border: '1px solid var(--line)', borderRadius: 8, marginTop: 10 }} />
        {out && (
          <>
            <button className="big" type="button" onClick={save}>حفظ الملف المختوم</button>
            <button className="alt big" type="button" onClick={share}>مشاركة الملف المختوم (واتساب وغيره)</button>
          </>
        )}
      </section>
      <section>
        <h2>سجل الأرقام الصادرة</h2>
        {regErr && <div><Msg m={fail('تعذر تحميل السجل: ' + regErr)} /><button className="alt" type="button" onClick={loadReg}>إعادة المحاولة</button></div>}
        {!reg && !regErr && <div className="note"><span className="spin" />جارٍ التحميل…</div>}
        {reg && !reg.length && <p className="note">لا توجد أرقام صادرة بعد.</p>}
        {reg && reg.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead><tr><th>الرقم</th><th>التاريخ</th><th>الملف / ملاحظة</th></tr></thead>
              <tbody>
                {reg.map((r, i) => (
                  <tr key={r.serial + i}>
                    <td className="s">{r.serial}</td>
                    <td>{r.stamped_on}</td>
                    <td>{r.file_name}{r.kind && r.kind !== 'stamp' ? ' (' + typeName(r.kind) + ')' : ''}{r.note ? <><br /><small>{r.note}</small></> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <button className="alt" type="button" style={{ marginTop: 10 }} onClick={csv}>حفظ السجل (CSV)</button>
        <Msg m={csvMsg} />
        <p className="note">السجل محفوظ في السحابة ومشترك بين الشريكين، ويضم كل الفواتير والعروض والمقايسات والألبومات والملفات المختومة. عند الشك في مستند، تحقق من رقمه عبر رابط التحقق المطبوع أسفل كل صفحة.</p>
      </section>
    </>
  );
}

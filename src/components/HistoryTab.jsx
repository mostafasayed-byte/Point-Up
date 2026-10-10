import { useEffect, useRef, useState } from 'react';
import { arErr } from '../lib/supabase';
import { listDocuments, sumDocuments, deleteDocument, allDocuments, PAGE } from '../lib/api';
import { docCanvases, registerXlsx } from '../lib/docRender';
import { exportDoc, shareDoc, waDoc, sendOpts } from '../lib/docActions';
import { doSave } from '../lib/files';
import { toImgUrl } from '../lib/watermark';
import { fmt, today, typeName, errMsg } from '../lib/util';
import { useApp, Msg, PagesView, busy, fail } from './common';
import SendDialog from './SendDialog';

export default function HistoryTab({ active }) {
  const app = useApp();
  const [q, setQ] = useState('');
  const [dq, setDq] = useState('');
  const [type, setType] = useState('all');
  const [page, setPage] = useState(0);
  const [data, setData] = useState(null); // {rows,count}
  const [sum, setSum] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState(null);
  const [view, setView] = useState(null);
  const [send, setSend] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [xmsg, setXmsg] = useState(null);
  const reqId = useRef(0);

  useEffect(() => { const t = setTimeout(() => { setDq(q); setPage(0); }, 350); return () => clearTimeout(t); }, [q]);

  const load = async () => {
    const id = ++reqId.current;
    setLoading(true);
    setErr('');
    try {
      const [d, s] = await Promise.all([listDocuments({ page, q: dq, type }), sumDocuments({ q: dq, type })]);
      if (id !== reqId.current) return;
      setData(d);
      setSum(s);
    } catch (e) {
      if (id === reqId.current) setErr(arErr(e));
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  };

  useEffect(() => { if (active) load(); }, [active, page, dq, type, app.docsVer]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (k, row) => {
    if (k === 'xp') return setSend(sendOpts(row));
    if (k === 'clone') return app.cloneDoc(row);
    if (k === 'wa') return setMsg(waDoc(row, app.settings.cc));
    if (k === 'del') return setConfirmDel(row.id);
    setMsg(busy('جارٍ التجهيز…'));
    if (k === 'share') return setMsg(await shareDoc(row));
    if (k === 'view') {
      try {
        const cs = await docCanvases(row);
        setView({ title: row.no, pages: cs.map((c) => toImgUrl(c, 0.82)) });
        setMsg(null);
      } catch (e) {
        console.error(e);
        setMsg(fail('تعذر العرض: ' + errMsg(e)));
      }
      return;
    }
    setMsg(await exportDoc(row, k));
  };

  const doDelete = async (row) => {
    setConfirmDel(null);
    setMsg(busy('جارٍ الحذف…'));
    try {
      await deleteDocument(row);
      setMsg('تم حذف ' + row.no + '.');
      app.docsChanged();
    } catch (e) {
      setMsg(fail('تعذر الحذف: ' + arErr(e)));
    }
  };

  const exportAll = async (kind) => {
    setXmsg(busy('جارٍ التحميل…'));
    try {
      const rows = await allDocuments();
      if (!rows.length) return setXmsg('لا توجد مستندات لتصديرها.');
      if (kind === 'json') setXmsg(await doSave('pointup-documents-' + today() + '.json', new Blob([JSON.stringify(rows, null, 1)], { type: 'application/json' })));
      else setXmsg(await doSave('pointup-register-' + today() + '.xlsx', await registerXlsx(rows)));
    } catch (e) {
      setXmsg(fail('تعذر التصدير: ' + arErr(e)));
    }
  };

  const pages = data ? Math.max(1, Math.ceil(data.count / PAGE)) : 1;

  return (
    <section>
      <h2>كل المستندات الصادرة</h2>
      <input type="text" className="rtl" placeholder="ابحث باسم العميل أو رقم الفاتورة" aria-label="بحث" value={q} onChange={(e) => setQ(e.target.value)} />
      <select aria-label="تصفية" style={{ marginTop: 8, direction: 'rtl', textAlign: 'right' }} value={type} onChange={(e) => { setType(e.target.value); setPage(0); }}>
        <option value="all">الكل (فواتير وعروض أسعار ومقايسات)</option>
        <option value="invoice">الفواتير فقط</option>
        <option value="quote">عروض الأسعار فقط</option>
        <option value="boq">المقايسات فقط</option>
      </select>
      {view && <PagesView pages={view.pages} title={view.title} onClose={() => setView(null)} />}
      <div className="note">السجل الدائم للشركة: يراه الشريكان، ولا يمكن تعديل مستند بعد إصداره (استخدم "نسخة جديدة للتعديل").</div>
      {loading && <div className="note"><span className="spin" />جارٍ التحميل…</div>}
      {err && (
        <div>
          <Msg m={fail('تعذر تحميل السجل: ' + err)} />
          <button className="alt" type="button" onClick={load}>إعادة المحاولة</button>
        </div>
      )}
      {data && !err && <div className="note">{data.count ? 'عدد المستندات: ' + data.count + ' — إجمالي المبالغ: ' + fmt(sum) : dq || type !== 'all' ? 'لا توجد نتائج مطابقة.' : 'لا توجد مستندات بعد.'}</div>}
      <Msg m={msg} />
      <div>
        {data && data.rows.map((r) => (
          <div className="inv" key={r.id}>
            <b>{r.no}</b> — {typeName(r.type)} — {r.doc_date}
            <br />{r.client}{r.project ? ' · ' + r.project : ''}
            <br /><strong>{fmt(r.total)} {r.currency || ''}</strong>
            <span className="note" style={{ marginInlineStart: 8, direction: 'ltr', display: 'inline-block' }}>{r.serial}</span>
            <div className="acts">
              <button type="button" onClick={() => act('view', r)}>عرض ومراجعة</button>
              <button className="alt" type="button" onClick={() => act('xl', r)}>Excel</button>
              <button className="alt" type="button" onClick={() => act('pdf', r)}>PDF مختوم</button>
              <button className="alt" type="button" onClick={() => act('clone', r)}>نسخة جديدة للتعديل</button>
              <button type="button" onClick={() => act('share', r)}>مشاركة PDF</button>
              <button className="alt" type="button" onClick={() => act('wa', r)}>واتساب للعميل</button>
              <button className="alt" type="button" onClick={() => act('xp', r)}>طرق أخرى للإرسال</button>
              {confirmDel === r.id ? (
                <>
                  <button className="danger" type="button" onClick={() => doDelete(r)}>تأكيد حذف {r.no} نهائياً</button>
                  <button className="alt" type="button" onClick={() => setConfirmDel(null)}>إلغاء</button>
                </>
              ) : (
                <button className="danger" type="button" onClick={() => act('del', r)}>حذف</button>
              )}
            </div>
          </div>
        ))}
      </div>
      {data && data.count > PAGE && (
        <div className="pager">
          <button className="alt sm" type="button" disabled={page === 0 || loading} onClick={() => setPage(page - 1)}>السابق</button>
          <span>صفحة {page + 1} من {pages}</span>
          <button className="alt sm" type="button" disabled={page + 1 >= pages || loading} onClick={() => setPage(page + 1)}>التالي</button>
        </div>
      )}
      <div className="acts">
        <button className="alt" type="button" onClick={() => exportAll('json')}>تصدير كل الفواتير (JSON)</button>
        <button className="alt" type="button" onClick={() => exportAll('xl')}>تصدير Excel للسجل</button>
      </div>
      <Msg m={xmsg} />
      <SendDialog opts={send} onClose={() => setSend(null)} />
    </section>
  );
}

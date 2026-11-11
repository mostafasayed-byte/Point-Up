import { useEffect, useMemo, useState } from 'react';
import { arErr } from '../lib/supabase';
import { allDocuments, allReceipts } from '../lib/api';
import { doSave } from '../lib/files';
import { fmt, today } from '../lib/util';
import { useApp, Msg, busy, fail } from './common';

const inDate = (v, from, to) => (!from || v >= from) && (!to || v <= to);
const match = (r, client, project) => (!client || (r.client || '').trim().toLowerCase() === client.toLowerCase()) && (!project || (r.project || '').trim().toLowerCase() === project.toLowerCase());

export default function ReportsTab({ active }) {
  const [docs, setDocs] = useState(null), [receipts, setReceipts] = useState(null), [err, setErr] = useState('');
  const [from, setFrom] = useState(''), [to, setTo] = useState(''), [client, setClient] = useState(''), [project, setProject] = useState('');
  const [msg, setMsg] = useState(null);
  useEffect(() => { if (!active) return; Promise.all([allDocuments(), allReceipts({ status: 'all' })]).then(([d, r]) => { setDocs(d); setReceipts(r); setErr(''); }).catch((e) => setErr(arErr(e))); }, [active]);

  const data = useMemo(() => {
    const ds = (docs || []).filter((r) => inDate(r.doc_date || '', from, to) && match(r, client, project));
    const rs = (receipts || []).filter((r) => inDate(r.receipt_date || '', from, to) && match(r, client, project));
    const inv = ds.filter((r) => r.type === 'invoice'), quotes = ds.filter((r) => r.type === 'quote'), boq = ds.filter((r) => r.type === 'boq');
    const activeR = rs.filter((r) => r.status !== 'void'), voidR = rs.filter((r) => r.status === 'void');
    const total = (a, k) => a.reduce((s, r) => s + (Number(r[k]) || 0), 0);
    return { ds, rs, inv, quotes, boq, activeR, voidR, invoiceTotal: total(inv, 'total'), receiptTotal: total(activeR, 'amount'), voidTotal: total(voidR, 'amount'), outstanding: total(inv, 'total') - total(activeR, 'amount') };
  }, [docs, receipts, from, to, client, project]);
  const clients = useMemo(() => [...new Set([...(docs || []), ...(receipts || [])].map((r) => (r.client || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ar')), [docs, receipts]);
  const projects = useMemo(() => [...new Set([...(docs || []), ...(receipts || [])].map((r) => (r.project || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ar')), [docs, receipts]);
  const exportCsv = async () => {
    const lines = [['النوع', 'الرقم', 'التاريخ', 'العميل', 'المشروع', 'المبلغ', 'الحالة'], ...data.inv.map((r) => ['فاتورة', r.no, r.doc_date, r.client, r.project || '', r.total, 'صادرة']), ...data.activeR.map((r) => ['إيصال', r.no, r.receipt_date, r.client, r.project || '', r.amount, 'ساري']), ...data.voidR.map((r) => ['إيصال', r.no, r.receipt_date, r.client, r.project || '', r.amount, 'ملغي'])];
    const csv = '\ufeff' + lines.map((x) => x.map((v) => '"' + String(v ?? '').replaceAll('"', '""') + '"').join(',')).join('\n');
    setMsg(await doSave('pointup-report-' + today() + '.csv', new Blob([csv], { type: 'text/csv;charset=utf-8' })));
  };
  return <section>
    <h2>التقارير المالية</h2>
    <div className="g2"><div><label>من تاريخ</label><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div><div><label>إلى تاريخ</label><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div><div><label>العميل</label><select className="rtl-sel" value={client} onChange={(e) => setClient(e.target.value)}><option value="">كل العملاء</option>{clients.map((x) => <option key={x}>{x}</option>)}</select></div><div><label>المشروع</label><select className="rtl-sel" value={project} onChange={(e) => setProject(e.target.value)}><option value="">كل المشروعات</option>{projects.map((x) => <option key={x}>{x}</option>)}</select></div></div>
    {err && <><Msg m={fail('تعذر تحميل التقرير: ' + err)} /><button className="alt" type="button" onClick={() => window.location.reload()}>إعادة المحاولة</button></>}
    {!docs || !receipts ? <div className="note"><span className="spin" />جارٍ تجهيز التقرير…</div> : <>
      <div className="tot"><div><span>إجمالي الفواتير</span><b>{fmt(data.invoiceTotal)}</b></div><div><span>إجمالي الإيصالات السارية</span><b>{fmt(data.receiptTotal)}</b></div><div><span>الإيصالات الملغاة</span><b>{fmt(data.voidTotal)}</b></div><div className="g"><span>المتبقي التقريبي</span><b>{fmt(data.outstanding)}</b></div></div>
      <div className="g2"><div className="bsec"><b>الفواتير</b><br />{data.inv.length} مستند</div><div className="bsec"><b>الإيصالات</b><br />{data.activeR.length} ساري / {data.voidR.length} ملغي</div><div className="bsec"><b>عروض الأسعار</b><br />{data.quotes.length} عرض</div><div className="bsec"><b>المقايسات</b><br />{data.boq.length} مقايسة</div></div>
      <button className="alt big" type="button" onClick={exportCsv}>تصدير التقرير CSV</button><Msg m={msg} />
      <p className="note">المتبقي التقريبي = إجمالي الفواتير − الإيصالات السارية ضمن الفلاتر. الإيصالات غير المرتبطة بفاتورة قد تؤثر على الرقم.</p>
    </>}
  </section>;
}

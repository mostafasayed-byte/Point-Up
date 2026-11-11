import { useEffect, useMemo, useState } from 'react';
import { arErr } from '../lib/supabase';
import { deleteCustomer, listCustomers, saveCustomer } from '../lib/api';
import { useApp, Msg, busy, fail } from './common';

const blank = { name: '', phone: '', address: '', notes: '', projects: '' };

export default function CustomersTab({ active }) {
  const app = useApp();
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState('');
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState(null);
  const [msg, setMsg] = useState(null);
  const [working, setWorking] = useState(false);

  const load = async () => {
    try { setRows(await listCustomers()); } catch (e) { setMsg(fail('تعذر تحميل العملاء: ' + arErr(e))); }
  };
  useEffect(() => { if (active) load(); }, [active]);

  const visible = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!rows || !s) return rows || [];
    return rows.filter((r) => [r.name, r.phone, r.address, r.projects?.join(' ')].join(' ').toLowerCase().includes(s));
  }, [rows, q]);

  const set = (k, v) => setForm((x) => ({ ...x, [k]: v }));
  const edit = (r) => { setEditing(r.id); setForm({ name: r.name || '', phone: r.phone || '', address: r.address || '', notes: r.notes || '', projects: (r.projects || []).join('، ') }); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const reset = () => { setEditing(null); setForm(blank); };
  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return setMsg(fail('اكتب اسم العميل.'));
    setWorking(true); setMsg(busy('جارٍ حفظ بيانات العميل…'));
    try {
      await saveCustomer({ id: editing || undefined, name: form.name.trim(), phone: form.phone.trim(), address: form.address.trim(), notes: form.notes.trim(), projects: form.projects.split(/[،,\n]/).map((x) => x.trim()).filter(Boolean) }, app.org.id);
      await load(); reset(); setMsg('تم حفظ بيانات العميل.');
    } catch (e) { setMsg(fail('تعذر الحفظ: ' + arErr(e))); } finally { setWorking(false); }
  };
  const remove = async (r) => {
    if (!window.confirm('حذف العميل «' + r.name + '» من دليل العملاء؟ لن يتم حذف فواتيره أو إيصالاته.')) return;
    try { await deleteCustomer(r.id); await load(); setMsg('تم حذف العميل من الدليل.'); } catch (e) { setMsg(fail('تعذر الحذف: ' + arErr(e))); }
  };

  return <>
    <section>
      <h2>{editing ? 'تعديل بيانات العميل' : 'إضافة عميل'}</h2>
      <form onSubmit={submit}>
        <label htmlFor="cu_name">اسم العميل *</label><input id="cu_name" className="rtl" value={form.name} onChange={(e) => set('name', e.target.value)} />
        <div className="g2"><div><label htmlFor="cu_phone">الهاتف</label><input id="cu_phone" className="ltr" value={form.phone} onChange={(e) => set('phone', e.target.value)} /></div><div><label htmlFor="cu_addr">العنوان</label><input id="cu_addr" className="rtl" value={form.address} onChange={(e) => set('address', e.target.value)} /></div></div>
        <label htmlFor="cu_projects">المشروعات (افصل بينها بفاصلة)</label><input id="cu_projects" className="rtl" value={form.projects} onChange={(e) => set('projects', e.target.value)} />
        <label htmlFor="cu_notes">ملاحظات</label><textarea id="cu_notes" className="cx-ta" rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
        <div className="acts"><button type="submit" disabled={working}>{editing ? 'حفظ التعديلات' : 'إضافة العميل'}</button>{editing && <button className="alt" type="button" onClick={reset}>إلغاء</button>}</div>
      </form><Msg m={msg} />
    </section>
    <section>
      <h2>دليل العملاء {rows ? '(' + rows.length + ')' : ''}</h2>
      <input className="rtl" placeholder="بحث بالاسم أو الهاتف أو المشروع" value={q} onChange={(e) => setQ(e.target.value)} />
      {!rows && <div className="note"><span className="spin" />جارٍ التحميل…</div>}
      {rows && !visible.length && <p className="note">لا يوجد عملاء مطابقون. يمكنك إضافة أول عميل من النموذج أعلاه.</p>}
      {visible.map((r) => <div className="inv" key={r.id}>
        <div className="bf" style={{ marginTop: 0 }}><b>{r.name}</b><span className="note" style={{ margin: 0 }}>{r.phone || 'بدون هاتف'}</span></div>
        {r.address && <div>{r.address}</div>}
        {r.projects?.length ? <div className="note">المشروعات: {r.projects.join(' — ')}</div> : null}
        {r.notes && <div className="note">{r.notes}</div>}
        <div className="acts"><button className="alt sm" type="button" onClick={() => edit(r)}>تعديل</button><button className="danger sm" type="button" onClick={() => remove(r)}>حذف من الدليل</button></div>
      </div>)}
    </section>
  </>;
}

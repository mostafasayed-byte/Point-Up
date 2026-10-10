import { useEffect, useRef, useState } from 'react';
import { arErr } from '../lib/supabase';
import { issueAlbum, listAlbums, albumPhotos, deleteAlbum, fileUrl, PAGE } from '../lib/api';
import { albumCanvases, albumPdf, albumText } from '../lib/albumRender';
import { doSave, cachedFile, shareFile, openWa } from '../lib/files';
import { toImgUrl } from '../lib/watermark';
import { today, shrinkToBlob, uuid, msgText, getPref, setPref, errMsg } from '../lib/util';
import { useApp, Msg, PagesView, Check, busy, fail } from './common';
import SendDialog from './SendDialog';

const MAX = 60;
const PENDING_NO = 'سيُحدَّد عند الإصدار';

/* صور ألبوم صادر من التخزين */
async function photosOf(album) {
  const ps = await albumPhotos(album.id);
  const out = [];
  for (const p of ps) out.push({ src: await fileUrl(p.storage_path), cap: p.caption || '' });
  return out;
}

const albFile = (album, getPhotos) => cachedFile('alb:' + album.id, async () => albumPdf(album, await getPhotos()), album.no + '_' + album.serial + '.pdf');

export default function AlbumsTab({ active }) {
  const app = useApp();
  const [title, setTitle] = useState('ألبوم أعمال');
  const [proj, setProj] = useState('');
  const [client, setClient] = useState('');
  const [cphone, setCphone] = useState('');
  const [date, setDate] = useState(today());
  const [per, setPer] = useState('4');
  const [photos, setPhotos] = useState([]); // [{id, blob, url, cap}]
  const [dpdf, setDpdf] = useState(() => getPref('apdf', false));
  const [preview, setPreview] = useState(null);
  const [issued, setIssued] = useState(null); // {album, photos:[{src,cap}]}
  const [working, setWorking] = useState(false);
  const [failed, setFailed] = useState(false);
  const [msg, setMsg] = useState(null);
  const [msg2, setMsg2] = useState(null);
  const [send, setSend] = useState(null);
  const gal = useRef(null), cam = useRef(null);

  const meta = () => ({ title: title.trim() || 'ألبوم صور', project: proj.trim(), client: client.trim(), client_phone: cphone.trim(), album_date: date || today(), per_page: parseInt(per, 10) || 4 });

  const addPhotos = async (files) => {
    if (issued) return setMsg(fail('اضغط "ألبوم جديد" أولاً.'));
    const add = [];
    for (const f of files) {
      if (photos.length + add.length >= MAX) { setMsg(fail('الحد الأقصى 60 صورة للألبوم.')); break; }
      try {
        const blob = await shrinkToBlob(f, 1400, 0.82);
        add.push({ id: uuid(), blob, url: URL.createObjectURL(blob), cap: '' });
      } catch (e) { setMsg(fail('تعذر قراءة إحدى الصور.')); }
    }
    setPhotos((p) => [...p, ...add]);
  };

  const move = (i, d) => setPhotos((a) => {
    const j = i + d;
    if (j < 0 || j >= a.length) return a;
    const b = a.slice();
    [b[i], b[j]] = [b[j], b[i]];
    return b;
  });
  const remove = (i) => setPhotos((a) => { URL.revokeObjectURL(a[i].url); return a.filter((_, k) => k !== i); });

  const doPreview = async () => {
    if (!photos.length) return setMsg(fail('أضف صورة واحدة على الأقل لتظهر المعاينة.'));
    setMsg(busy('جارٍ تجهيز المعاينة…'));
    try {
      const cs = await albumCanvases({ ...meta(), no: PENDING_NO, serial: 'DRAFT' }, photos.map((p) => ({ src: p.url, cap: p.cap })));
      setPreview(cs.map((c) => toImgUrl(c, 0.8)));
      setMsg(null);
    } catch (e) {
      console.error(e);
      setMsg(fail('تعذر تجهيز المعاينة: ' + errMsg(e)));
    }
  };

  const exportPdf = async (album, getPhotos) => {
    try { return { text: await doSave(album.no + '_' + album.serial + '.pdf', await albFile(album, getPhotos)) }; } catch (e) { console.error(e); return fail('تعذر التصدير: ' + errMsg(e)); }
  };

  const issue = async () => {
    if (issued || working) return;
    if (!photos.length) return setMsg(fail('أضف صورة واحدة على الأقل.'));
    setWorking(true);
    setMsg2(null);
    try {
      setMsg(busy('جارٍ إنشاء الألبوم…'));
      const res = await issueAlbum(meta(), photos.map((p) => ({ blob: p.blob, cap: p.cap })), app.org.id, (i, n) => setMsg(busy('جارٍ رفع الصور (' + i + ' من ' + n + ')…')));
      const rec = { album: res.album, photos: photos.map((p) => ({ src: p.url, cap: p.cap })) };
      setIssued(rec);
      setFailed(false);
      setPreview(null);
      albFile(rec.album, async () => rec.photos).catch(() => {});
      app.docsChanged();
      setMsg('تم إصدار الألبوم ' + res.album.no + ' — حُفظ مع صوره في السجل الدائم للشركة. الرقم التسلسلي: ' + res.album.serial);
      if (dpdf) setMsg2(await exportPdf(rec.album, async () => rec.photos));
    } catch (e) {
      console.error(e);
      setFailed(true);
      setMsg(fail('لم يتم الإصدار: ' + arErr(e) + ' — الصور ما زالت على الشاشة، اضغط "إعادة المحاولة".'));
    } finally {
      setWorking(false);
    }
  };

  const reset = () => {
    photos.forEach((p) => URL.revokeObjectURL(p.url));
    setPhotos([]); setIssued(null); setFailed(false); setProj(''); setClient(''); setCphone(''); setTitle('ألبوم أعمال'); setDate(today()); setMsg(null); setMsg2(null); setPreview(null);
  };

  const cloneAlbum = async (album) => {
    setMsg(busy('جارٍ نسخ الصور…'));
    try {
      const ps = await photosOf(album);
      const copy = [];
      for (const p of ps) { const blob = await (await fetch(p.src)).blob(); copy.push({ id: uuid(), blob, url: URL.createObjectURL(blob), cap: p.cap }); }
      reset();
      setPhotos(copy);
      setTitle(album.title || ''); setProj(album.project || ''); setClient(album.client || ''); setCphone(album.client_phone || ''); setPer(String(album.per_page || 4));
      setMsg('تم نسخ ' + album.no + ' كمسودة جديدة. عدّل ثم عاين وأصدر.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setMsg(fail('تعذر النسخ: ' + arErr(e)));
    }
  };

  const sendFor = (album, getPhotos, count) => ({ title: 'الألبوم ' + album.no, text: albumText(album, count), phone: album.client_phone, pages: async () => albumCanvases(album, await getPhotos()) });

  return (
    <>
      <section>
        <h2>ألبوم صور جديد</h2>
        <label htmlFor="a_title">عنوان الألبوم</label>
        <input type="text" id="a_title" className="rtl" value={title} onChange={(e) => setTitle(e.target.value)} />
        <label htmlFor="a_proj">اسم المشروع</label>
        <input type="text" id="a_proj" className="rtl" value={proj} onChange={(e) => setProj(e.target.value)} />
        <label htmlFor="a_client">اسم العميل</label>
        <input type="text" id="a_client" className="rtl" value={client} onChange={(e) => setClient(e.target.value)} />
        <label htmlFor="a_cphone">هاتف العميل (لإرسال الألبوم عبر واتساب)</label>
        <input type="text" id="a_cphone" className="ltr" inputMode="tel" value={cphone} onChange={(e) => setCphone(e.target.value)} />
        <div className="g2">
          <div><label htmlFor="a_date">التاريخ</label><input type="date" id="a_date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div>
            <label htmlFor="a_per">عدد الصور في الصفحة</label>
            <select id="a_per" value={per} onChange={(e) => setPer(e.target.value)}>{['1', '2', '4', '6'].map((n) => <option key={n} value={n}>{n}</option>)}</select>
          </div>
        </div>
        <div className="acts" style={{ marginTop: 12 }}>
          <button type="button" onClick={() => gal.current.click()}>+ إضافة من المعرض</button>
          <button className="alt" type="button" onClick={() => cam.current.click()}>📷 التقاط بالكاميرا</button>
        </div>
        <input type="file" ref={gal} accept="image/*" multiple hidden onChange={(e) => { const f = [...e.target.files]; e.target.value = ''; addPhotos(f); }} />
        <input type="file" ref={cam} accept="image/*" capture="environment" hidden onChange={(e) => { const f = [...e.target.files]; e.target.value = ''; addPhotos(f); }} />
        <div className="note">{photos.length ? 'عدد الصور: ' + photos.length + ' من ' + MAX : 'لم تُضف صور بعد.'}</div>
        <div>
          {photos.map((p, i) => (
            <div className="ath" key={p.id}>
              <img src={p.url} alt={'صورة ' + (i + 1)} />
              <div>
                <input type="text" className="rtl" placeholder="تعليق على الصورة (اختياري)" aria-label={'تعليق الصورة ' + (i + 1)} value={p.cap} disabled={!!issued} onChange={(e) => { const v = e.target.value; setPhotos((a) => a.map((x) => (x.id === p.id ? { ...x, cap: v } : x))); }} />
                <div className="acts">
                  <button type="button" className="alt sm" aria-label="تحريك لأعلى" disabled={!!issued} onClick={() => move(i, -1)}>▲</button>
                  <button type="button" className="alt sm" aria-label="تحريك لأسفل" disabled={!!issued} onClick={() => move(i, 1)}>▼</button>
                  <button type="button" className="alt sm" aria-label="حذف الصورة" disabled={!!issued} onClick={() => remove(i)}>حذف</button>
                </div>
              </div>
            </div>
          ))}
        </div>
        <Check checked={dpdf} onChange={(v) => { setDpdf(v); setPref('apdf', v); }}>حفظ نسخة PDF في جهازي بعد الإصدار</Check>
        <button className="alt big" type="button" onClick={doPreview}>معاينة قبل الإصدار</button>
        <PagesView pages={preview} title="معاينة (لم تُصدر بعد)" onClose={() => setPreview(null)} closeLabel="إغلاق المعاينة" />
        <button className="big" type="button" disabled={working || !!issued} onClick={issue}>
          {working ? 'جارٍ الإصدار…' : failed ? 'إعادة المحاولة' : issued ? 'تم الإصدار ✓' : 'إصدار الألبوم وحفظه'}
        </button>
        <Msg m={msg} />
        <Msg m={msg2} />
        {issued && (
          <div className="acts">
            <button type="button" onClick={async () => { setMsg2(busy('جارٍ تجهيز ملف PDF…')); setMsg2(await exportPdf(issued.album, async () => issued.photos)); }}>PDF مختوم</button>
            <button type="button" onClick={async () => { setMsg2(busy('جارٍ تجهيز الملف…')); try { setMsg2(await shareFile(await albFile(issued.album, async () => issued.photos), msgText('ألبوم الصور', issued.album.no))); } catch (e) { setMsg2(fail('تعذرت المشاركة: ' + errMsg(e))); } }}>مشاركة PDF</button>
            <button className="alt" type="button" onClick={() => setSend(sendFor(issued.album, async () => issued.photos, issued.photos.length))}>طرق أخرى للإرسال</button>
            <button className="alt" type="button" onClick={() => setMsg2(openWa(issued.album.client_phone, msgText('ألبوم الصور', issued.album.no), app.settings.cc))}>واتساب للعميل</button>
            <button className="alt" type="button" onClick={reset}>ألبوم جديد</button>
          </div>
        )}
      </section>
      <AlbumList active={active} onClone={cloneAlbum} exportPdf={exportPdf} sendFor={sendFor} setSend={setSend} />
      <SendDialog opts={send} onClose={() => setSend(null)} />
    </>
  );
}

function AlbumList({ active, onClone, exportPdf, sendFor, setSend }) {
  const app = useApp();
  const [q, setQ] = useState('');
  const [dq, setDq] = useState('');
  const [page, setPage] = useState(0);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState(null);
  const [view, setView] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const reqId = useRef(0);

  useEffect(() => { const t = setTimeout(() => { setDq(q); setPage(0); }, 350); return () => clearTimeout(t); }, [q]);

  const load = async () => {
    const id = ++reqId.current;
    setLoading(true);
    setErr('');
    try {
      const d = await listAlbums({ page, q: dq });
      if (id === reqId.current) setData(d);
    } catch (e) {
      if (id === reqId.current) setErr(arErr(e));
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  };
  useEffect(() => { if (active) load(); }, [active, page, dq, app.docsVer]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (k, a) => {
    const get = () => photosOf(a);
    try {
      if (k === 'clone') return onClone(a);
      if (k === 'xp') return setSend(sendFor(a, get, a.photo_count));
      if (k === 'wa') return setMsg(openWa(a.client_phone, msgText('ألبوم الصور', a.no), app.settings.cc));
      if (k === 'del') return setConfirmDel(a.id);
      setMsg(busy('جارٍ التجهيز…'));
      if (k === 'pdf') return setMsg(await exportPdf(a, get));
      if (k === 'share') return setMsg(await shareFile(await albFile(a, get), msgText('ألبوم الصور', a.no)));
      if (k === 'view') {
        const cs = await albumCanvases(a, await get());
        setView({ title: a.no, pages: cs.map((c) => toImgUrl(c, 0.8)) });
        setMsg(null);
      }
    } catch (e) {
      console.error(e);
      setMsg(fail('تعذر التنفيذ: ' + arErr(e)));
    }
  };

  const doDelete = async (a) => {
    setConfirmDel(null);
    setMsg(busy('جارٍ الحذف…'));
    try {
      await deleteAlbum(a);
      setMsg('تم حذف الألبوم ' + a.no + '.');
      app.docsChanged();
    } catch (e) {
      setMsg(fail('تعذر الحذف: ' + arErr(e)));
    }
  };

  const pages = data ? Math.max(1, Math.ceil(data.count / PAGE)) : 1;

  return (
    <section>
      <h2>الألبومات الصادرة</h2>
      <input type="text" className="rtl" placeholder="ابحث باسم العميل أو المشروع أو الرقم" aria-label="بحث" value={q} onChange={(e) => setQ(e.target.value)} />
      {view && <PagesView pages={view.pages} title={view.title} onClose={() => setView(null)} />}
      {loading && <div className="note"><span className="spin" />جارٍ التحميل…</div>}
      {err && <div><Msg m={fail('تعذر تحميل الألبومات: ' + err)} /><button className="alt" type="button" onClick={load}>إعادة المحاولة</button></div>}
      <Msg m={msg} />
      {data && !err && !data.rows.length && <p className="note">{dq ? 'لا توجد نتائج مطابقة.' : 'لا توجد ألبومات صادرة بعد.'}</p>}
      {data && data.rows.map((a) => (
        <div className="inv" key={a.id}>
          <b>{a.no}</b> — {a.album_date}
          <br />{a.title || ''}{a.project ? ' · ' + a.project : ''}{a.client ? ' · ' + a.client : ''}
          <br /><span className="note">عدد الصور: {a.photo_count}</span>
          <div className="acts">
            <button type="button" onClick={() => act('view', a)}>عرض ومراجعة</button>
            <button className="alt" type="button" onClick={() => act('pdf', a)}>PDF مختوم</button>
            <button className="alt" type="button" onClick={() => act('clone', a)}>نسخة جديدة للتعديل</button>
            <button type="button" onClick={() => act('share', a)}>مشاركة PDF</button>
            <button className="alt" type="button" onClick={() => act('wa', a)}>واتساب للعميل</button>
            <button className="alt" type="button" onClick={() => act('xp', a)}>طرق أخرى للإرسال</button>
            {confirmDel === a.id ? (
              <>
                <button className="danger" type="button" onClick={() => doDelete(a)}>تأكيد حذف {a.no} نهائياً</button>
                <button className="alt" type="button" onClick={() => setConfirmDel(null)}>إلغاء</button>
              </>
            ) : <button className="danger" type="button" onClick={() => act('del', a)}>حذف</button>}
          </div>
        </div>
      ))}
      {data && data.count > PAGE && (
        <div className="pager">
          <button className="alt sm" type="button" disabled={page === 0 || loading} onClick={() => setPage(page - 1)}>السابق</button>
          <span>صفحة {page + 1} من {pages}</span>
          <button className="alt sm" type="button" disabled={page + 1 >= pages || loading} onClick={() => setPage(page + 1)}>التالي</button>
        </div>
      )}
    </section>
  );
}

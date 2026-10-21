import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ready, LOGO_URL } from '../lib/watermark';
import { PRINT_CSS, pageCss, wmTile, logoData, estimatePages, fullHtml } from '../lib/printDoc';
import { doSave, waLink } from '../lib/files';
import { copyText, errMsg } from '../lib/util';
import { useApp, Msg, fail } from './common';

const SIZES = [['A4', 'A4'], ['A5', 'A5'], ['Letter', 'Letter']];
const ORIENT = [['portrait', 'طولي'], ['landscape', 'عرضي']];
const MARGINS = [[8, 'ضيقة'], [15, 'عادية'], [25, 'واسعة']];
const FONTS = [[12, 'صغير'], [14, 'متوسط'], [16, 'كبير']];

/* معاينة ملء الشاشة + طباعة HTML (تُستخدم للعقود والإيصالات)
   build({po, logo, wm, tight}) يعيد HTML الورقة كاملة من paperHtml */
export default function PrintPreview({ fileName, serial, defaults, build, text, phone, onClose, fitOne }) {
  const { settings } = useApp();
  const [po, setPo] = useState(() => ({ sz: 'A4', or: 'portrait', mg: 15, fs: 14, wm: true, ...defaults }));
  const [assets, setAssets] = useState(null);
  const [panel, setPanel] = useState('');
  const [pages, setPages] = useState(0);
  const [tight, setTight] = useState(false);
  const [msg, setMsg] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    let off = false;
    ready()
      .then((im) => { if (!off) setAssets({ logo: logoData(im), wm: wmTile(im, serial, po) }); })
      .catch((e) => { console.error(e); if (!off) setAssets({ logo: LOGO_URL, wm: '' }); });
    return () => { off = true; };
  }, [serial, po.sz, po.or, po.mg]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setTight(false); }, [po]);

  const html = assets ? build({ po, logo: assets.logo, wm: po.wm ? assets.wm : '', tight }) : '';

  useEffect(() => {
    const el = ref.current && ref.current.querySelector('.cx-pg');
    if (!el) return;
    const t = setTimeout(() => {
      const n = estimatePages(el, po);
      setPages(n);
      if (fitOne && n > 1 && !tight) setTight(true);
    }, 80);
    return () => clearTimeout(t);
  }, [html]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k, v) => setPo((p) => ({ ...p, [k]: v }));
  const tg = (k) => setPanel((p) => (p === k ? '' : k));
  const file = () => fullHtml(html, po, fileName);

  const print = () => {
    try { window.print(); } catch (e) { setMsg(fail('الطباعة المباشرة غير متاحة هنا. استخدم «حفظ على الجهاز» ثم افتح الملف واطبعه.')); }
  };

  const save = async () => {
    if (!html) return;
    try { setMsg(await doSave(fileName + '.html', new Blob([file()], { type: 'text/html;charset=utf-8' }))); } catch (e) { setMsg(fail('تعذر الحفظ: ' + errMsg(e))); }
  };

  const share = async (k) => {
    if (k === 'wa') {
      const w = window.open(waLink(phone, text, settings.cc), '_blank', 'noopener');
      return setMsg(w ? 'تم فتح واتساب.' : { text: 'اضغط للفتح:', link: { url: waLink(phone, text, settings.cc), name: 'فتح واتساب', external: true } });
    }
    if (k === 'mail') { window.location.href = 'mailto:?subject=' + encodeURIComponent(fileName) + '&body=' + encodeURIComponent(text); return; }
    if (k === 'copy') return setMsg((await copyText(text)) ? 'تم نسخ النص.' : fail('تعذر النسخ التلقائي.'));
    try {
      const f = new File([file()], fileName + '.html', { type: 'text/html' });
      if (navigator.canShare && navigator.canShare({ files: [f] })) await navigator.share({ files: [f], title: fileName, text });
      else if (navigator.share) await navigator.share({ title: fileName, text });
      else return setMsg(fail('المشاركة عبر الجهاز غير متاحة هنا. جرّب واتساب أو «حفظ على الجهاز».'));
      setMsg('تمت المشاركة.');
    } catch (e) {
      setMsg(e && e.name === 'AbortError' ? 'أُلغيت المشاركة.' : fail('المشاركة عبر الجهاز غير متاحة هنا. جرّب واتساب أو «حفظ على الجهاز».'));
    }
  };

  const sel = (k, opts, num) => (
    <select value={String(po[k])} onChange={(e) => set(k, num ? Number(e.target.value) : e.target.value)}>
      {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );

  return createPortal(
    <div className="cx-print cx-ov" role="dialog" aria-label="معاينة الطباعة">
      <style>{PRINT_CSS + pageCss(po)}</style>
      <div className="noprint cx-bar">
        <button className="alt sm" type="button" onClick={onClose}>إغلاق ✕</button>
        <button className="sm" type="button" disabled={!html} onClick={print}>طباعة / PDF</button>
        <button className="alt sm" type="button" onClick={() => tg('opts')}>خيارات الطباعة</button>
        <button className="alt sm" type="button" onClick={() => tg('shr')}>مشاركة</button>
        <button className="alt sm" type="button" disabled={!html} onClick={save}>حفظ على الجهاز</button>
        {pages > 0 && <span className="cx-pgs">≈ {pages} ورقة</span>}
      </div>
      {fitOne && pages > 1 && <div className="noprint cx-warn">المحتوى أطول من صفحة واحدة بهذا المقاس. صغّر الخط أو الهوامش أو اختر ورقًا أكبر.</div>}
      {panel === 'opts' && (
        <section className="noprint cx-opts">
          <div><label>حجم الورق</label>{sel('sz', SIZES)}</div>
          <div><label>الاتجاه</label>{sel('or', ORIENT)}</div>
          <div><label>الهوامش</label>{sel('mg', MARGINS, true)}</div>
          <div><label>حجم الخط</label>{sel('fs', FONTS, true)}</div>
          <div><label>العلامة المائية</label>
            <select value={po.wm ? '1' : '0'} onChange={(e) => set('wm', e.target.value === '1')}><option value="1">تظهر</option><option value="0">مخفية</option></select>
          </div>
        </section>
      )}
      {panel === 'shr' && (
        <section className="noprint acts">
          <button className="alt sm" type="button" onClick={() => share('wa')}>واتساب</button>
          <button className="alt sm" type="button" onClick={() => share('mail')}>بريد إلكتروني</button>
          <button className="alt sm" type="button" disabled={!html} onClick={() => share('sys')}>مشاركة عبر الجهاز (ملف)</button>
          <button className="alt sm" type="button" onClick={() => share('copy')}>نسخ النص</button>
        </section>
      )}
      <div className="noprint"><Msg m={msg} /></div>
      {html ? <div ref={ref} className="cx-pp" dangerouslySetInnerHTML={{ __html: html }} /> : <div className="loading noprint"><span className="spin" />جارٍ التجهيز…</div>}
    </div>,
    document.body
  );
}

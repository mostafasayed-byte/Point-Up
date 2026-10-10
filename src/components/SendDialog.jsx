import { useState } from 'react';
import { copyText, errMsg } from '../lib/util';
import { waLink } from '../lib/files';
import { toImgUrl } from '../lib/watermark';
import { useApp } from './common';

/* "طرق أخرى للإرسال": نص منسّق + صفحات كصور + بيانات JSON */
export default function SendDialog({ opts, onClose }) {
  const { settings } = useApp();
  const [cm, setCm] = useState('');
  const [jm, setJm] = useState('');
  const [imgs, setImgs] = useState(null);
  const [pbtn, setPbtn] = useState('عرض الصفحات');
  const [working, setWorking] = useState(false);
  if (!opts) return null;
  const wl = waLink(opts.phone, opts.text, settings.cc);

  const showPages = async () => {
    setWorking(true);
    setPbtn('جارٍ التجهيز…');
    try {
      const cs = await opts.pages();
      setImgs(cs.map((c) => toImgUrl(c, 0.9)));
      setPbtn('تم عرض ' + cs.length + ' صفحة — اضغط مطولاً على أي صورة');
    } catch (e) {
      console.error(e);
      setPbtn('تعذر العرض: ' + errMsg(e));
    }
    setWorking(false);
  };

  const ta = { width: '100%', font: 'inherit', padding: 10, border: '1px solid var(--line)', borderRadius: 8, background: 'var(--bg)', color: 'var(--ink)' };

  return (
    <div className="overlay" role="dialog" aria-label="طرق الإرسال">
      <div className="wide">
        <h2>طرق إرسال {opts.title}</h2>
        <section>
          <h2>١. إرسال كنص (الأسهل)</h2>
          <textarea readOnly rows={9} value={opts.text} style={{ ...ta, direction: 'rtl' }} />
          <div className="acts">
            <button type="button" onClick={async () => setCm((await copyText(opts.text)) ? 'تم نسخ النص. الصقه الآن في واتساب.' : 'تعذر النسخ التلقائي: اضغط مطولاً داخل المربع ثم اختر تحديد الكل ونسخ.')}>نسخ النص</button>
            <a href={wl} target="_blank" rel="noopener noreferrer" style={{ flex: 1, textAlign: 'center', padding: '11px 14px', borderRadius: 8, background: 'var(--gold)', color: 'var(--on)', fontWeight: 700, textDecoration: 'none' }}>فتح واتساب بالنص</a>
          </div>
          <div className="note" role="status">{cm}</div>
          <p className="note">إن لم يفتح واتساب: انسخ النص ثم الصقه في أي محادثة.</p>
        </section>
        <section>
          <h2>٢. صفحات المستند كصور</h2>
          <button className="alt big" type="button" disabled={working} onClick={showPages}>{pbtn}</button>
          <div className="pages">{imgs && imgs.map((u, i) => <img key={i} src={u} alt={'صفحة ' + (i + 1)} />)}</div>
          <p className="note">اضغط مطولاً على الصورة ثم اختر حفظ أو مشاركة، فتُرسَل كصور في واتساب.</p>
        </section>
        {opts.json && (
          <section>
            <h2>٣. بيانات المستند (JSON)</h2>
            <p className="note">انسخ بيانات المستند لإرسالها أو أرشفتها، أو الصقها في محادثة Claude لإنتاج ملف PDF.</p>
            <button className="alt big" type="button" onClick={async () => setJm((await copyText(opts.json)) ? 'تم النسخ.' : 'تعذر النسخ التلقائي: اضغط مطولاً داخل المربع ثم تحديد الكل ونسخ.')}>نسخ بيانات المستند</button>
            <div className="note" role="status">{jm}</div>
            <textarea readOnly rows={4} value={opts.json} style={{ ...ta, direction: 'ltr' }} />
          </section>
        )}
        <button className="big" type="button" onClick={onClose}>إغلاق</button>
      </div>
    </div>
  );
}

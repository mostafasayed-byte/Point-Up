import { useEffect, useState } from 'react';
import { supabase, arErr } from '../lib/supabase';
import { createOrganization, joinOrganization, verifySerial } from '../lib/api';
import { normPhone, typeName } from '../lib/util';
import { LOGO_URL } from '../lib/watermark';
import { Msg, busy, fail } from './common';

/* شاشة الدخول / إنشاء حساب (Supabase Auth بإيميل مشتق من الهاتف) */
export function AuthScreen({ overlay, onDone, notice }) {
  const [mode, setMode] = useState('login');
  const [phone, setPhone] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [name, setName] = useState('');
  const [msg, setMsg] = useState(notice ? { text: notice } : null);
  const [working, setWorking] = useState(false);
  const L = mode === 'login';

  const submit = async (e) => {
    e.preventDefault();
    const ph = normPhone(phone);
    if (ph.length < 8 || ph.length > 15) return setMsg(fail('اكتب رقم هاتف صحيحاً من 8 إلى 15 رقماً.'));
    if (pw.length < 8) return setMsg(fail('كلمة المرور يجب أن تكون 8 أحرف على الأقل.'));
    if (!L && pw !== pw2) return setMsg(fail('كلمتا المرور غير متطابقتين.'));
    if (!L && !name.trim()) return setMsg(fail('اكتب اسمك.'));
    setWorking(true);
    setMsg(busy(L ? 'جارٍ الدخول…' : 'جارٍ إنشاء الحساب…'));
    try {
      const email = ph + '@pointup.app';
      const r = L
        ? await supabase.auth.signInWithPassword({ email, password: pw })
        : await supabase.auth.signUp({ email, password: pw, options: { data: { phone: ph, display_name: name.trim() } } });
      if (r.error) throw r.error;
      if (!r.data.session) throw new Error('تم إنشاء الحساب لكن الجلسة غير مفعّلة. عطّل تأكيد البريد في إعدادات Supabase Auth.');
      setMsg(null);
      onDone && onDone(r.data.session);
    } catch (x) {
      setMsg(fail((L ? 'تعذر تسجيل الدخول: ' : 'تعذر إنشاء الحساب: ') + arErr(x)));
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="overlay" role="dialog" aria-label="تسجيل الدخول" style={overlay ? { zIndex: 200 } : undefined}>
      <form className="box" onSubmit={submit}>
        <div className="center"><img src={LOGO_URL} alt="Point Up بوينت أب" style={{ width: 200, maxWidth: '60%' }} /></div>
        <nav style={{ margin: '10px 0' }}>
          <button type="button" className={L ? 'on' : ''} onClick={() => { setMode('login'); setMsg(null); }}>تسجيل الدخول</button>
          <button type="button" className={!L ? 'on' : ''} onClick={() => { setMode('signup'); setMsg(null); }}>إنشاء حساب</button>
        </nav>
        <h1 className="center" style={{ fontSize: 20, margin: '8px 0' }}>{L ? 'تسجيل الدخول' : 'إنشاء حساب'}</h1>
        {!L && (
          <>
            <label htmlFor="g_name">الاسم</label>
            <input type="text" id="g_name" className="rtl" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </>
        )}
        <label htmlFor="g_ph">رقم الهاتف (8–15 رقماً)</label>
        <input type="tel" id="g_ph" inputMode="tel" autoComplete="username" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <label htmlFor="g_pw">كلمة المرور</label>
        <input type="password" id="g_pw" autoComplete={L ? 'current-password' : 'new-password'} value={pw} onChange={(e) => setPw(e.target.value)} />
        {!L && (
          <>
            <label htmlFor="g_pw2">تأكيد كلمة المرور</label>
            <input type="password" id="g_pw2" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
          </>
        )}
        <button className="big" type="submit" disabled={working}>{L ? 'دخول' : 'إنشاء الحساب'}</button>
        <Msg m={msg} />
        <p className="note">تُحفظ البيانات في السحابة وتُشارك بين شريكي الشركة. رقم الهاتف يُستخدم كمعرّف دخول، وكلمة المرور 8 أحرف على الأقل.</p>
      </form>
    </div>
  );
}

/* أول دخول: إنشاء شركة أو الانضمام بكود دعوة */
export function OrgWizard({ onDone, onLogout, defaultName }) {
  const [display, setDisplay] = useState(defaultName || '');
  const [orgName, setOrgName] = useState('');
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState(null);
  const [working, setWorking] = useState(false);

  const run = async (join) => {
    if (!display.trim()) return setMsg(fail('اكتب اسمك.'));
    if (join && !code.trim()) return setMsg(fail('اكتب كود الدعوة.'));
    if (!join && !orgName.trim()) return setMsg(fail('اكتب اسم الشركة.'));
    setWorking(true);
    setMsg(busy(join ? 'جارٍ الانضمام…' : 'جارٍ إنشاء الشركة…'));
    try {
      if (join) await joinOrganization(code.trim(), display.trim());
      else await createOrganization(orgName.trim(), display.trim());
      await onDone();
    } catch (e) {
      setMsg(fail('تعذر الإعداد: ' + arErr(e)));
      setWorking(false);
    }
  };

  return (
    <div className="overlay" role="dialog" aria-label="إعداد الشركة">
      <div className="box">
        <div className="center"><img src={LOGO_URL} alt="Point Up" style={{ width: 180, maxWidth: '60%' }} /></div>
        <h1 className="center">إعداد الشركة</h1>
        <p className="note">أنشئ شركة جديدة، أو انضم إلى شركة شريكك بكود الدعوة (حد أقصى شريكان).</p>
        <label htmlFor="w_disp">اسمك</label>
        <input type="text" id="w_disp" className="rtl" value={display} onChange={(e) => setDisplay(e.target.value)} />
        <section>
          <h2>إنشاء شركة جديدة</h2>
          <label htmlFor="w_org">اسم الشركة</label>
          <input type="text" id="w_org" className="rtl" value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="بوينت أب" />
          <button className="big" type="button" disabled={working} onClick={() => run(false)}>إنشاء شركة جديدة</button>
        </section>
        <section>
          <h2>الانضمام لشركة بكود الدعوة</h2>
          <label htmlFor="w_code">كود الدعوة</label>
          <input type="text" id="w_code" className="ltr" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" />
          <button className="alt big" type="button" disabled={working} onClick={() => run(true)}>الانضمام بكود الدعوة</button>
        </section>
        <Msg m={msg} />
        <button className="alt big" type="button" onClick={onLogout}>تسجيل الخروج</button>
      </div>
    </div>
  );
}

/* صفحة التحقق العامة من الرقم التسلسلي */
export function VerifyPage({ initial }) {
  const [serial, setSerial] = useState(initial || '');
  const [res, setRes] = useState(null);
  const [working, setWorking] = useState(false);

  const check = async (s) => {
    s = String(s || '').trim().toUpperCase();
    if (!s) return setRes(fail('اكتب الرقم التسلسلي.'));
    setWorking(true);
    setRes(busy('جارٍ التحقق…'));
    try {
      const r = await verifySerial(s);
      if (!r || r.exists === false || r.valid === false || r.found === false) setRes(fail('❌ لا يوجد مستند بهذا الرقم التسلسلي'));
      else {
        const kind = r.type || r.kind;
        setRes({ text: '✅ مستند أصلي صادر من ' + (r.issuer || r.org_name || r.organization_name || 'بوينت أب') + ' — النوع: ' + (kind ? typeName(kind) : 'مستند') + '، الرقم: ' + (r.doc_no || r.no || r.document_no || r.file_name || s) + '، بتاريخ: ' + (r.doc_date || r.issued_on || r.stamped_on || r.date || 'غير متاح'), ok: true });
      }
    } catch (e) {
      setRes(fail('تعذر التحقق حالياً: ' + arErr(e)));
    } finally {
      setWorking(false);
    }
  };

  useEffect(() => { if (initial) check(initial); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <main>
      <form className="center" onSubmit={(e) => { e.preventDefault(); check(serial); }}>
        <img src={LOGO_URL} alt="Point Up" style={{ width: 190, maxWidth: '60%' }} />
        <h1>التحقق من المستند</h1>
        <p className="sub">تحقق من صحة الرقم التسلسلي المطبوع على المستند.</p>
        <section style={{ textAlign: 'right' }}>
          <label htmlFor="vserial">الرقم التسلسلي</label>
          <input type="text" id="vserial" className="ltr" value={serial} onChange={(e) => setSerial(e.target.value)} autoComplete="off" placeholder="PP-YYMMDD-XXXXXX" />
          <button className="big" type="submit" disabled={working}>تحقق</button>
          {res && <div className={'vres' + (res.error ? ' err' : res.ok ? ' ok' : '')} role="status">{res.busy && <span className="spin" />}{res.text}</div>}
        </section>
        <p className="note"><a href="/">الدخول إلى البرنامج</a></p>
      </form>
    </main>
  );
}

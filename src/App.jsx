import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase, arErr } from './lib/supabase';
import { getMembership, listMembers } from './lib/api';
import { copyText, getPref, setPref } from './lib/util';
import { hasPicker } from './lib/files';
import { LOGO_URL } from './lib/watermark';
import { AppCtx, Msg, fail } from './components/common';
import { AuthScreen, OrgWizard, VerifyPage } from './components/Auth';
import InvoiceTab from './components/InvoiceTab';
import HistoryTab from './components/HistoryTab';
import AlbumsTab from './components/AlbumsTab';
import StampTab from './components/StampTab';
import ContractTab from './components/ContractTab';
import ReceiptTab from './components/ReceiptTab';

function verifyParam() {
  const q = new URLSearchParams(location.search).get('verify');
  if (q != null) return q;
  const h = location.hash || '';
  if (h.startsWith('#/verify')) return decodeURIComponent(h.slice(9));
  return null;
}

export default function App() {
  const v = verifyParam();
  if (v != null) return <VerifyPage initial={v} />;
  return <Shell />;
}

/* فرق ساعة الجهاز عن ساعة الخادم (بالثواني) من حقل iat في توكن الدخول */
function clockSkew(session) {
  try {
    const b = session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const iat = JSON.parse(atob(b)).iat;
    return Math.round(Date.now() / 1000 - iat);
  } catch (e) { return 0; }
}

function ClockWarning() {
  return (
    <div role="alert" style={{ position: 'sticky', top: 'env(safe-area-inset-top, 0px)', zIndex: 300, background: '#b3261e', color: '#fff', padding: '10px 16px', textAlign: 'center', fontSize: 14 }}>
      ساعة جهازك غير مضبوطة، لذلك ستنتهي الجلسة باستمرار. اضبط التاريخ والوقت والمنطقة الزمنية على "تلقائي" في إعدادات الجهاز ثم أعد تحميل الصفحة.
    </div>
  );
}

function Shell() {
  const [session, setSession] = useState(undefined); // undefined = جارٍ التحميل
  const [ms, setMs] = useState(undefined); // {member, org} | null | undefined
  const [loadErr, setLoadErr] = useState('');
  const [skewed, setSkewed] = useState(false);
  const userRef = useRef(null);
  const leaving = useRef(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session || null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      // تبديل المستخدم: أعد تحميل الصفحة حتى لا تختلط البيانات
      if (s && userRef.current && s.user.id !== userRef.current) { location.reload(); return; }
      if (s && Math.abs(clockSkew(s)) > 300 && _e === 'SIGNED_IN') setSkewed(true);
      setSession(s || null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const loadMembership = useCallback(async (uid) => {
    setLoadErr('');
    try {
      setMs(await getMembership(uid));
    } catch (e) {
      setLoadErr(arErr(e));
    }
  }, []);

  useEffect(() => {
    if (session && !userRef.current) {
      userRef.current = session.user.id;
      loadMembership(session.user.id);
    }
  }, [session, loadMembership]);

  const logout = async () => {
    leaving.current = true;
    try { await supabase.auth.signOut(); } finally { location.reload(); }
  };

  const shell = renderShell();
  return <>{skewed && <ClockWarning />}{shell}</>;

  function renderShell() {
  if (session === undefined) return <div className="loading"><span className="spin" />جارٍ التحميل…</div>;
  if (!userRef.current && !session) return <AuthScreen />;
  if (loadErr) {
    return (
      <main><section>
        <Msg m={fail('تعذر تحميل بيانات الشركة: ' + loadErr)} />
        <button className="big" type="button" onClick={() => loadMembership(userRef.current)}>إعادة المحاولة</button>
        <button className="alt big" type="button" onClick={logout}>تسجيل الخروج</button>
      </section></main>
    );
  }
  if (ms === undefined) return <div className="loading"><span className="spin" />جارٍ تحميل بيانات الشركة…</div>;
  if (ms === null) {
    return <OrgWizard onDone={() => loadMembership(userRef.current)} onLogout={logout} defaultName={session && session.user.user_metadata && session.user.user_metadata.display_name} />;
  }
  return (
    <>
      <Main ms={ms} setMs={setMs} user={userRef.current} logout={logout} />
      {/* انتهت الجلسة: اطلب الدخول فوق التطبيق دون فقدان المسودة */}
      {!session && !leaving.current && <AuthScreen overlay notice="انتهت الجلسة. سجّل الدخول من جديد — مسودتك محفوظة على الشاشة." />}
    </>
  );
  }
}

const TABS = [['t1', 'فاتورة جديدة'], ['t2', 'سجل الفواتير'], ['t4', 'ألبومات'], ['t3', 'ختم ملف'], ['t5', 'عقود'], ['t6', 'إيصالات']];

function Main({ ms, setMs, user, logout }) {
  const [tab, setTab] = useState('t1');
  const [docsVer, setDocsVer] = useState(0);
  const [stampVer, setStampVer] = useState(0);
  const [cloneReq, setCloneReq] = useState(null);
  const [showPartners, setShowPartners] = useState(false);
  const [gpick, setGpick] = useState(() => hasPicker && getPref('gpick', false));

  const ctx = {
    user,
    org: ms.org,
    member: ms.member,
    settings: ms.org.settings || {},
    setSettings: (settings) => setMs((m) => ({ ...m, org: { ...m.org, settings } })),
    docsChanged: () => { setDocsVer((n) => n + 1); setStampVer((n) => n + 1); },
    stampsChanged: () => setStampVer((n) => n + 1),
    docsVer,
    stampVer,
    cloneDoc: (row) => { setCloneReq({ row, t: Date.now() }); setTab('t1'); window.scrollTo({ top: 0, behavior: 'smooth' }); },
  };

  return (
    <AppCtx.Provider value={ctx}>
      <main>
        <header>
          <img src={LOGO_URL} alt="Point Up بوينت أب" />
          <h1>بوينت أب — النسخة السحابية</h1>
          <p className="sub">إصدار الفواتير وحفظها + علامة مائية برقم فريد</p>
          <div style={{ marginTop: 6, fontSize: 14 }}>
            <span>{(ms.member.display_name || 'الحساب') + ' — ' + ms.org.name}</span>{' '}
            <button className="alt sm" type="button" onClick={logout}>تسجيل الخروج</button>{' '}
            <button className="alt sm" type="button" onClick={() => setShowPartners(true)}>إدارة الشريكين</button>
          </div>
          <details style={{ marginTop: 6, textAlign: 'right' }}>
            <summary>إعدادات الحفظ على الجهاز</summary>
            <label className="check">
              <input type="checkbox" checked={gpick} disabled={!hasPicker} onChange={(e) => { setGpick(e.target.checked); setPref('gpick', e.target.checked); }} /> أسأل عن مكان الحفظ عند كل تنزيل
            </label>
            <div className="note">{hasPicker ? 'متاح: يُطلب منك اختيار المجلد واسم الملف عند كل تنزيل.' : 'اختيار المجلد غير مدعوم في هذا المتصفح أو الهاتف، فيحفظ النظام الملف في مجلد التنزيلات. لتغيير ذلك: في Chrome للأندرويد: الإعدادات ← التنزيلات ← "اسأل أين تحفظ الملفات". وفي Safari للآيفون: الإعدادات ← Safari ← التنزيلات.'}</div>
          </details>
        </header>
        <nav id="tabs">
          {TABS.map(([id, label]) => (
            <button key={id} type="button" className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{label}</button>
          ))}
        </nav>
        {/* التبويبات تبقى محمّلة حتى لا تضيع المسودات عند التنقل */}
        <div className="tab" hidden={tab !== 't1'}><InvoiceTab cloneReq={cloneReq} /></div>
        <div className="tab" hidden={tab !== 't2'}><HistoryTab active={tab === 't2'} /></div>
        <div className="tab" hidden={tab !== 't4'}><AlbumsTab active={tab === 't4'} /></div>
        <div className="tab" hidden={tab !== 't3'}><StampTab active={tab === 't3'} /></div>
        <div className="tab" hidden={tab !== 't5'}><ContractTab /></div>
        <div className="tab" hidden={tab !== 't6'}><ReceiptTab active={tab === 't6'} /></div>
      </main>
      {showPartners && <Partners org={ms.org} onClose={() => setShowPartners(false)} />}
    </AppCtx.Provider>
  );
}

function Partners({ org, onClose }) {
  const [members, setMembers] = useState(null);
  const [msg, setMsg] = useState(null);
  useEffect(() => {
    listMembers(org.id).then(setMembers).catch((e) => setMsg(fail('تعذر تحميل الأعضاء: ' + arErr(e))));
  }, [org.id]);
  return (
    <div className="overlay" role="dialog" aria-label="إدارة الشريكين">
      <div className="wide">
        <h2>إدارة الشريكين — {org.name}</h2>
        <section>
          <h2>كود الدعوة</h2>
          <p className="note">أرسل هذا الكود لشريكك ليختار "الانضمام لشركة بكود الدعوة" بعد إنشاء حسابه. الحد الأقصى شريكان.</p>
          <div className="code">{org.invite_code || '—'}</div>
          <button className="big" type="button" onClick={async () => setMsg((await copyText(org.invite_code || '')) ? 'تم نسخ كود الدعوة.' : 'تعذر النسخ التلقائي: حدد الكود وانسخه يدوياً.')}>نسخ الكود</button>
        </section>
        <section>
          <h2>الأعضاء</h2>
          {members === null && !msg && <div className="note"><span className="spin" />جارٍ التحميل…</div>}
          {members && members.map((m) => (
            <div className="member" key={m.user_id}><span>{m.display_name || 'عضو'}</span><span className="note" style={{ margin: 0 }}>{m.role === 'owner' ? 'المالك' : m.role || 'عضو'}</span></div>
          ))}
          {members && <div className="note">{members.length} من 2</div>}
        </section>
        <Msg m={msg} />
        <button className="alt big" type="button" onClick={onClose}>إغلاق</button>
      </div>
    </div>
  );
}

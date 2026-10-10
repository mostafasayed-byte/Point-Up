import { createClient } from '@supabase/supabase-js';

/* مفاتيح عامة (publishable) فقط. ممنوع وضع service_role أو sb_secret في الواجهة. */
const env = import.meta.env || {};
const URL_ = env.VITE_SUPABASE_URL || 'https://uhprijlsutsrklgpvipu.supabase.co';
const KEY = env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_7uDL9l61w1KaWt1c2zgZ-w_xHsQfB9G';

export const supabase = createClient(URL_, KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

export const BUCKET = 'org-files';

/* ترجمة أخطاء Supabase إلى رسائل عربية واضحة */
export function arErr(e) {
  const m = String((e && (e.message || e.error_description || e.msg)) || '');
  const code = e && e.code;
  if (!m && !code) return 'خطأ غير معروف';
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'تعذر الاتصال بالخادم. تحقق من الإنترنت ثم أعد المحاولة.';
  if (/Invalid login credentials/i.test(m)) return 'رقم الهاتف أو كلمة المرور غير صحيحة.';
  if (/User already registered|already been registered/i.test(m)) return 'هذا الرقم مسجل بالفعل. اختر "تسجيل الدخول".';
  if (/Password should be/i.test(m)) return 'كلمة المرور ضعيفة. استخدم 8 أحرف على الأقل.';
  if (/rate limit|too many/i.test(m)) return 'محاولات كثيرة. انتظر قليلاً ثم أعد المحاولة.';
  if (/JWT|session|not authenticated|auth/i.test(m) && /expired|missing|invalid|not authenticated/i.test(m)) return 'انتهت الجلسة. سجّل الدخول من جديد.';
  if (code === '42501' || /row-level security|permission denied/i.test(m)) return 'ليس لديك صلاحية لهذه العملية.';
  if (code === '23505') return 'الرقم مكرر. أعد المحاولة.';
  if (/Bucket not found/i.test(m)) return 'مخزن الملفات org-files غير موجود في Supabase.';
  if (/invite/i.test(m) && /invalid|not found|wrong/i.test(m)) return 'كود الدعوة غير صحيح.';
  return m;
}

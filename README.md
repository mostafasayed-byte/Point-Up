# بوينت أب — النسخة السحابية (React + Supabase)

تطبيق ويب لشركة **بوينت أب | Point Up**: فواتير، عروض أسعار، مقايسات (BOQ)، ألبومات صور، وختم أي ملف PDF/صورة بعلامة مائية ورقم تسلسلي فريد يمكن التحقق منه علناً.
مبني بـ React + Vite، والبيانات كلها في Supabase (قاعدة البيانات + التخزين + تسجيل الدخول). نُقل من النسخة المرجعية "بوينت أب — نسخة الجهاز" بنفس الوظائف والتصميم.

## التشغيل محلياً
```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # بناء نسخة الإنتاج في dist/
```

## الإعداد
- مفاتيح Supabase العامة موجودة كقيم افتراضية في `src/lib/supabase.js`، ويمكن تغييرها بمتغيرات البيئة `VITE_SUPABASE_URL` و`VITE_SUPABASE_ANON_KEY` (انظر `.env.example`).
- **ممنوع** وضع مفتاح `service_role` أو `sb_secret` في الواجهة.
- قاعدة البيانات (الجداول، دوال RPC، سياسات RLS، bucket `org-files` الخاص) موجودة مسبقاً في مشروع Supabase.
- **ترحيلات مطلوبة** (Supabase ← SQL Editor ← New query ← Run، بالترتيب):
  1. `supabase/contracts_migration.sql` — تبويب «عقود»: رقم `CON-YYYY-0001` + تسجيل السيريال فقط (محتوى العقد لا يُحفظ).
  2. `supabase/receipts_migration.sql` — تبويب «إيصالات»: جدول `receipts` + `issue_receipt` / `void_receipt` + `verify_serial` يعرض حالة الإلغاء.

## النشر على Vercel
1. Import المستودع من GitHub في Vercel (يتعرّف تلقائياً على Vite؛ الإعدادات في `vercel.json`).
2. (اختياري) أضف `VITE_SUPABASE_URL` و`VITE_SUPABASE_ANON_KEY` في Environment Variables.
3. بعد النشر: في Supabase ← Authentication ← URL Configuration ضع رابط الموقع في **Site URL** و**Redirect URLs**.

## هيكل المشروع
| المسار | المحتوى |
|---|---|
| `src/App.jsx` | الجلسة، إعداد الشركة، الهيدر، التبويبات، إدارة الشريكين |
| `src/components/` | شاشات الدخول والتحقق، الفاتورة/العرض/المقايسة، السجل، الألبومات، ختم ملف، طرق الإرسال |
| `src/lib/api.js` | كل استدعاءات Supabase (إصدار ذرّي مع إعادة محاولة السيريال المكرر، ترقيم صفحات، تخزين) |
| `src/lib/docRender.js`, `albumRender.js` | رسم المستندات على Canvas ← PDF، وملفات Excel |
| `src/lib/stamp.js`, `watermark.js` | العلامة المائية وختم الملفات |
| `src/lib/printDoc.js`, `components/PrintPreview.jsx` | طباعة HTML مشتركة: علامة مائية + سيريال + شريط سفلي في كل صفحة، وخيارات الطباعة |
| `src/lib/contract.js`, `components/ContractTab.jsx` | العقود (إشراف / تشطيبات / توريدات) — مسودة على الجهاز فقط |
| `src/lib/receipt.js`, `tafqeet.js`, `components/ReceiptTab.jsx` | إيصالات استلام النقدية + التفقيط (اختبار: `node src/lib/tafqeet.test.js`) |
| `reference/` | النماذج المرجعية الأصلية للعقد والإيصال |

## ملاحظات
- التحقق العام من أي مستند: `https://<الموقع>/?verify=<السيريال>` (مطبوع أسفل كل صفحة).
- المستند الصادر لا يُعدَّل؛ "نسخة جديدة للتعديل" تصدر برقم جديد.
- لو ساعة الجهاز غير مضبوطة تنتهي الجلسة باستمرار، والتطبيق يعرض تنبيهاً بذلك.

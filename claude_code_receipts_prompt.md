# Task: add a "Cash Receipt" (إيصال استلام نقدية) module to the Point Up app

## Context
Point Up (بوينت أب) is an Arabic/RTL static single-page app (invoices, quotes, BOQ, albums, file stamping, and a Contracts tab) deployed on Vercel with Supabase. The client wants a **cash receipt** the company hands to a customer when it **receives cash from the customer for a project**, using the same logo, watermark and unique serial as every other document.

Before changing anything, explore the repo and reuse what exists: tab bar, design tokens (Tajawal, light/dark), Supabase client, escape helper, serial generator (`PP-YYMMDD-XXXXXX`), the watermark routine, the **print-preview overlay and print options built for the Contracts module** (paper size, orientation, margins, font size, watermark toggle, `@media print` fixed watermark + footer repeated on every page), company settings, and the doc-history list patterns. Do not duplicate logic. Keep it a static app. Follow existing code style.

## Decision (differs from Contracts)
Contracts are not stored. **Receipts ARE stored**: they are payment records, the client needs a history per customer and per project, and a receipt must never silently disappear. Therefore: receipts are immutable once issued, cannot be deleted, and can only be **voided** with a reason.

## Database
I will run `supabase_receipts_migration.sql` in the SQL editor (provided). It adds: table `receipts`, RPC `issue_receipt(p jsonb)` (returns the row), RPC `void_receipt(p_id uuid, p_reason text)`, numbering `RC-YYYY-0001` via `next_doc_no('receipt')`, kind `receipt` in `stamp_register`, and an updated `verify_serial` that also returns `status` (`active` / `void`). Do not redesign it. Direct insert/update/delete on `receipts` is blocked by RLS, so use the RPCs. `receipts` columns: `no, serial, receipt_date, client, client_phone, project, amount, amount_words, currency, purpose, notes, contract_total, received_by, company_snapshot, status, void_reason, voided_at, created_at`.

## Build this

### 1. New main tab "إيصالات"
Add it to the main tab bar. If the bar no longer fits on a phone, make it horizontally scrollable (keep the current tabs untouched). The tab has two parts: the form on top (collapsible after issuing) and the history list below.

**Form fields**
- Receipt number: read-only, shows "يُحدَّد عند الإصدار".
- Date (default today).
- Client name (required) with autocomplete (`<datalist>`) from distinct client names found in `documents`, `albums` and `receipts` (load up to 200, once, cache).
- Client phone.
- Project name, with autocomplete from previous projects of the same client when possible.
- Amount received (required, > 0, numeric keyboard, 2 decimals max). Currency comes from company settings.
- **Amount in words**, generated automatically in Arabic as the user types, shown in a read-only box (e.g. `فقط ثلاثة آلاف وخمسمائة جنيه مصري لا غير`), including قروش when there are decimals. See "Arabic amount in words" below.
- Payment purpose: select with `دفعة مقدمة`, `دفعة تحت الحساب`, `دفعة ختامية`, `ثمن توريدات`, `أتعاب إشراف`, `أخرى` (when "أخرى" is chosen show a free text field).
- Notes (optional).
- Contract total (optional). When filled, the receipt prints "إجمالي المسدد حتى تاريخه" and "المتبقي".
- Received by (employee name): default to the logged-in member's `display_name`, editable.
- Payment method is **cash only** (fixed text "نقدًا").

**Paid-to-date helper:** when client + project are filled, query `receipts` (status `active`, same client and project, case-insensitive exact match) and show "المسدد سابقًا: X" under the form. The printed receipt's "paid to date" = previous total + this amount, and "remaining" = contract total − paid to date (only printed when contract total is provided; clamp at 0).

### 2. Printed receipt (HTML print, same engine as Contracts)
Default paper **A5 landscape** (the user can switch to A4 etc. with the existing options). Layout, top to bottom:
- Header: logo + "بوينت أب — شركة مقاولات عامة وتوريدات" + company address / phone / commercial register / tax number from settings (only those that exist), gold divider, centered title **"إيصال استلام نقدية"**, receipt number, date.
- Body sentence (RTL): `استلمنا نحن شركة بوينت أب من السيد / {client} مبلغ وقدره {amount} {currency} ({amount in words}) نقدًا، وذلك {purpose}{ عن مشروع {project}}.`
- A small boxed table: client phone, project, amount, purpose, notes; and when contract total exists: إجمالي التعاقد / المسدد حتى تاريخه / المتبقي.
- A prominent amount box (large gold number + currency).
- Signature table with two equal boxes (`break-inside: avoid`): **المستلم (بوينت أب)** with received-by name, signature and stamp; **المُسلِّم (العميل)** with client name and signature.
- Footer: "بوينت أب · Point Up".
- **Watermark + serial + footer bar with the verify URL (`{location.origin}/?verify={SERIAL}`) exactly like the Contracts print layout** (fixed layers in `@media print`, color-adjust exact). The receipt must fit on one page at the default size; if not, shrink spacing, do not paginate.
- Voided receipts print a large diagonal red "ملغي" overlay and the void reason; never hide that.
- Reprints show a small "نسخة" mark only when the user ticks "طباعة كنسخة" (optional checkbox); the original has no mark.

### 3. Issuing flow
- **"معاينة"** shows the receipt with serial `DRAFT` and number "—" (never consumes a number).
- **"إصدار وطباعة"**: validate (client required, amount > 0), build `company_snapshot` from current settings, generate the serial, call `issue_receipt` with `{serial, receipt_date, client, client_phone, project, amount, amount_words, currency, purpose, notes, contract_total, received_by, company_snapshot}`, then open the print preview with the real number and serial. The printed receipt is rendered from the **stored row** (including `company_snapshot`), not from the current form, so reprints are identical.
- On `23505` regenerate the serial and retry up to 5 times. Disable the button while issuing (no double receipts). On failure show a clear Arabic message and keep the form data.
- After success the form resets to a new blank receipt (keep the client/project if the user ticks "إيصال آخر لنفس العميل").
- Receipts are never edited. To fix a mistake: void + issue a new one.

### 4. History (below the form, newest first)
- Search by client, project or number (`ilike`, `or`), filter: الكل / سارية / ملغية, optional date range, pagination of 30 with "تحميل المزيد".
- Summary line for the filtered **active** receipts: count and total amount. When a project filter/search matches a single client+project, also show the paid total for it.
- Each row: number, date, client, project, amount, purpose, status badge (voided rows struck through with the reason). Actions: **عرض / طباعة** (reprint from the stored row, same number and serial), **إلغاء** (asks for a mandatory reason, calls `void_receipt`, confirm dialog, refreshes), **واتساب للعميل** (wa.me link using the same phone-normalization and country code logic the app already uses, message: `السلام عليكم، مرفق إيصال استلام نقدية رقم {no} بمبلغ {amount} {currency} من شركة بوينت أب.`), **نسخ نص الإيصال**.
- Export button: "تصدير Excel" for the filtered receipts (SheetJS, RTL, columns: number, date, client, project, purpose, amount, status, serial, received by) with a SUM formula for active amounts.

### 5. Existing screens to update
- "ختم ملف" register list, CSV export and the public verify page: show kind `receipt` as "إيصال". The verify page must show a clear warning for `status = 'void'` ("⚠️ هذا الإيصال ملغي") and still never show names or amounts.

## Arabic amount in words (implement carefully, with tests)
Write a pure function `tafqeet(amount, {unit:'جنيه مصري', unitPlural, subunit:'قرش'})` for EGP: supports 0 to at least 999,999,999.99; correct gender/number rules for money (masculine units): 1 → "جنيه واحد", 2 → "جنيهان", 3–10 → "جنيهات", 11–99 → "جنيهًا", hundreds/thousands/millions with proper forms (ألف، ألفان، ثلاثة آلاف … عشرة آلاف، أحد عشر ألفًا؛ مليون، مليونان، ثلاثة ملايين …), the conjunction "و" in the right places, and the decimal part as قروش. Wrap as `فقط … لا غير`. Add a small test list in the repo (or console assertions) for at least these: 1, 2, 3, 10, 11, 21, 100, 101, 250, 1000, 2000, 3500, 10000, 15000, 100000, 1250000, 12.5, 0.75. Review the output manually for correctness before finishing.

## Non-goals
No editing of issued receipts, no deleting, no card/bank/cheque payment methods, no invoices linkage, no changes to invoices/quotes/BOQ/albums/contracts behavior. Do not add anything not listed.

## Quality bar
RTL correct on 380px and desktop, light and dark, escape all user text, loading and error states on every call, no secrets in code. Test: issue → reprint (same number/serial) → void (reason required) → verify page shows void; duplicate-serial retry; paid-to-date and remaining math; autocomplete; A5 landscape, A4 portrait and iOS Safari print preview with watermark + serial + footer. Finish with a short summary of changed files and the reminder to run `supabase_receipts_migration.sql`.

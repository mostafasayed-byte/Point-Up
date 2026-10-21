-- =====================================================================
-- Point Up | Cash receipts migration
-- Run AFTER supabase_schema.sql (and after supabase_contracts_migration.sql if you use it)
-- Supabase Dashboard -> SQL Editor -> New query -> Run
-- =====================================================================

-- 1) register kinds: add 'receipt' (keeps 'contract' too)
alter table public.stamp_register drop constraint if exists stamp_register_kind_check;
alter table public.stamp_register add constraint stamp_register_kind_check
  check (kind in ('stamp','invoice','quote','boq','album','contract','receipt'));

-- 2) numbering: RC-YYYY-0001 (re-declared with every prefix so it works with or without contracts)
create or replace function public.next_doc_no(p_kind text) returns text
language plpgsql security definer set search_path = public as $$
declare v_org uuid := public.current_org(); v_prefix text; v_yr int := extract(year from now())::int; v_n int;
begin
  if v_org is null then raise exception 'no_org'; end if;
  v_prefix := case p_kind when 'invoice' then 'INV-' when 'quote' then 'QT-' when 'boq' then 'BQ-'
                          when 'album' then 'AL-' when 'contract' then 'CON-' when 'receipt' then 'RC-' end;
  if v_prefix is null then raise exception 'bad_kind'; end if;
  insert into public.doc_counters(org_id,prefix,yr,seq) values (v_org,v_prefix,v_yr,1)
  on conflict (org_id,prefix,yr) do update set seq = public.doc_counters.seq + 1
  returning seq into v_n;
  return v_prefix || v_yr || '-' || lpad(v_n::text,4,'0');
end $$;

-- 3) receipts table (financial record: never edited, never deleted, only voided)
create table public.receipts (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  no            text not null,
  serial        text not null unique,
  receipt_date  date not null default current_date,
  client        text not null,
  client_phone  text,
  project       text,
  amount        numeric(14,2) not null check (amount > 0),
  amount_words  text,
  currency      text,
  purpose       text,                 -- e.g. دفعة مقدمة / دفعة تحت الحساب / ...
  notes         text,
  contract_total numeric(14,2),       -- optional: total agreed value, to print the remaining balance
  received_by   text,                 -- employee who received the cash
  company_snapshot jsonb not null default '{}'::jsonb,
  status        text not null default 'active' check (status in ('active','void')),
  void_reason   text,
  voided_at     timestamptz,
  created_by    uuid references auth.users(id) default auth.uid(),
  created_at    timestamptz not null default now(),
  unique (org_id, no)
);
create index on public.receipts (org_id, created_at desc);
create index on public.receipts (org_id, client);
create index on public.receipts (org_id, project);

alter table public.receipts enable row level security;
create policy rc_select on public.receipts for select to authenticated using (org_id = public.current_org());
-- no insert/update/delete policies: issuing and voiding go through the RPCs below

-- 4) issue a receipt atomically (number + row + serial in the register)
create or replace function public.issue_receipt(p jsonb) returns public.receipts
language plpgsql security definer set search_path = public as $$
declare v_org uuid := public.current_org(); r public.receipts; v_no text;
begin
  if v_org is null then raise exception 'no_org'; end if;
  if coalesce(trim(p->>'client'),'') = '' then raise exception 'client_required'; end if;
  if coalesce((p->>'amount')::numeric,0) <= 0 then raise exception 'amount_required'; end if;
  v_no := public.next_doc_no('receipt');
  insert into public.receipts(org_id,no,serial,receipt_date,client,client_phone,project,amount,amount_words,currency,
                              purpose,notes,contract_total,received_by,company_snapshot)
  values (v_org,v_no,p->>'serial',coalesce((p->>'receipt_date')::date,current_date),trim(p->>'client'),p->>'client_phone',p->>'project',
          (p->>'amount')::numeric,p->>'amount_words',p->>'currency',p->>'purpose',p->>'notes',
          nullif(p->>'contract_total','')::numeric,p->>'received_by',coalesce(p->'company_snapshot','{}'))
  returning * into r;
  insert into public.stamp_register(org_id,serial,kind,stamped_on,file_name,note)
  values (v_org,r.serial,'receipt',r.receipt_date,r.no,left(r.client,120));
  return r;
end $$;

-- 5) void a receipt (keeps the row, marks it void with a reason)
create or replace function public.void_receipt(p_id uuid, p_reason text) returns public.receipts
language plpgsql security definer set search_path = public as $$
declare r public.receipts;
begin
  if coalesce(trim(p_reason),'') = '' then raise exception 'reason_required'; end if;
  update public.receipts set status='void', void_reason=trim(p_reason), voided_at=now()
  where id = p_id and org_id = public.current_org() and status = 'active'
  returning * into r;
  if r.id is null then raise exception 'not_found_or_already_void'; end if;
  return r;
end $$;

revoke execute on function public.issue_receipt(jsonb), public.void_receipt(uuid,text) from public, anon;
grant  execute on function public.issue_receipt(jsonb), public.void_receipt(uuid,text) to authenticated;

-- 6) public verification now also reports a voided receipt (still no names or amounts)
drop function if exists public.verify_serial(text);
create function public.verify_serial(p_serial text)
returns table(kind text, doc_no text, issued_on date, issuer text, status text)
language sql stable security definer set search_path = public as $$
  select r.kind, r.file_name, r.stamped_on, o.name, coalesce(rc.status,'active')
  from public.stamp_register r
  join public.organizations o on o.id = r.org_id
  left join public.receipts rc on rc.serial = r.serial
  where r.serial = upper(trim(p_serial))
$$;
grant execute on function public.verify_serial(text) to anon, authenticated;

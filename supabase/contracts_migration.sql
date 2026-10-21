-- =====================================================================
-- Point Up | Contracts migration (run AFTER supabase_schema.sql)
-- Supabase Dashboard -> SQL Editor -> New query -> Run
-- Contracts are NOT stored (they are printed + signed on paper).
-- Only a number + unique serial are registered so the watermark serial
-- can be verified later through verify_serial().
-- =====================================================================

-- 1) allow the new kind in the register
alter table public.stamp_register drop constraint if exists stamp_register_kind_check;
alter table public.stamp_register add constraint stamp_register_kind_check
  check (kind in ('stamp','invoice','quote','boq','album','contract'));

-- 2) numbering: add CON-YYYY-0001
create or replace function public.next_doc_no(p_kind text) returns text
language plpgsql security definer set search_path = public as $$
declare v_org uuid := public.current_org(); v_prefix text; v_yr int := extract(year from now())::int; v_n int;
begin
  if v_org is null then raise exception 'no_org'; end if;
  v_prefix := case p_kind when 'invoice' then 'INV-' when 'quote' then 'QT-' when 'boq' then 'BQ-'
                          when 'album' then 'AL-' when 'contract' then 'CON-' end;
  if v_prefix is null then raise exception 'bad_kind'; end if;
  insert into public.doc_counters(org_id,prefix,yr,seq) values (v_org,v_prefix,v_yr,1)
  on conflict (org_id,prefix,yr) do update set seq = public.doc_counters.seq + 1
  returning seq into v_n;
  return v_prefix || v_yr || '-' || lpad(v_n::text,4,'0');
end $$;

-- 3) issue a contract number + register the serial (no contract content is saved)
-- unique_violation (23505) on the serial => the client generates a new serial and retries
create or replace function public.issue_contract(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_org uuid := public.current_org(); v_no text;
begin
  if v_org is null then raise exception 'no_org'; end if;
  if coalesce(p->>'serial','') = '' then raise exception 'serial_required'; end if;
  v_no := public.next_doc_no('contract');
  insert into public.stamp_register(org_id,serial,kind,stamped_on,file_name,note)
  values (v_org, p->>'serial', 'contract', current_date, v_no,
          left(trim(coalesce(p->>'ctype','') || ' - ' || coalesce(p->>'client','')), 120));
  return jsonb_build_object('no', v_no, 'serial', p->>'serial');
end $$;

revoke execute on function public.issue_contract(jsonb) from public, anon;
grant  execute on function public.issue_contract(jsonb) to authenticated;

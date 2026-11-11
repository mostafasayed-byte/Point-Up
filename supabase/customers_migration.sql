-- Point Up | Customers directory
-- Run once in Supabase SQL Editor after the base schema.

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  phone text,
  address text,
  notes text,
  projects text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, name)
);

create index if not exists customers_org_name_idx on public.customers (org_id, name);
alter table public.customers enable row level security;
drop policy if exists customers_select on public.customers;
drop policy if exists customers_insert on public.customers;
drop policy if exists customers_update on public.customers;
drop policy if exists customers_delete on public.customers;
create policy customers_select on public.customers for select to authenticated using (org_id = public.current_org());
create policy customers_insert on public.customers for insert to authenticated with check (org_id = public.current_org());
create policy customers_update on public.customers for update to authenticated using (org_id = public.current_org()) with check (org_id = public.current_org());
create policy customers_delete on public.customers for delete to authenticated using (org_id = public.current_org());

create or replace function public.touch_customers_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
drop trigger if exists customers_touch_updated_at on public.customers;
create trigger customers_touch_updated_at before update on public.customers
for each row execute function public.touch_customers_updated_at();

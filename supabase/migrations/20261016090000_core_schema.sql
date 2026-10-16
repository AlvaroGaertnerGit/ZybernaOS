-- =============================================================================
-- Zyberna Internal OS — esquema principal
-- Importes monetarios: bigint en céntimos. Nunca float.
-- Todas las tablas expuestas tienen RLS; acceso solo para miembros autorizados.
-- =============================================================================

create extension if not exists citext with schema extensions;

-- -----------------------------------------------------------------------------
-- Tipos
-- -----------------------------------------------------------------------------
create type public.app_role as enum ('admin', 'member');
create type public.client_status as enum ('lead', 'negotiation', 'active', 'paused', 'finished');
create type public.catalog_status as enum ('active', 'inactive');
create type public.billing_type as enum ('one_time', 'recurring');
create type public.periodicity as enum ('monthly', 'quarterly', 'semiannual', 'annual', 'custom');
create type public.interval_unit as enum ('day', 'week', 'month', 'year');
create type public.contract_status as enum ('draft', 'active', 'paused', 'finished', 'cancelled');
create type public.payment_status as enum ('pending', 'partial', 'paid', 'overdue', 'void');
create type public.transaction_kind as enum ('payment', 'adjustment');

-- -----------------------------------------------------------------------------
-- Utilidades
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Miembros autorizados y perfiles
-- La lista blanca solo es editable con privilegios de administración de la BD
-- (SQL editor / service role). Ningún cliente de la app puede leerla ni escribirla.
-- -----------------------------------------------------------------------------
create table public.authorized_emails (
  email extensions.citext primary key,
  role public.app_role not null default 'member',
  full_name text,
  created_at timestamptz not null default now()
);
alter table public.authorized_emails enable row level security;
revoke all on public.authorized_emails from anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email extensions.citext not null unique,
  full_name text not null default '',
  role public.app_role not null default 'member',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- ¿El usuario actual es un miembro activo de Zyberna?
create or replace function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_active
  );
$$;
revoke all on function public.is_member() from public, anon;
grant execute on function public.is_member() to authenticated;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_active and p.role = 'admin'
  );
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- Al crear un usuario en Auth, solo se crea perfil si su email está autorizado.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth public.authorized_emails%rowtype;
begin
  select * into v_auth from public.authorized_emails where email = new.email::extensions.citext;
  if found then
    insert into public.profiles (id, email, full_name, role)
    values (new.id, new.email, coalesce(v_auth.full_name, ''), v_auth.role)
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function public.handle_new_auth_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Si se autoriza un email de un usuario que ya existe en Auth, crear su perfil.
create or replace function public.handle_authorized_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  select u.id, u.email, coalesce(new.full_name, ''), new.role
  from auth.users u
  where u.email::extensions.citext = new.email
  on conflict (id) do update set role = excluded.role, is_active = true;
  return new;
end;
$$;
revoke all on function public.handle_authorized_email() from public, anon, authenticated;

create trigger on_authorized_email_added
  after insert on public.authorized_emails
  for each row execute function public.handle_authorized_email();

-- Los miembros no pueden cambiar su rol, email ni estado desde la app.
create or replace function public.protect_profile_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.role is distinct from old.role and not public.is_admin() then
      raise exception 'No autorizado para cambiar el rol';
    end if;
    if new.email is distinct from old.email or new.is_active is distinct from old.is_active or new.id is distinct from old.id then
      raise exception 'Campo protegido';
    end if;
  end if;
  return new;
end;
$$;
create trigger profiles_protect before update on public.profiles
  for each row execute function public.protect_profile_columns();

create policy "profiles: members read" on public.profiles
  for select to authenticated using (public.is_member());
create policy "profiles: update self" on public.profiles
  for update to authenticated
  using (id = auth.uid() and public.is_member())
  with check (id = auth.uid());

-- -----------------------------------------------------------------------------
-- Configuración de la agencia (fila única)
-- -----------------------------------------------------------------------------
create table public.agency_settings (
  id boolean primary key default true check (id),
  name text not null default 'Zyberna',
  legal_name text,
  tax_id text,
  email text,
  phone text,
  website text,
  address text,
  default_currency char(3) not null default 'EUR' check (default_currency ~ '^[A-Z]{3}$'),
  default_tax_rate numeric(5,2) check (default_tax_rate is null or (default_tax_rate >= 0 and default_tax_rate <= 100)),
  updated_at timestamptz not null default now()
);
alter table public.agency_settings enable row level security;
create trigger agency_settings_updated_at before update on public.agency_settings
  for each row execute function public.set_updated_at();
insert into public.agency_settings (id) values (true);

create policy "agency_settings: members read" on public.agency_settings
  for select to authenticated using (public.is_member());
create policy "agency_settings: members update" on public.agency_settings
  for update to authenticated using (public.is_member()) with check (public.is_member());

-- -----------------------------------------------------------------------------
-- Catálogo
-- -----------------------------------------------------------------------------
create table public.service_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9_]+$'),
  name text not null check (length(trim(name)) between 1 and 80),
  description text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.service_categories enable row level security;
create trigger service_categories_updated_at before update on public.service_categories
  for each row execute function public.set_updated_at();

create table public.service_catalog (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.service_categories (id) on delete restrict,
  name text not null check (length(trim(name)) between 1 and 120),
  description text,
  default_price_cents bigint check (default_price_cents is null or default_price_cents >= 0),
  currency char(3) not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  suggested_billing_type public.billing_type not null default 'recurring',
  suggested_periodicity public.periodicity,
  status public.catalog_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_catalog_periodicity_chk check (
    (suggested_billing_type = 'one_time' and suggested_periodicity is null)
    or (suggested_billing_type = 'recurring' and suggested_periodicity is not null and suggested_periodicity <> 'custom')
  )
);
create unique index service_catalog_name_uq on public.service_catalog (category_id, lower(name));
alter table public.service_catalog enable row level security;
create trigger service_catalog_updated_at before update on public.service_catalog
  for each row execute function public.set_updated_at();

create table public.service_catalog_deliverables (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.service_catalog (id) on delete cascade,
  position int not null default 0,
  title text not null check (length(trim(title)) between 1 and 200),
  description text,
  created_at timestamptz not null default now()
);
create index service_catalog_deliverables_service_idx on public.service_catalog_deliverables (service_id, position);
alter table public.service_catalog_deliverables enable row level security;

-- -----------------------------------------------------------------------------
-- Clientes
-- -----------------------------------------------------------------------------
create sequence public.client_code_seq;

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  file_name text,
  file_sha256 text,
  mode text not null check (mode in ('skip', 'update')),
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.import_batches enable row level security;

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  code text not null unique
    check (code ~ '^[A-Za-z0-9._-]{1,40}$'),
  trade_name text not null check (length(trim(trade_name)) between 1 and 160),
  legal_name text,
  tax_id text,
  contact_name text,
  email extensions.citext check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone text,
  website text,
  address text,
  sector text,
  status public.client_status not null default 'lead',
  owner_id uuid references public.profiles (id) on delete set null,
  joined_on date not null default current_date,
  notes text,
  archived_at timestamptz,
  import_batch_id uuid references public.import_batches (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  updated_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index clients_status_idx on public.clients (status) where archived_at is null;
create index clients_owner_idx on public.clients (owner_id);
create index clients_joined_idx on public.clients (joined_on desc);
create index clients_trade_name_idx on public.clients (lower(trade_name));
create index clients_email_idx on public.clients (email);
alter table public.clients enable row level security;
create trigger clients_updated_at before update on public.clients
  for each row execute function public.set_updated_at();

create table public.client_notes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  body text not null check (length(trim(body)) between 1 and 5000),
  author_id uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index client_notes_client_idx on public.client_notes (client_id, created_at desc);
alter table public.client_notes enable row level security;

-- -----------------------------------------------------------------------------
-- Contrataciones
-- -----------------------------------------------------------------------------

-- Normalización a MRR (céntimos, redondeo al céntimo más cercano).
-- Debe coincidir con src/lib/calculations/mrr.ts (probado en tests unitarios).
create or replace function public.mrr_cents(
  p_billing_type public.billing_type,
  p_periodicity public.periodicity,
  p_interval_count int,
  p_interval_unit public.interval_unit,
  p_amount_cents bigint
)
returns bigint
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when p_billing_type <> 'recurring' or p_amount_cents is null then 0::bigint
    when p_periodicity = 'monthly' then p_amount_cents
    when p_periodicity = 'quarterly' then round(p_amount_cents::numeric / 3)::bigint
    when p_periodicity = 'semiannual' then round(p_amount_cents::numeric / 6)::bigint
    when p_periodicity = 'annual' then round(p_amount_cents::numeric / 12)::bigint
    when p_periodicity = 'custom' and p_interval_count > 0 then
      case p_interval_unit
        when 'month' then round(p_amount_cents::numeric / p_interval_count)::bigint
        when 'year' then round(p_amount_cents::numeric / (12 * p_interval_count))::bigint
        when 'week' then round(p_amount_cents::numeric * 52 / (12 * p_interval_count))::bigint
        when 'day' then round(p_amount_cents::numeric * 365 / (12 * p_interval_count))::bigint
        else 0::bigint
      end
    else 0::bigint
  end;
$$;

create sequence public.contract_code_seq;

create table public.client_services (
  id uuid primary key default gen_random_uuid(),
  code text not null unique
    check (code ~ '^[A-Za-z0-9._-]{1,40}$'),
  client_id uuid not null references public.clients (id) on delete restrict,
  service_id uuid references public.service_catalog (id) on delete set null,
  category_id uuid not null references public.service_categories (id) on delete restrict,
  name text not null check (length(trim(name)) between 1 and 160),
  description text,
  amount_cents bigint not null check (amount_cents >= 0),
  tax_rate numeric(5,2) check (tax_rate is null or (tax_rate >= 0 and tax_rate <= 100)),
  currency char(3) not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  billing_type public.billing_type not null,
  periodicity public.periodicity,
  interval_count int check (interval_count is null or interval_count between 1 and 1000),
  interval_unit public.interval_unit,
  start_date date not null default current_date,
  end_date date,
  next_renewal_date date,
  status public.contract_status not null default 'active',
  owner_id uuid references public.profiles (id) on delete set null,
  notes text,
  mrr_cents bigint generated always as (
    public.mrr_cents(billing_type, periodicity, interval_count, interval_unit, amount_cents)
  ) stored,
  import_batch_id uuid references public.import_batches (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  updated_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_services_billing_chk check (
    (billing_type = 'one_time' and periodicity is null and interval_count is null and interval_unit is null)
    or (billing_type = 'recurring' and periodicity is not null and periodicity <> 'custom'
        and interval_count is null and interval_unit is null)
    or (billing_type = 'recurring' and periodicity = 'custom'
        and interval_count is not null and interval_unit is not null)
  ),
  constraint client_services_dates_chk check (end_date is null or end_date >= start_date)
);
create index client_services_client_idx on public.client_services (client_id);
create index client_services_status_idx on public.client_services (status);
create index client_services_category_idx on public.client_services (category_id);
create index client_services_renewal_idx on public.client_services (next_renewal_date) where status = 'active';
alter table public.client_services enable row level security;
create trigger client_services_updated_at before update on public.client_services
  for each row execute function public.set_updated_at();

-- Prestaciones contratadas: copia independiente del catálogo.
create table public.client_service_deliverables (
  id uuid primary key default gen_random_uuid(),
  client_service_id uuid not null references public.client_services (id) on delete cascade,
  position int not null default 0,
  title text not null check (length(trim(title)) between 1 and 200),
  description text,
  created_at timestamptz not null default now()
);
create index client_service_deliverables_idx on public.client_service_deliverables (client_service_id, position);
alter table public.client_service_deliverables enable row level security;

-- -----------------------------------------------------------------------------
-- Cobros
-- payments = cobro previsto (importe a cobrar con vencimiento).
-- payment_transactions = movimientos reales de cobro (historial inmutable salvo corrección).
-- amount_paid_cents / last_paid_on se mantienen por trigger a partir de los movimientos.
-- -----------------------------------------------------------------------------
create sequence public.payment_code_seq;

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  code text not null unique
    check (code ~ '^[A-Za-z0-9._-]{1,40}$'),
  client_id uuid not null references public.clients (id) on delete restrict,
  client_service_id uuid references public.client_services (id) on delete set null,
  concept text not null check (length(trim(concept)) between 1 and 200),
  amount_due_cents bigint not null check (amount_due_cents > 0),
  tax_rate numeric(5,2) check (tax_rate is null or (tax_rate >= 0 and tax_rate <= 100)),
  currency char(3) not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  due_date date not null,
  period_start date,
  amount_paid_cents bigint not null default 0,
  last_paid_on date,
  voided_at timestamptz,
  invoice_ref text,
  notes text,
  import_batch_id uuid references public.import_batches (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payments_paid_chk check (amount_paid_cents >= 0 and amount_paid_cents <= amount_due_cents)
);
-- Idempotencia de la generación automática: un cobro por contratación y periodo.
create unique index payments_period_uq on public.payments (client_service_id, period_start)
  where client_service_id is not null and period_start is not null;
create index payments_client_idx on public.payments (client_id);
create index payments_contract_idx on public.payments (client_service_id);
create index payments_due_idx on public.payments (due_date) where voided_at is null;
alter table public.payments enable row level security;
create trigger payments_updated_at before update on public.payments
  for each row execute function public.set_updated_at();

create table public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments (id) on delete cascade,
  kind public.transaction_kind not null default 'payment',
  amount_cents bigint not null check (amount_cents <> 0),
  paid_on date not null default current_date,
  method text,
  note text,
  -- Clave de idempotencia: el cliente la genera al abrir el formulario.
  idempotency_key text not null unique check (length(idempotency_key) between 8 and 120),
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint payment_transactions_kind_chk check (kind = 'adjustment' or amount_cents > 0)
);
create index payment_transactions_payment_idx on public.payment_transactions (payment_id);
create index payment_transactions_paid_on_idx on public.payment_transactions (paid_on);
alter table public.payment_transactions enable row level security;

create or replace function public.refresh_payment_totals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment_id uuid := coalesce(new.payment_id, old.payment_id);
begin
  update public.payments p
  set amount_paid_cents = coalesce(t.total, 0),
      last_paid_on = t.last_on
  from (
    select sum(amount_cents) as total, max(paid_on) filter (where kind = 'payment') as last_on
    from public.payment_transactions where payment_id = v_payment_id
  ) t
  where p.id = v_payment_id;
  return null;
end;
$$;
revoke all on function public.refresh_payment_totals() from public, anon, authenticated;

create trigger payment_transactions_totals
  after insert or update or delete on public.payment_transactions
  for each row execute function public.refresh_payment_totals();

-- Estado derivado del cobro (vencido se calcula con la fecha actual).
create or replace function public.payment_status_of(
  p_amount_due bigint, p_amount_paid bigint, p_due date, p_voided timestamptz, p_today date
)
returns public.payment_status
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when p_voided is not null then 'void'::public.payment_status
    when p_amount_paid >= p_amount_due then 'paid'::public.payment_status
    when p_due < p_today then 'overdue'::public.payment_status
    when p_amount_paid > 0 then 'partial'::public.payment_status
    else 'pending'::public.payment_status
  end;
$$;

create view public.payments_view
with (security_invoker = true)
as
select
  p.*,
  greatest(p.amount_due_cents - p.amount_paid_cents, 0) as amount_outstanding_cents,
  public.payment_status_of(p.amount_due_cents, p.amount_paid_cents, p.due_date, p.voided_at, current_date) as status,
  c.trade_name as client_name,
  c.code as client_code,
  cs.name as contract_name,
  cs.code as contract_code
from public.payments p
join public.clients c on c.id = p.client_id
left join public.client_services cs on cs.id = p.client_service_id;

-- Métricas por cliente para el listado (ordenable por MRR).
create view public.clients_view
with (security_invoker = true)
as
select
  c.*,
  coalesce(m.active_services, 0)::int as active_services,
  coalesce(m.mrr_cents, 0)::bigint as mrr_cents,
  o.full_name as owner_name
from public.clients c
left join lateral (
  select count(*) as active_services, sum(cs.mrr_cents) as mrr_cents
  from public.client_services cs
  where cs.client_id = c.id and cs.status = 'active'
) m on true
left join public.profiles o on o.id = c.owner_id;

create view public.client_services_view
with (security_invoker = true)
as
select
  cs.*,
  c.trade_name as client_name,
  c.code as client_code,
  cat.name as category_name,
  cat.slug as category_slug,
  sc.name as catalog_name,
  o.full_name as owner_name
from public.client_services cs
join public.clients c on c.id = cs.client_id
join public.service_categories cat on cat.id = cs.category_id
left join public.service_catalog sc on sc.id = cs.service_id
left join public.profiles o on o.id = cs.owner_id;

-- Asigna el siguiente código libre (PREFIJO-0001) si no se proporciona uno.
-- Evita colisiones con códigos introducidos manualmente o importados.
create or replace function public.assign_entity_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prefix text := tg_argv[0];
  v_seq text := tg_argv[1];
  v_pad int := tg_argv[2]::int;
  v_candidate text;
  v_exists boolean;
begin
  if new.code is not null and length(trim(new.code)) > 0 then
    new.code := trim(new.code);
    return new;
  end if;
  loop
    v_candidate := v_prefix || '-' || lpad(nextval(v_seq::regclass)::text, v_pad, '0');
    execute format('select exists (select 1 from public.%I where code = $1)', tg_table_name)
      into v_exists using v_candidate;
    exit when not v_exists;
  end loop;
  new.code := v_candidate;
  return new;
end;
$$;
revoke all on function public.assign_entity_code() from public, anon, authenticated;

create trigger clients_code before insert on public.clients
  for each row execute function public.assign_entity_code('CLI', 'public.client_code_seq', '4');
create trigger client_services_code before insert on public.client_services
  for each row execute function public.assign_entity_code('CON', 'public.contract_code_seq', '4');
create trigger payments_code before insert on public.payments
  for each row execute function public.assign_entity_code('COB', 'public.payment_code_seq', '5');

-- -----------------------------------------------------------------------------
-- Actividad
-- -----------------------------------------------------------------------------
create table public.activity_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id) on delete set null default auth.uid(),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  client_id uuid references public.clients (id) on delete cascade,
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index activity_log_created_idx on public.activity_log (created_at desc);
create index activity_log_client_idx on public.activity_log (client_id, created_at desc);
alter table public.activity_log enable row level security;

-- Columnas que han cambiado (solo nombres; nunca valores de notas ni secretos).
create or replace function public.changed_columns(p_old jsonb, p_new jsonb)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(key order by key), '{}')
  from jsonb_each(p_new) n
  where key not in ('updated_at', 'updated_by', 'mrr_cents', 'amount_paid_cents', 'last_paid_on')
    and (p_old -> key) is distinct from n.value;
$$;

create or replace function public.log_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action text;
  v_summary text;
  v_client uuid;
  v_meta jsonb := '{}'::jsonb;
  v_changed text[];
begin
  if tg_table_name = 'clients' then
    v_client := new.id;
    if tg_op = 'INSERT' then
      v_action := 'client.created';
      v_summary := 'Cliente creado: ' || new.trade_name;
    else
      v_changed := public.changed_columns(to_jsonb(old), to_jsonb(new));
      if array_length(v_changed, 1) is null then return null; end if;
      if old.archived_at is null and new.archived_at is not null then
        v_action := 'client.archived';
        v_summary := 'Cliente archivado: ' || new.trade_name;
      elsif old.archived_at is not null and new.archived_at is null then
        v_action := 'client.restored';
        v_summary := 'Cliente restaurado: ' || new.trade_name;
      else
        v_action := 'client.updated';
        v_summary := 'Cliente editado: ' || new.trade_name;
      end if;
      v_meta := jsonb_build_object('changed', to_jsonb(v_changed));
      if old.status is distinct from new.status then
        v_meta := v_meta || jsonb_build_object('status', jsonb_build_object('from', old.status, 'to', new.status));
      end if;
    end if;
  elsif tg_table_name = 'client_services' then
    v_client := new.client_id;
    if tg_op = 'INSERT' then
      v_action := 'contract.created';
      v_summary := 'Contratación creada: ' || new.name;
    else
      v_changed := public.changed_columns(to_jsonb(old), to_jsonb(new));
      if array_length(v_changed, 1) is null then return null; end if;
      v_action := 'contract.updated';
      v_summary := 'Contratación modificada: ' || new.name;
      v_meta := jsonb_build_object('changed', to_jsonb(v_changed));
      if old.status is distinct from new.status then
        v_meta := v_meta || jsonb_build_object('status', jsonb_build_object('from', old.status, 'to', new.status));
      end if;
    end if;
  elsif tg_table_name = 'payments' then
    v_client := new.client_id;
    if tg_op = 'INSERT' then
      v_action := 'payment.scheduled';
      v_summary := 'Cobro previsto: ' || new.concept;
    elsif old.voided_at is null and new.voided_at is not null then
      v_action := 'payment.voided';
      v_summary := 'Cobro anulado: ' || new.concept;
    else
      return null;
    end if;
  elsif tg_table_name = 'payment_transactions' then
    select p.client_id, p.concept into v_client, v_summary from public.payments p where p.id = new.payment_id;
    v_action := case when new.kind = 'payment' then 'payment.recorded' else 'payment.adjusted' end;
    v_summary := 'Cobro registrado: ' || coalesce(v_summary, '') ;
    v_meta := jsonb_build_object('amount_cents', new.amount_cents, 'paid_on', new.paid_on);
  else
    return null;
  end if;

  insert into public.activity_log (actor_id, action, entity_type, entity_id, client_id, summary, metadata)
  values (auth.uid(), v_action, tg_table_name, new.id, v_client, v_summary, v_meta);
  return null;
end;
$$;
revoke all on function public.log_activity() from public, anon, authenticated;

create trigger clients_activity after insert or update on public.clients
  for each row execute function public.log_activity();
create trigger client_services_activity after insert or update on public.client_services
  for each row execute function public.log_activity();
create trigger payments_activity after insert or update on public.payments
  for each row execute function public.log_activity();
create trigger payment_transactions_activity after insert on public.payment_transactions
  for each row execute function public.log_activity();

-- Mantener updated_by
create or replace function public.set_updated_by()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    new.updated_by := auth.uid();
  end if;
  return new;
end;
$$;
create trigger clients_updated_by before update on public.clients
  for each row execute function public.set_updated_by();
create trigger client_services_updated_by before update on public.client_services
  for each row execute function public.set_updated_by();

-- -----------------------------------------------------------------------------
-- Políticas RLS: solo miembros autorizados (is_member) acceden a datos operativos.
-- Clientes y contrataciones no se borran (se archivan / cancelan).
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'service_categories', 'service_catalog', 'service_catalog_deliverables',
    'clients', 'client_notes', 'client_services', 'client_service_deliverables',
    'payments', 'payment_transactions', 'import_batches'
  ] loop
    execute format('create policy "%1$s: members select" on public.%1$I for select to authenticated using (public.is_member())', t);
    execute format('create policy "%1$s: members insert" on public.%1$I for insert to authenticated with check (public.is_member())', t);
    execute format('create policy "%1$s: members update" on public.%1$I for update to authenticated using (public.is_member()) with check (public.is_member())', t);
  end loop;

  foreach t in array array[
    'service_catalog', 'service_catalog_deliverables', 'client_notes',
    'client_service_deliverables', 'payment_transactions'
  ] loop
    execute format('create policy "%1$s: members delete" on public.%1$I for delete to authenticated using (public.is_member())', t);
  end loop;
end;
$$;

-- La actividad solo se lee; se escribe exclusivamente mediante triggers.
create policy "activity_log: members select" on public.activity_log
  for select to authenticated using (public.is_member());

-- Sin acceso para anon en ninguna tabla.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on public.activity_log from authenticated;
grant select on public.activity_log to authenticated;
revoke insert, update, delete on public.payments_view, public.clients_view, public.client_services_view from authenticated;

-- -----------------------------------------------------------------------------
-- Datos iniciales del catálogo (plantillas editables)
-- -----------------------------------------------------------------------------
insert into public.service_categories (slug, name, sort_order) values
  ('social', 'Redes sociales', 10),
  ('seo', 'SEO', 20),
  ('geo', 'GEO', 30),
  ('web', 'Desarrollo web', 40),
  ('maintenance', 'Mantenimiento y hosting', 50),
  ('other', 'Otros', 60);

with cat as (select id, slug from public.service_categories),
svc as (
  insert into public.service_catalog (category_id, name, description, suggested_billing_type, suggested_periodicity)
  select cat.id, v.name, v.description, v.billing::public.billing_type, v.periodicity::public.periodicity
  from (values
    ('social', 'Gestión de redes sociales', 'Gestión mensual de perfiles sociales: planificación, diseño, publicación y community management.', 'recurring', 'monthly'),
    ('social', 'Creación y edición de reels', 'Producción y edición de vídeo corto para Instagram y TikTok.', 'recurring', 'monthly'),
    ('social', 'Estrategia de comunicación', 'Definición de tono, pilares de contenido y calendario editorial.', 'one_time', null),
    ('seo', 'SEO mensual', 'Mejora continua del posicionamiento orgánico.', 'recurring', 'monthly'),
    ('seo', 'Auditoría SEO', 'Auditoría técnica y de contenidos con plan de acción priorizado.', 'one_time', null),
    ('seo', 'SEO local y Google Business Profile', 'Optimización de presencia local y ficha de Google Business Profile.', 'recurring', 'monthly'),
    ('geo', 'GEO mensual', 'Optimización de la visibilidad en motores de respuesta con IA.', 'recurring', 'monthly'),
    ('geo', 'Auditoría GEO', 'Análisis de presencia de la marca en respuestas generadas por IA.', 'one_time', null),
    ('web', 'Landing page', 'Diseño y desarrollo de una página de aterrizaje.', 'one_time', null),
    ('web', 'Web corporativa', 'Diseño y desarrollo de web corporativa.', 'one_time', null),
    ('web', 'Tienda online', 'Diseño y desarrollo de comercio electrónico.', 'one_time', null),
    ('web', 'Aplicación web', 'Desarrollo de aplicación web a medida.', 'one_time', null),
    ('maintenance', 'Mantenimiento web', 'Actualizaciones, copias de seguridad, seguridad y soporte técnico.', 'recurring', 'monthly'),
    ('maintenance', 'Hosting', 'Alojamiento gestionado.', 'recurring', 'annual'),
    ('maintenance', 'Dominio', 'Registro y renovación de dominio.', 'recurring', 'annual')
  ) as v(slug, name, description, billing, periodicity)
  join cat on cat.slug = v.slug
  returning id, name
)
insert into public.service_catalog_deliverables (service_id, position, title)
select svc.id, d.pos, d.title
from svc
join (values
  ('Gestión de redes sociales', 1, 'Número de publicaciones al mes'),
  ('Gestión de redes sociales', 2, 'Número de reels al mes'),
  ('Gestión de redes sociales', 3, 'Redes gestionadas'),
  ('Gestión de redes sociales', 4, 'Calendario editorial'),
  ('Gestión de redes sociales', 5, 'Informe mensual de resultados'),
  ('SEO mensual', 1, 'Revisión técnica'),
  ('SEO mensual', 2, 'Optimización on-page'),
  ('SEO mensual', 3, 'Seguimiento de posicionamiento'),
  ('SEO mensual', 4, 'Informe mensual'),
  ('GEO mensual', 1, 'Análisis de visibilidad en IA'),
  ('GEO mensual', 2, 'Optimización semántica'),
  ('GEO mensual', 3, 'Recomendaciones técnicas'),
  ('GEO mensual', 4, 'Seguimiento de consultas seleccionadas'),
  ('Web corporativa', 1, 'Diseño'),
  ('Web corporativa', 2, 'Desarrollo'),
  ('Web corporativa', 3, 'Responsive'),
  ('Web corporativa', 4, 'SEO inicial'),
  ('Web corporativa', 5, 'Publicación'),
  ('Landing page', 1, 'Diseño'),
  ('Landing page', 2, 'Desarrollo'),
  ('Landing page', 3, 'Responsive'),
  ('Landing page', 4, 'Publicación'),
  ('Mantenimiento web', 1, 'Actualizaciones'),
  ('Mantenimiento web', 2, 'Copias de seguridad'),
  ('Mantenimiento web', 3, 'Monitorización y seguridad'),
  ('Mantenimiento web', 4, 'Soporte técnico')
) as d(name, pos, title) on d.name = svc.name;

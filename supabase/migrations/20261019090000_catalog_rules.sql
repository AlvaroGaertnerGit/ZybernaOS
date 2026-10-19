-- =============================================================================
-- Catálogo comercial con tarifas, modalidades y reglas de combinación.
--
-- Cambios incrementales (no se elimina ni se reescribe ningún dato existente):
--  * service_catalog: identificador estable (key) y reglas (grupo de alternativas,
--    dependencias e incompatibilidades), referenciadas por key, nunca por el nombre.
--  * service_catalog_modalities: otras modalidades de precio del mismo servicio
--    (p. ej. trimestral / anual / pago único) con su propia tarifa.
--  * client_services: proyecto (para contratar el mismo servicio en webs distintas),
--    copia de las condiciones del catálogo al contratar, y componente variable.
--  * contract_variable_periods: cálculo del componente variable por periodo.
--  * Las reglas se validan en la base de datos (trigger diferido) para cualquier vía
--    de escritura: formularios, alta guiada, importación Excel o peticiones directas.
--  * Datos: tarifas de la propuesta comercial SEO/GEO del 15/10/2026.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Catálogo: identificador estable y reglas
-- -----------------------------------------------------------------------------
create or replace function public.valid_rule_refs(p_refs text[])
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(bool_and(r ~ '^(group:)?[a-z0-9_]{1,40}$'), true) from unnest(p_refs) as r;
$$;

alter table public.service_catalog
  add column key text,
  add column exclusive_group text,
  add column requires_any text[] not null default '{}',
  add column excludes text[] not null default '{}';

-- Identificadores estables para el catálogo inicial.
update public.service_catalog s
set key = v.key
from (values
  ('social', 'gestión de redes sociales', 'redes_sociales'),
  ('social', 'creación y edición de reels', 'reels'),
  ('social', 'estrategia de comunicación', 'estrategia_comunicacion'),
  ('seo', 'seo mensual', 'seo_mensual'),
  ('seo', 'auditoría seo', 'auditoria_seo'),
  ('seo', 'seo local y google business profile', 'seo_local'),
  ('geo', 'geo mensual', 'geo_mensual'),
  ('geo', 'auditoría geo', 'auditoria_geo'),
  ('web', 'landing page', 'landing_page'),
  ('web', 'web corporativa', 'web_corporativa'),
  ('web', 'tienda online', 'tienda_online'),
  ('web', 'aplicación web', 'aplicacion_web'),
  ('maintenance', 'mantenimiento web', 'mantenimiento_web'),
  ('maintenance', 'hosting', 'hosting'),
  ('maintenance', 'dominio', 'dominio')
) as v(slug, name, key), public.service_categories c
where c.id = s.category_id and c.slug = v.slug and lower(s.name) = v.name;

-- Cualquier otro servicio creado a mano recibe un identificador derivado de su id.
update public.service_catalog
set key = 'svc_' || substr(replace(id::text, '-', ''), 1, 12)
where key is null;

alter table public.service_catalog
  alter column key set not null,
  add constraint service_catalog_key_format check (key ~ '^[a-z0-9_]{1,40}$'),
  add constraint service_catalog_key_uq unique (key),
  add constraint service_catalog_group_format check (exclusive_group is null or exclusive_group ~ '^[a-z0-9_]{1,40}$'),
  add constraint service_catalog_requires_chk check (public.valid_rule_refs(requires_any) and cardinality(requires_any) <= 20),
  add constraint service_catalog_excludes_chk check (public.valid_rule_refs(excludes) and cardinality(excludes) <= 20);

-- La key es el identificador estable que usan las reglas: se genera a partir del
-- nombre al crear el servicio (si no se indica) y no se puede cambiar después.
create or replace function public.catalog_key_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_base text;
  v_key text;
  n int := 1;
begin
  if tg_op = 'UPDATE' then
    if new.key is distinct from old.key then
      raise exception 'El identificador del servicio no se puede modificar';
    end if;
    return new;
  end if;
  if new.key is null or new.key = '' then
    v_base := left(trim(both '_' from regexp_replace(
      translate(lower(new.name), 'áàäâéèëêíìïîóòöôúùüûñç', 'aaaaeeeeiiiioooouuuunc'),
      '[^a-z0-9]+', '_', 'g')), 34);
    if v_base = '' then v_base := 'servicio'; end if;
    v_key := v_base;
    while exists (select 1 from public.service_catalog where key = v_key) loop
      n := n + 1;
      v_key := v_base || '_' || n;
    end loop;
    new.key := v_key;
  end if;
  return new;
end;
$$;
create trigger service_catalog_key_guard before insert or update on public.service_catalog
  for each row execute function public.catalog_key_guard();

-- -----------------------------------------------------------------------------
-- 2. Modalidades adicionales de precio (la modalidad principal sigue en service_catalog)
-- -----------------------------------------------------------------------------
create table public.service_catalog_modalities (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.service_catalog (id) on delete cascade,
  billing_type public.billing_type not null,
  periodicity public.periodicity,
  price_cents bigint check (price_cents is null or price_cents >= 0),
  position int not null default 0,
  created_at timestamptz not null default now(),
  constraint service_catalog_modalities_chk check (
    (billing_type = 'one_time' and periodicity is null)
    or (billing_type = 'recurring' and periodicity is not null and periodicity <> 'custom')
  )
);
create unique index service_catalog_modalities_recurring_uq
  on public.service_catalog_modalities (service_id, periodicity) where periodicity is not null;
create unique index service_catalog_modalities_one_time_uq
  on public.service_catalog_modalities (service_id) where billing_type = 'one_time';
alter table public.service_catalog_modalities enable row level security;

create policy "service_catalog_modalities: members select" on public.service_catalog_modalities
  for select to authenticated using (public.is_member());
create policy "service_catalog_modalities: members insert" on public.service_catalog_modalities
  for insert to authenticated with check (public.is_member());
create policy "service_catalog_modalities: members update" on public.service_catalog_modalities
  for update to authenticated using (public.is_member()) with check (public.is_member());
create policy "service_catalog_modalities: members delete" on public.service_catalog_modalities
  for delete to authenticated using (public.is_member());
revoke all on public.service_catalog_modalities from anon;

-- Guardado atómico de un servicio del catálogo con prestaciones y modalidades.
create or replace function public.save_catalog_service(p_id uuid, p_values jsonb, p_deliverables jsonb, p_modalities jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  r public.service_catalog;
  v_id uuid;
begin
  if not public.is_member() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if jsonb_typeof(p_modalities) <> 'array' or jsonb_array_length(p_modalities) > 10 then
    raise exception 'Lista de modalidades no válida';
  end if;
  r := jsonb_populate_record(null::public.service_catalog, p_values);

  if p_id is null then
    insert into public.service_catalog (key, category_id, name, description, default_price_cents, currency,
      suggested_billing_type, suggested_periodicity, status, exclusive_group, requires_any, excludes)
    values (r.key, r.category_id, r.name, r.description, r.default_price_cents, coalesce(r.currency, 'EUR'),
      r.suggested_billing_type, r.suggested_periodicity, coalesce(r.status, 'active'), r.exclusive_group,
      coalesce(r.requires_any, '{}'), coalesce(r.excludes, '{}'))
    returning id into v_id;
  else
    update public.service_catalog set
      category_id = r.category_id, name = r.name, description = r.description,
      default_price_cents = r.default_price_cents, currency = coalesce(r.currency, currency),
      suggested_billing_type = r.suggested_billing_type, suggested_periodicity = r.suggested_periodicity,
      status = r.status, exclusive_group = r.exclusive_group,
      requires_any = coalesce(r.requires_any, '{}'), excludes = coalesce(r.excludes, '{}')
    where id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception 'Servicio no encontrado';
    end if;
  end if;

  perform public.replace_catalog_deliverables(v_id, p_deliverables);

  delete from public.service_catalog_modalities where service_id = v_id;
  insert into public.service_catalog_modalities (service_id, billing_type, periodicity, price_cents, position)
  select v_id, m.billing_type, m.periodicity, m.price_cents, m.ord
  from jsonb_to_recordset(p_modalities) with ordinality as m(billing_type public.billing_type,
    periodicity public.periodicity, price_cents bigint, ord bigint);
  return v_id;
end;
$$;
revoke all on function public.save_catalog_service(uuid, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.save_catalog_service(uuid, jsonb, jsonb, jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Contrataciones: proyecto, copia de condiciones y componente variable
-- -----------------------------------------------------------------------------
alter table public.client_services
  add column project text check (project is null or length(trim(project)) between 1 and 120),
  add column list_price_cents bigint check (list_price_cents is null or list_price_cents >= 0),
  add column catalog_snapshot jsonb,
  add column variable_rate numeric(5,2) check (variable_rate is null or (variable_rate > 0 and variable_rate <= 100)),
  add column variable_basis text check (variable_basis is null or variable_basis in ('profit', 'revenue', 'billing')),
  add constraint client_services_variable_chk check ((variable_rate is null) = (variable_basis is null));

-- Copia de las condiciones del catálogo en el momento de contratar. Solo se renueva
-- si cambia el servicio o la modalidad de la contratación; los cambios posteriores
-- del catálogo no alteran contratos existentes. No es editable desde la app.
create or replace function public.snapshot_catalog_terms()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  s public.service_catalog;
  v_price bigint;
  v_found boolean := false;
begin
  if tg_op = 'UPDATE'
     and new.service_id is not distinct from old.service_id
     and new.billing_type = old.billing_type
     and new.periodicity is not distinct from old.periodicity then
    new.catalog_snapshot := old.catalog_snapshot;
    new.list_price_cents := old.list_price_cents;
    return new;
  end if;

  if new.service_id is null then
    new.catalog_snapshot := null;
    new.list_price_cents := null;
    return new;
  end if;

  select * into s from public.service_catalog where id = new.service_id;
  if not found then
    new.catalog_snapshot := null;
    new.list_price_cents := null;
    return new;
  end if;

  if s.suggested_billing_type = new.billing_type and s.suggested_periodicity is not distinct from new.periodicity then
    v_price := s.default_price_cents;
    v_found := true;
  else
    select m.price_cents, true into v_price, v_found
    from public.service_catalog_modalities m
    where m.service_id = s.id and m.billing_type = new.billing_type
      and m.periodicity is not distinct from new.periodicity;
  end if;

  new.list_price_cents := case when v_found then v_price end;
  new.catalog_snapshot := jsonb_build_object(
    'key', s.key,
    'name', s.name,
    'billing_type', new.billing_type,
    'periodicity', new.periodicity,
    'price_cents', case when v_found then v_price end,
    'modality_in_catalog', coalesce(v_found, false),
    'currency', s.currency,
    'deliverables', coalesce((
      select jsonb_agg(d.title order by d.position)
      from public.service_catalog_deliverables d where d.service_id = s.id
    ), '[]'::jsonb),
    'captured_at', now()
  );
  return new;
end;
$$;
create trigger client_services_snapshot before insert or update on public.client_services
  for each row execute function public.snapshot_catalog_terms();

-- Reglas de combinación. Se comprueban al confirmar la transacción (trigger diferido),
-- así un alta con varios servicios se valida como conjunto, en cualquier orden.
-- Ámbito: contrataciones vivas (borrador, activa, pausada) del mismo cliente y proyecto.
create or replace function public.check_contract_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  cur public.client_services;
  s public.service_catalog;
  other record;
  v_label text;
  v_check_requires boolean := tg_op = 'INSERT';
begin
  if tg_op = 'UPDATE' then
    -- Editar notas, fechas o precios no revalida: solo lo que cambia la combinación.
    if new.service_id is not distinct from old.service_id and new.status = old.status
       and new.project is not distinct from old.project and new.client_id = old.client_id then
      return null;
    end if;
    v_check_requires := old.service_id is distinct from new.service_id or old.status in ('finished', 'cancelled');
  end if;

  select * into cur from public.client_services where id = new.id;
  if not found or cur.service_id is null or cur.status not in ('draft', 'active', 'paused') then
    return null;
  end if;
  select * into s from public.service_catalog where id = cur.service_id;
  if not found then
    return null;
  end if;

  for other in
    select cs.code, cs.name, sc.key, sc.exclusive_group, sc.excludes
    from public.client_services cs
    join public.service_catalog sc on sc.id = cs.service_id
    where cs.client_id = cur.client_id
      and cs.id <> cur.id
      and cs.status in ('draft', 'active', 'paused')
      and lower(coalesce(trim(cs.project), '')) = lower(coalesce(trim(cur.project), ''))
  loop
    if s.exclusive_group is not null and other.exclusive_group = s.exclusive_group then
      raise exception '%: «%» y «%» (%) son alternativas: solo puede haber una activa por cliente y proyecto. Finaliza o cancela la anterior, cámbiala de plan o indica un proyecto distinto.',
        cur.code, cur.name, other.name, other.code;
    end if;
    if other.key = any (s.excludes) or s.key = any (other.excludes) then
      raise exception '%: «%» no es compatible con «%» (%) en el mismo cliente y proyecto.',
        cur.code, cur.name, other.name, other.code;
    end if;
  end loop;

  -- Dependencias: solo al contratar o al cambiar de servicio (no invalidan el histórico).
  if cardinality(s.requires_any) > 0 and v_check_requires then
    if not exists (
      select 1
      from public.client_services cs
      join public.service_catalog sc on sc.id = cs.service_id
      where cs.client_id = cur.client_id
        and cs.id <> cur.id
        and cs.status in ('draft', 'active', 'paused')
        and lower(coalesce(trim(cs.project), '')) = lower(coalesce(trim(cur.project), ''))
        and (sc.key = any (s.requires_any) or ('group:' || sc.exclusive_group) = any (s.requires_any))
    ) then
      select string_agg(sc.name, ', ' order by sc.default_price_cents nulls last, sc.name) into v_label
      from public.service_catalog sc
      where sc.key = any (s.requires_any) or ('group:' || sc.exclusive_group) = any (s.requires_any);
      raise exception '%: «%» requiere contratar también uno de estos servicios para el mismo proyecto: %.',
        cur.code, cur.name, coalesce(v_label, array_to_string(s.requires_any, ', '));
    end if;
  end if;
  return null;
end;
$$;

create constraint trigger client_services_rules
  after insert or update on public.client_services
  deferrable initially deferred
  for each row execute function public.check_contract_rules();

-- -----------------------------------------------------------------------------
-- 4. Componente variable por periodo (p. ej. % de beneficios mensuales)
-- -----------------------------------------------------------------------------
create table public.contract_variable_periods (
  id uuid primary key default gen_random_uuid(),
  client_service_id uuid not null references public.client_services (id) on delete restrict,
  period_start date not null,
  period_end date not null,
  rate numeric(5,2) not null check (rate > 0 and rate <= 100),
  basis text not null check (basis in ('profit', 'revenue', 'billing')),
  -- Importe de la base (puede ser negativo: pérdidas). Null = pendiente de determinar.
  base_amount_cents bigint check (base_amount_cents is null or abs(base_amount_cents) <= 99999999999),
  result_cents bigint generated always as (
    case when base_amount_cents is null then null
         else greatest(round(base_amount_cents::numeric * rate / 100), 0)::bigint end
  ) stored,
  payment_id uuid references public.payments (id) on delete set null,
  notes text check (notes is null or length(notes) <= 2000),
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contract_variable_periods_dates_chk check (period_end >= period_start),
  constraint contract_variable_periods_uq unique (client_service_id, period_start)
);
create index contract_variable_periods_start_idx on public.contract_variable_periods (period_start);
alter table public.contract_variable_periods enable row level security;
create trigger contract_variable_periods_updated_at before update on public.contract_variable_periods
  for each row execute function public.set_updated_at();

-- Un periodo ya convertido en cobro conserva su base (el cobro es el registro contable).
create or replace function public.protect_variable_period()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.payment_id is not null and (
    new.base_amount_cents is distinct from old.base_amount_cents
    or new.rate is distinct from old.rate
    or new.basis is distinct from old.basis
    or new.period_start is distinct from old.period_start
    or new.period_end is distinct from old.period_end
  ) then
    raise exception 'Este periodo ya tiene un cobro previsto: anula el cobro antes de modificarlo.';
  end if;
  return new;
end;
$$;
create trigger contract_variable_periods_protect before update on public.contract_variable_periods
  for each row execute function public.protect_variable_period();

create policy "contract_variable_periods: members select" on public.contract_variable_periods
  for select to authenticated using (public.is_member());
create policy "contract_variable_periods: members insert" on public.contract_variable_periods
  for insert to authenticated with check (public.is_member());
create policy "contract_variable_periods: members update" on public.contract_variable_periods
  for update to authenticated using (public.is_member()) with check (public.is_member());
create policy "contract_variable_periods: members delete unbilled" on public.contract_variable_periods
  for delete to authenticated using (public.is_member() and payment_id is null);
revoke all on public.contract_variable_periods from anon;

-- Crea (a petición explícita) el cobro previsto de un periodo variable determinado.
create or replace function public.create_variable_payment(p_period_id uuid, p_due_date date)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v public.contract_variable_periods;
  c public.client_services;
  v_payment uuid;
begin
  if not public.is_member() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  select * into v from public.contract_variable_periods where id = p_period_id for update;
  if not found then
    raise exception 'Periodo no encontrado';
  end if;
  if v.payment_id is not null then
    raise exception 'Este periodo ya tiene un cobro previsto.';
  end if;
  if v.result_cents is null then
    raise exception 'Falta el importe de la base: el componente variable está pendiente.';
  end if;
  if v.result_cents <= 0 then
    raise exception 'El componente variable de este periodo es 0: no hay nada que cobrar.';
  end if;
  select * into c from public.client_services where id = v.client_service_id;

  insert into public.payments (client_id, client_service_id, concept, amount_due_cents, tax_rate, currency, due_date)
  values (c.client_id, c.id,
    left(c.name || ' · variable ' || replace(rtrim(rtrim(v.rate::text, '0'), '.'), '.', ',') || ' % · '
      || to_char(v.period_start, 'DD/MM/YYYY') || '–' || to_char(v.period_end, 'DD/MM/YYYY'), 200),
    v.result_cents, c.tax_rate, c.currency, coalesce(p_due_date, current_date))
  returning id into v_payment;

  update public.contract_variable_periods set payment_id = v_payment where id = v.id;
  return v_payment;
end;
$$;
revoke all on function public.create_variable_payment(uuid, date) from public, anon;
grant execute on function public.create_variable_payment(uuid, date) to authenticated;

-- Resumen del componente variable para el dashboard (agregado en SQL: sin límite de 1.000 filas).
create or replace function public.variable_summary(p_period_start date, p_period_end date)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v jsonb;
begin
  if not public.is_member() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'determined', coalesce(sum(result_cents) filter (where result_cents is not null), 0),
    'determinedCount', count(*) filter (where result_cents is not null),
    'pendingCount', count(*) filter (where base_amount_cents is null),
    'billed', coalesce(sum(result_cents) filter (where payment_id is not null), 0)
  ) into v
  from public.contract_variable_periods
  where period_start between p_period_start and p_period_end;
  return v;
end;
$$;
revoke all on function public.variable_summary(date, date) from public, anon;
grant execute on function public.variable_summary(date, date) to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Vista de contrataciones (nuevas columnas + key del catálogo)
-- -----------------------------------------------------------------------------
drop view public.client_services_view;
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
  sc.key as catalog_key,
  o.full_name as owner_name
from public.client_services cs
join public.clients c on c.id = cs.client_id
join public.service_categories cat on cat.id = cs.category_id
left join public.service_catalog sc on sc.id = cs.service_id
left join public.profiles o on o.id = cs.owner_id;
revoke all on public.client_services_view from anon;
revoke insert, update, delete on public.client_services_view from authenticated;
grant select on public.client_services_view to authenticated;

-- -----------------------------------------------------------------------------
-- 6. RPC de contrataciones: nuevas columnas y validación de reglas al final
-- -----------------------------------------------------------------------------
create or replace function public.save_contract(p_id uuid, p_values jsonb, p_deliverables jsonb default null)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  r public.client_services;
  v_id uuid;
  v_code text;
begin
  if not public.is_member() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  r := jsonb_populate_record(null::public.client_services, p_values);

  if p_id is null then
    insert into public.client_services (code, client_id, service_id, category_id, name, description, amount_cents,
      tax_rate, currency, billing_type, periodicity, interval_count, interval_unit, start_date, end_date,
      next_renewal_date, status, owner_id, notes, project, variable_rate, variable_basis)
    values (r.code, r.client_id, r.service_id, r.category_id, r.name, r.description, r.amount_cents,
      r.tax_rate, coalesce(r.currency, 'EUR'), r.billing_type, r.periodicity, r.interval_count, r.interval_unit,
      coalesce(r.start_date, current_date), r.end_date, r.next_renewal_date, coalesce(r.status, 'active'),
      r.owner_id, r.notes, r.project, r.variable_rate, r.variable_basis)
    returning id, code into v_id, v_code;
  else
    update public.client_services set
      code = coalesce(r.code, code), service_id = r.service_id, category_id = r.category_id, name = r.name,
      description = r.description, amount_cents = r.amount_cents, tax_rate = r.tax_rate,
      currency = coalesce(r.currency, currency), billing_type = r.billing_type, periodicity = r.periodicity,
      interval_count = r.interval_count, interval_unit = r.interval_unit, start_date = r.start_date,
      end_date = r.end_date, next_renewal_date = r.next_renewal_date, status = r.status, owner_id = r.owner_id,
      notes = r.notes, project = r.project, variable_rate = r.variable_rate, variable_basis = r.variable_basis
    where id = p_id
    returning id, code into v_id, v_code;
    if v_id is null then
      raise exception 'Contratación no encontrada';
    end if;
  end if;

  if p_deliverables is not null then
    perform public.replace_contract_deliverables(v_id, p_deliverables);
  end if;
  return jsonb_build_object('id', v_id, 'code', v_code);
end;
$$;

-- Alta guiada: las reglas se comprueban sobre el conjunto completo al final.
create or replace function public.create_client_with_contracts(p_client jsonb, p_contracts jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  c public.clients;
  v_id uuid;
  v_code text;
  item jsonb;
begin
  if not public.is_member() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_contracts, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_contracts, '[]'::jsonb)) > 20 then
    raise exception 'Lista de contrataciones no válida';
  end if;
  c := jsonb_populate_record(null::public.clients, p_client);
  insert into public.clients (code, trade_name, legal_name, tax_id, contact_name, email, phone, website, address,
    sector, status, owner_id, joined_on, notes)
  values (c.code, c.trade_name, c.legal_name, c.tax_id, c.contact_name, c.email, c.phone, c.website, c.address,
    c.sector, coalesce(c.status, 'lead'), c.owner_id, coalesce(c.joined_on, current_date), c.notes)
  returning id, code into v_id, v_code;

  for item in select * from jsonb_array_elements(coalesce(p_contracts, '[]'::jsonb)) loop
    perform public.save_contract(
      null,
      (item -> 'values') || jsonb_build_object('client_id', v_id),
      coalesce(item -> 'deliverables', '[]'::jsonb)
    );
  end loop;
  set constraints all immediate;
  return jsonb_build_object('id', v_id, 'code', v_code, 'contracts', jsonb_array_length(coalesce(p_contracts, '[]'::jsonb)));
end;
$$;

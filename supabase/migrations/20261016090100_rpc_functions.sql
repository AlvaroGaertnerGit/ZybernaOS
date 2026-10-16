-- =============================================================================
-- Operaciones transaccionales (RPC). Todas son SECURITY INVOKER: se ejecutan con
-- los permisos del usuario y respetan RLS. Además verifican is_member().
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Generación controlada e idempotente de cobros previstos para una contratación.
-- p_items: [{ "period_start": "YYYY-MM-DD", "due_date": "YYYY-MM-DD", "concept": "..." }]
-- Los periodos los calcula el servidor (src/lib/calculations/billing.ts).
-- Un cobro por (contratación, periodo): reejecutar no crea duplicados.
-- -----------------------------------------------------------------------------
create or replace function public.create_scheduled_payments(p_contract_id uuid, p_items jsonb)
returns int
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_contract public.client_services%rowtype;
  v_count int;
begin
  if not public.is_member() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 24 then
    raise exception 'Lista de periodos no válida (máximo 24)';
  end if;

  select * into v_contract from public.client_services where id = p_contract_id;
  if not found then
    raise exception 'Contratación no encontrada';
  end if;
  if v_contract.amount_cents <= 0 then
    raise exception 'La contratación no tiene importe';
  end if;

  insert into public.payments (client_id, client_service_id, concept, amount_due_cents, tax_rate, currency, due_date, period_start)
  select v_contract.client_id, v_contract.id, left(i.concept, 200), v_contract.amount_cents,
         v_contract.tax_rate, v_contract.currency, i.due_date, i.period_start
  from jsonb_to_recordset(p_items) as i(period_start date, due_date date, concept text)
  on conflict (client_service_id, period_start)
    where client_service_id is not null and period_start is not null
  do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.create_scheduled_payments(uuid, jsonb) from public, anon;
grant execute on function public.create_scheduled_payments(uuid, jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- Reemplazo atómico de prestaciones de una contratación (añadir/editar/eliminar/reordenar).
-- -----------------------------------------------------------------------------
create or replace function public.replace_contract_deliverables(p_contract_id uuid, p_items jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.is_member() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 100 then
    raise exception 'Lista de prestaciones no válida';
  end if;
  if not exists (select 1 from public.client_services where id = p_contract_id) then
    raise exception 'Contratación no encontrada';
  end if;

  delete from public.client_service_deliverables where client_service_id = p_contract_id;
  insert into public.client_service_deliverables (client_service_id, position, title, description)
  select p_contract_id, row_number() over (order by i.ord), trim(i.value ->> 'title'), nullif(trim(i.value ->> 'description'), '')
  from jsonb_array_elements(p_items) with ordinality as i(value, ord)
  where length(trim(coalesce(i.value ->> 'title', ''))) > 0;
end;
$$;
revoke all on function public.replace_contract_deliverables(uuid, jsonb) from public, anon;
grant execute on function public.replace_contract_deliverables(uuid, jsonb) to authenticated;

create or replace function public.replace_catalog_deliverables(p_service_id uuid, p_items jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.is_member() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 100 then
    raise exception 'Lista de prestaciones no válida';
  end if;
  delete from public.service_catalog_deliverables where service_id = p_service_id;
  insert into public.service_catalog_deliverables (service_id, position, title, description)
  select p_service_id, row_number() over (order by i.ord), trim(i.value ->> 'title'), nullif(trim(i.value ->> 'description'), '')
  from jsonb_array_elements(p_items) with ordinality as i(value, ord)
  where length(trim(coalesce(i.value ->> 'title', ''))) > 0;
end;
$$;
revoke all on function public.replace_catalog_deliverables(uuid, jsonb) from public, anon;
grant execute on function public.replace_catalog_deliverables(uuid, jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- Guardado atómico de una contratación con sus prestaciones.
-- p_id null → alta; en otro caso, actualización. p_deliverables null → no tocar prestaciones.
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
      next_renewal_date, status, owner_id, notes)
    values (r.code, r.client_id, r.service_id, r.category_id, r.name, r.description, r.amount_cents,
      r.tax_rate, coalesce(r.currency, 'EUR'), r.billing_type, r.periodicity, r.interval_count, r.interval_unit,
      coalesce(r.start_date, current_date), r.end_date, r.next_renewal_date, coalesce(r.status, 'active'),
      r.owner_id, r.notes)
    returning id, code into v_id, v_code;
  else
    update public.client_services set
      code = coalesce(r.code, code), service_id = r.service_id, category_id = r.category_id, name = r.name,
      description = r.description, amount_cents = r.amount_cents, tax_rate = r.tax_rate,
      currency = coalesce(r.currency, currency), billing_type = r.billing_type, periodicity = r.periodicity,
      interval_count = r.interval_count, interval_unit = r.interval_unit, start_date = r.start_date,
      end_date = r.end_date, next_renewal_date = r.next_renewal_date, status = r.status, owner_id = r.owner_id,
      notes = r.notes
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
revoke all on function public.save_contract(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.save_contract(uuid, jsonb, jsonb) to authenticated;

-- Alta guiada: cliente + contrataciones en una única transacción.
-- p_contracts: [{ "values": {...}, "deliverables": [...] }]
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
  return jsonb_build_object('id', v_id, 'code', v_code, 'contracts', jsonb_array_length(coalesce(p_contracts, '[]'::jsonb)));
end;
$$;
revoke all on function public.create_client_with_contracts(jsonb, jsonb) from public, anon;
grant execute on function public.create_client_with_contracts(jsonb, jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- Importación transaccional de un libro Excel ya validado en servidor.
-- Si cualquier fila falla, PostgreSQL revierte toda la operación.
-- p_mode = 'skip'   → los códigos existentes no se modifican.
-- p_mode = 'update' → los códigos existentes se actualizan (requiere confirmación explícita en la UI).
-- -----------------------------------------------------------------------------
create or replace function public.import_workbook(
  p_payload jsonb,
  p_mode text,
  p_file_name text default null,
  p_file_sha256 text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_batch uuid;
  v_id uuid;
  v_client_id uuid;
  v_category_id uuid;
  v_current_paid bigint;
  v_diff bigint;
  v_touched_contracts uuid[] := '{}';
  c record;
  k record;
  d record;
  p record;
  s jsonb := jsonb_build_object(
    'clients', jsonb_build_object('created', 0, 'updated', 0, 'skipped', 0),
    'contracts', jsonb_build_object('created', 0, 'updated', 0, 'skipped', 0),
    'deliverables', jsonb_build_object('created', 0),
    'payments', jsonb_build_object('created', 0, 'updated', 0, 'skipped', 0)
  );
begin
  if not public.is_member() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if p_mode not in ('skip', 'update') then
    raise exception 'Modo de importación no válido';
  end if;

  insert into public.import_batches (file_name, file_sha256, mode)
  values (left(p_file_name, 200), left(p_file_sha256, 64), p_mode)
  returning id into v_batch;

  -- CLIENTES ------------------------------------------------------------------
  for c in
    select * from jsonb_to_recordset(coalesce(p_payload -> 'clients', '[]'::jsonb)) as x(
      code text, trade_name text, legal_name text, tax_id text, contact_name text, email text,
      phone text, website text, address text, sector text, status public.client_status,
      owner_id uuid, joined_on date, notes text
    )
  loop
    select id into v_id from public.clients where code = c.code;
    if v_id is null then
      insert into public.clients (code, trade_name, legal_name, tax_id, contact_name, email, phone, website,
        address, sector, status, owner_id, joined_on, notes, import_batch_id)
      values (c.code, c.trade_name, c.legal_name, c.tax_id, c.contact_name, c.email, c.phone, c.website,
        c.address, c.sector, coalesce(c.status, 'lead'), c.owner_id, coalesce(c.joined_on, current_date), c.notes, v_batch);
      s := jsonb_set(s, '{clients,created}', to_jsonb((s #>> '{clients,created}')::int + 1));
    elsif p_mode = 'update' then
      update public.clients set
        trade_name = c.trade_name, legal_name = c.legal_name, tax_id = c.tax_id, contact_name = c.contact_name,
        email = c.email, phone = c.phone, website = c.website, address = c.address, sector = c.sector,
        status = coalesce(c.status, status), owner_id = c.owner_id, joined_on = coalesce(c.joined_on, joined_on),
        notes = c.notes
      where id = v_id;
      s := jsonb_set(s, '{clients,updated}', to_jsonb((s #>> '{clients,updated}')::int + 1));
    else
      s := jsonb_set(s, '{clients,skipped}', to_jsonb((s #>> '{clients,skipped}')::int + 1));
    end if;
  end loop;

  -- CONTRATACIONES ------------------------------------------------------------
  for k in
    select * from jsonb_to_recordset(coalesce(p_payload -> 'contracts', '[]'::jsonb)) as x(
      code text, client_code text, category_slug text, service_id uuid, name text, description text,
      amount_cents bigint, tax_rate numeric, currency text, billing_type public.billing_type,
      periodicity public.periodicity, interval_count int, interval_unit public.interval_unit,
      start_date date, end_date date, next_renewal_date date, status public.contract_status,
      owner_id uuid, notes text
    )
  loop
    select id into v_client_id from public.clients where code = k.client_code;
    if v_client_id is null then
      raise exception 'CONTRATACIONES %: el cliente % no existe', k.code, k.client_code;
    end if;
    select id into v_category_id from public.service_categories where slug = k.category_slug;
    if v_category_id is null then
      raise exception 'CONTRATACIONES %: categoría % no válida', k.code, k.category_slug;
    end if;

    select id into v_id from public.client_services where code = k.code;
    if v_id is null then
      insert into public.client_services (code, client_id, service_id, category_id, name, description, amount_cents,
        tax_rate, currency, billing_type, periodicity, interval_count, interval_unit, start_date, end_date,
        next_renewal_date, status, owner_id, notes, import_batch_id)
      values (k.code, v_client_id, k.service_id, v_category_id, k.name, k.description, k.amount_cents,
        k.tax_rate, coalesce(k.currency, 'EUR'), k.billing_type, k.periodicity, k.interval_count, k.interval_unit,
        coalesce(k.start_date, current_date), k.end_date, k.next_renewal_date, coalesce(k.status, 'active'),
        k.owner_id, k.notes, v_batch)
      returning id into v_id;
      v_touched_contracts := v_touched_contracts || v_id;
      s := jsonb_set(s, '{contracts,created}', to_jsonb((s #>> '{contracts,created}')::int + 1));
    elsif p_mode = 'update' then
      if (select client_id from public.client_services where id = v_id) <> v_client_id then
        raise exception 'CONTRATACIONES %: pertenece a otro cliente; no se puede reasignar mediante importación', k.code;
      end if;
      update public.client_services set
        service_id = k.service_id, category_id = v_category_id, name = k.name, description = k.description,
        amount_cents = k.amount_cents, tax_rate = k.tax_rate, currency = coalesce(k.currency, currency),
        billing_type = k.billing_type, periodicity = k.periodicity, interval_count = k.interval_count,
        interval_unit = k.interval_unit, start_date = coalesce(k.start_date, start_date), end_date = k.end_date,
        next_renewal_date = k.next_renewal_date, status = coalesce(k.status, status), owner_id = k.owner_id,
        notes = k.notes
      where id = v_id;
      v_touched_contracts := v_touched_contracts || v_id;
      s := jsonb_set(s, '{contracts,updated}', to_jsonb((s #>> '{contracts,updated}')::int + 1));
    else
      s := jsonb_set(s, '{contracts,skipped}', to_jsonb((s #>> '{contracts,skipped}')::int + 1));
    end if;
  end loop;

  -- PRESTACIONES (solo para contrataciones creadas o actualizadas en este lote) ---
  delete from public.client_service_deliverables
  where client_service_id = any (v_touched_contracts)
    and client_service_id in (
      select cs.id from public.client_services cs
      join jsonb_to_recordset(coalesce(p_payload -> 'deliverables', '[]'::jsonb)) as x(contract_code text) on x.contract_code = cs.code
    );

  for d in
    select * from jsonb_to_recordset(coalesce(p_payload -> 'deliverables', '[]'::jsonb)) as x(
      contract_code text, position int, title text, description text
    )
  loop
    select id into v_id from public.client_services where code = d.contract_code;
    if v_id is null then
      raise exception 'PRESTACIONES: la contratación % no existe', d.contract_code;
    end if;
    if v_id = any (v_touched_contracts) then
      insert into public.client_service_deliverables (client_service_id, position, title, description)
      values (v_id, coalesce(d.position, 0), d.title, d.description);
      s := jsonb_set(s, '{deliverables,created}', to_jsonb((s #>> '{deliverables,created}')::int + 1));
    end if;
  end loop;

  -- COBROS --------------------------------------------------------------------
  for p in
    select * from jsonb_to_recordset(coalesce(p_payload -> 'payments', '[]'::jsonb)) as x(
      code text, client_code text, contract_code text, concept text, amount_due_cents bigint,
      tax_rate numeric, currency text, due_date date, paid_on date, amount_paid_cents bigint,
      is_void boolean, invoice_ref text, notes text
    )
  loop
    select id into v_client_id from public.clients where code = p.client_code;
    if v_client_id is null then
      raise exception 'COBROS %: el cliente % no existe', p.code, p.client_code;
    end if;
    v_id := null;
    if p.contract_code is not null then
      select id into v_id from public.client_services where code = p.contract_code and client_id = v_client_id;
      if v_id is null then
        raise exception 'COBROS %: la contratación % no existe o no pertenece al cliente %', p.code, p.contract_code, p.client_code;
      end if;
    end if;

    if not exists (select 1 from public.payments where code = p.code) then
      insert into public.payments (code, client_id, client_service_id, concept, amount_due_cents, tax_rate, currency,
        due_date, voided_at, invoice_ref, notes, import_batch_id)
      values (p.code, v_client_id, v_id, p.concept, p.amount_due_cents, p.tax_rate, coalesce(p.currency, 'EUR'),
        p.due_date, case when p.is_void then now() end, p.invoice_ref, p.notes, v_batch);
      if coalesce(p.amount_paid_cents, 0) > 0 then
        insert into public.payment_transactions (payment_id, kind, amount_cents, paid_on, note, idempotency_key)
        select id, 'payment', p.amount_paid_cents, coalesce(p.paid_on, p.due_date), 'Importado desde Excel',
               'import:' || v_batch || ':' || p.code
        from public.payments where code = p.code;
      end if;
      s := jsonb_set(s, '{payments,created}', to_jsonb((s #>> '{payments,created}')::int + 1));
    elsif p_mode = 'update' then
      if (select client_id from public.payments where code = p.code) <> v_client_id then
        raise exception 'COBROS %: pertenece a otro cliente; no se puede reasignar mediante importación', p.code;
      end if;
      update public.payments set
        client_service_id = v_id, concept = p.concept, tax_rate = p.tax_rate,
        currency = coalesce(p.currency, currency), due_date = p.due_date, invoice_ref = p.invoice_ref, notes = p.notes,
        voided_at = case when p.is_void then coalesce(voided_at, now()) else null end
      where code = p.code
      returning amount_paid_cents into v_current_paid;

      v_diff := coalesce(p.amount_paid_cents, 0) - v_current_paid;
      -- Si el importe previsto baja, primero ajustar lo cobrado para no violar la restricción.
      if v_diff < 0 then
        insert into public.payment_transactions (payment_id, kind, amount_cents, paid_on, note, idempotency_key)
        select id, 'adjustment', v_diff, coalesce(p.paid_on, current_date), 'Ajuste por importación',
               'import:' || v_batch || ':' || p.code
        from public.payments where code = p.code;
      end if;
      update public.payments set amount_due_cents = p.amount_due_cents where code = p.code;
      if v_diff > 0 then
        insert into public.payment_transactions (payment_id, kind, amount_cents, paid_on, note, idempotency_key)
        select id, 'payment', v_diff, coalesce(p.paid_on, p.due_date), 'Importado desde Excel',
               'import:' || v_batch || ':' || p.code
        from public.payments where code = p.code;
      end if;
      s := jsonb_set(s, '{payments,updated}', to_jsonb((s #>> '{payments,updated}')::int + 1));
    else
      s := jsonb_set(s, '{payments,skipped}', to_jsonb((s #>> '{payments,skipped}')::int + 1));
    end if;
  end loop;

  update public.import_batches set summary = s where id = v_batch;
  return s || jsonb_build_object('batch_id', v_batch);
end;
$$;
revoke all on function public.import_workbook(jsonb, text, text, text) from public, anon;
grant execute on function public.import_workbook(jsonb, text, text, text) to authenticated;

-- Las funciones de cálculo puras pueden ejecutarse por miembros (no exponen datos).
revoke all on function public.mrr_cents(public.billing_type, public.periodicity, int, public.interval_unit, bigint) from anon;
revoke all on function public.payment_status_of(bigint, bigint, date, timestamptz, date) from anon;
revoke all on function public.changed_columns(jsonb, jsonb) from anon;

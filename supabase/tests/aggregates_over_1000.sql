-- Prueba de los agregados con más de 1.000 registros (límite por defecto de la API).
-- Se ejecuta dentro de una transacción que se deshace: no deja datos.
-- Se ejecuta como un miembro (rol authenticated + JWT simulado) para que RLS se aplique.
-- Uso: psql "$SUPABASE_DB_URL" -f supabase/tests/aggregates_over_1000.sql  (o el SQL editor)
begin;

-- Miembro con el que se ejecuta (el primer admin activo).
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from public.profiles where role = 'admin' and is_active order by created_at limit 1), 'role', 'authenticated')::text,
  true);
set local role authenticated;

do $$
declare
  v_client uuid;
  v_contract uuid;
  v_cat uuid := (select id from public.service_categories where slug = 'seo');
  t jsonb;
  d jsonb;
  e_due bigint; e_paid bigint; e_out bigint; e_overdue bigint; e_count bigint;
  e_collected bigint;
begin
  insert into public.clients (code, trade_name, status) values ('QA-AGG-1', 'QA agregados', 'active') returning id into v_client;
  insert into public.client_services (code, client_id, category_id, name, amount_cents, billing_type, periodicity, start_date, status)
    values ('QA-AGG-C1', v_client, v_cat, 'QA SEO', 45000, 'recurring', 'monthly', current_date - 400, 'active')
    returning id into v_contract;

  -- 1.500 cobros repartidos en 15 meses, 1.200 movimientos (cobros totales o parciales).
  insert into public.payments (code, client_id, client_service_id, concept, amount_due_cents, due_date)
  select 'QA-AGG-P' || g, v_client, v_contract, 'QA cuota ' || g, 10000 + g, current_date - 420 + (g % 450)
  from generate_series(1, 1500) g;
  insert into public.payment_transactions (payment_id, kind, amount_cents, paid_on, idempotency_key)
  select p.id, 'payment', case when n % 3 = 0 then p.amount_due_cents / 2 else p.amount_due_cents end, p.due_date, 'qa-agg-' || n
  from (select id, amount_due_cents, due_date, row_number() over (order by code) n from public.payments where code like 'QA-AGG-P%') p
  where p.n <= 1200;

  -- Esperado, calculado directamente sobre la vista.
  select coalesce(sum(amount_due_cents) filter (where status <> 'void'), 0),
         coalesce(sum(amount_paid_cents) filter (where status <> 'void'), 0),
         coalesce(sum(amount_outstanding_cents) filter (where status <> 'void'), 0),
         coalesce(sum(amount_outstanding_cents) filter (where status = 'overdue'), 0),
         count(*)
    into e_due, e_paid, e_out, e_overdue, e_count
  from public.payments_view where client_id = v_client;

  t := public.payment_totals(null, v_client, null, null, null);
  if e_count < 1001 then raise exception 'La prueba necesita más de 1.000 cobros (hay %)', e_count; end if;
  if (t->>'count')::bigint <> e_count or (t->>'due')::bigint <> e_due or (t->>'paid')::bigint <> e_paid
     or (t->>'outstanding')::bigint <> e_out or (t->>'overdue')::bigint <> e_overdue then
    raise exception 'payment_totals no cuadra: % frente a due=% paid=% out=% overdue=% count=%', t, e_due, e_paid, e_out, e_overdue, e_count;
  end if;

  -- Dashboard: cobrado en los últimos 12 meses = suma de la serie.
  d := public.dashboard_summary(date_trunc('month', current_date)::date, (date_trunc('month', current_date) + interval '1 month - 1 day')::date,
                                (date_trunc('month', current_date) - interval '11 months')::date, current_date);
  select coalesce(sum(amount_cents), 0) into e_collected from public.payment_transactions
  where paid_on >= date_trunc('month', current_date) - interval '11 months'
    and paid_on < date_trunc('month', current_date) + interval '1 month';
  if (select sum((x->>'collected')::bigint) from jsonb_array_elements(d->'series') x) <> e_collected then
    raise exception 'dashboard_summary: la serie no cuadra con % movimientos', e_collected;
  end if;
  if ((d->'pending'->>'overdue')::bigint + (d->'pending'->>'upcoming')::bigint)
     <> (select coalesce(sum(amount_outstanding_cents), 0) from public.payments_view where status <> 'void') then
    raise exception 'dashboard_summary: pendiente no cuadra';
  end if;

  raise notice 'OK: % cobros, totales %, serie de % meses', e_count, t, jsonb_array_length(d->'series');
end;
$$;

-- Resultado visible para el SQL editor / MCP.
select 'aggregates_over_1000: OK' as resultado;

rollback;

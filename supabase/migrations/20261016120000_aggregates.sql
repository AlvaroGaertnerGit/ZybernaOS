-- =============================================================================
-- Agregados en SQL para el dashboard y los totales de cobros.
--
-- Motivo: la API de Supabase devuelve como máximo 1.000 filas por consulta (Max rows).
-- Sumar en JavaScript filas descargadas daba totales incompletos a partir de ese
-- volumen y gastaba CPU en el Worker. Aquí la base de datos agrega y devuelve una fila.
--
-- SECURITY INVOKER: RLS se aplica igual que en las consultas normales; además se
-- comprueba is_member() como en el resto de RPC.
-- =============================================================================

-- Totales del listado de cobros con los mismos filtros que la tabla (/cobros).
create or replace function public.payment_totals(
  p_statuses text[] default null,
  p_client uuid default null,
  p_from date default null,
  p_to date default null,
  p_q text default null
)
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
    'due', coalesce(sum(p.amount_due_cents) filter (where p.status <> 'void'), 0),
    'paid', coalesce(sum(p.amount_paid_cents) filter (where p.status <> 'void'), 0),
    'outstanding', coalesce(sum(p.amount_outstanding_cents) filter (where p.status <> 'void'), 0),
    'overdue', coalesce(sum(p.amount_outstanding_cents) filter (where p.status = 'overdue'), 0),
    'count', count(*)
  )
  into v
  from public.payments_view p
  where (p_statuses is null or cardinality(p_statuses) = 0 or p.status::text = any (p_statuses))
    and (p_client is null or p.client_id = p_client)
    and (p_from is null or p.due_date >= p_from)
    and (p_to is null or p.due_date <= p_to)
    and (
      p_q is null or p_q = ''
      or p.concept ilike '%' || p_q || '%'
      or p.client_name ilike '%' || p_q || '%'
      or p.code ilike '%' || p_q || '%'
      or p.invoice_ref ilike '%' || p_q || '%'
    );
  return v;
end;
$$;
revoke all on function public.payment_totals(text[], uuid, date, date, text) from public, anon;
grant execute on function public.payment_totals(text[], uuid, date, date, text) to authenticated;

-- Métricas del dashboard. Mismas definiciones que src/lib/calculations/dashboard.ts:
--  cobrado = movimientos con paid_on en el periodo; previsto = cobros no anulados con
--  vencimiento en el periodo; pendiente = importe no cobrado de cobros no anulados
--  (vencido si due_date < hoy); MRR = suma de client_services.mrr_cents activas.
create or replace function public.dashboard_summary(
  p_period_start date,
  p_period_end date,
  p_series_start date,
  p_today date
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_collected bigint;
  v_expected bigint;
  v_pending jsonb;
  v_series jsonb;
  v_categories jsonb;
  v_active int;
  v_mrr bigint;
begin
  if not public.is_member() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  select coalesce(sum(t.amount_cents), 0) into v_collected
  from public.payment_transactions t
  where t.paid_on between p_period_start and p_period_end;

  select coalesce(sum(p.amount_due_cents), 0) into v_expected
  from public.payments p
  where p.voided_at is null and p.due_date between p_period_start and p_period_end;

  select jsonb_build_object(
    'overdue', coalesce(sum(o) filter (where due_date < p_today), 0),
    'upcoming', coalesce(sum(o) filter (where due_date >= p_today), 0),
    'overdueCount', count(*) filter (where due_date < p_today),
    'upcomingCount', count(*) filter (where due_date >= p_today)
  ) into v_pending
  from (
    select p.due_date, p.amount_due_cents - p.amount_paid_cents as o
    from public.payments p
    where p.voided_at is null and p.amount_due_cents > p.amount_paid_cents
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object('month', m.month, 'collected', m.collected, 'expected', m.expected) order by m.month), '[]'::jsonb)
  into v_series
  from (
    select
      to_char(g.month, 'YYYY-MM-DD') as month,
      coalesce((select sum(t.amount_cents) from public.payment_transactions t
                where t.paid_on >= g.month and t.paid_on < g.month + interval '1 month'), 0) as collected,
      coalesce((select sum(p.amount_due_cents) from public.payments p
                where p.voided_at is null and p.due_date >= g.month and p.due_date < g.month + interval '1 month'), 0) as expected
    from generate_series(date_trunc('month', p_series_start)::date, date_trunc('month', p_today)::date, interval '1 month') as g(month)
  ) m;

  select count(*), coalesce(sum(cs.mrr_cents), 0) into v_active, v_mrr
  from public.client_services cs
  where cs.status = 'active';

  select coalesce(jsonb_agg(jsonb_build_object('category', c.name, 'count', c.n, 'mrr', c.mrr)), '[]'::jsonb)
  into v_categories
  from (
    select cat.name, count(*) as n, coalesce(sum(cs.mrr_cents), 0) as mrr
    from public.client_services cs
    join public.service_categories cat on cat.id = cs.category_id
    where cs.status = 'active'
    group by cat.name
  ) c;

  return jsonb_build_object(
    'collectedInPeriod', v_collected,
    'expectedInPeriod', v_expected,
    'pending', v_pending,
    'series', v_series,
    'activeContracts', v_active,
    'mrr', v_mrr,
    'categories', v_categories
  );
end;
$$;
revoke all on function public.dashboard_summary(date, date, date, date) from public, anon;
grant execute on function public.dashboard_summary(date, date, date, date) to authenticated;

-- Avisos del linter de Supabase ---------------------------------------------------

-- Política evaluada una vez por consulta, no por fila.
drop policy if exists "profiles: update self" on public.profiles;
create policy "profiles: update self" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) and public.is_member())
  with check (id = (select auth.uid()));

-- Función de evento creada por Supabase (activa RLS en tablas nuevas): no debe ser
-- invocable por la API. El trigger de evento sigue funcionando.
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'rls_auto_enable') then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end;
$$;

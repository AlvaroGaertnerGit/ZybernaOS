-- Pruebas de las reglas de combinación del catálogo, la copia de condiciones y el
-- componente variable. Se ejecuta como miembro (RLS aplicada) y TODO se deshace:
-- el bloque termina siempre con una excepción «TEST_OK» (o con el primer fallo).
-- Uso: SQL editor / psql. Resultado esperado: ERROR: TEST_OK (n comprobaciones)
do $$
declare
  admin uuid := (select id from public.profiles where role = 'admin' and is_active order by created_at limit 1);
  seo uuid := (select id from public.service_categories where slug = 'seo');
  k jsonb := (select jsonb_object_agg(key, id) from public.service_catalog);
  v_client uuid; v_c1 uuid; v_c2 uuid; v_period uuid; v_payment uuid;
  r record; n int := 0; msg text;
  -- Contratación mínima a partir de una key del catálogo.
  base jsonb := jsonb_build_object('category_id', seo, 'billing_type', 'recurring', 'periodicity', 'monthly',
    'amount_cents', 10000, 'status', 'active', 'start_date', current_date);
begin
  perform set_config('request.jwt.claims', json_build_object('sub', admin, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  -- 1. Plan + puesta en marcha (en cualquier orden) + otros servicios compatibles: válido.
  select (public.create_client_with_contracts(jsonb_build_object('trade_name', 'QA reglas', 'code', 'QA-RULES-1'),
    jsonb_build_array(
      jsonb_build_object('values', base || jsonb_build_object('name', 'Puesta en marcha', 'service_id', k->>'seo_puesta_en_marcha', 'billing_type', 'one_time', 'periodicity', null, 'amount_cents', 14900)),
      jsonb_build_object('values', base || jsonb_build_object('name', 'SEO Local', 'service_id', k->>'seo_local', 'amount_cents', 19900)),
      jsonb_build_object('values', base || jsonb_build_object('name', 'Redes', 'service_id', k->>'redes_sociales')),
      jsonb_build_object('values', base || jsonb_build_object('name', 'Mantenimiento', 'service_id', k->>'mantenimiento_web')),
      jsonb_build_object('values', base || jsonb_build_object('name', 'Web', 'service_id', k->>'web_corporativa', 'billing_type', 'one_time', 'periodicity', null))
    )) ->> 'id')::uuid into v_client;
  n := n + 1;

  -- 2. Copia de condiciones: tarifa de catálogo guardada, precio acordado propio.
  select id, amount_cents, list_price_cents, catalog_snapshot into r from public.client_services
  where client_id = v_client and service_id = (k->>'seo_local')::uuid;
  v_c1 := r.id;
  if r.amount_cents <> 19900 or r.list_price_cents <> 24900 or r.catalog_snapshot->>'key' <> 'seo_local' then
    raise exception 'FALLO copia de condiciones: %', row_to_json(r);
  end if;
  n := n + 1;

  -- 3. Cambiar la tarifa del catálogo no altera el contrato.
  update public.service_catalog set default_price_cents = 27900 where key = 'seo_local';
  update public.client_services set notes = 'x' where id = v_c1;
  select amount_cents, list_price_cents into r from public.client_services where id = v_c1;
  if r.amount_cents <> 19900 or r.list_price_cents <> 24900 then raise exception 'FALLO histórico alterado'; end if;
  n := n + 1;

  -- 4. Segundo plan SEO en el mismo proyecto: rechazado (incluso por inserción directa).
  begin
    set constraints all deferred;
    insert into public.client_services (client_id, service_id, category_id, name, amount_cents, billing_type, periodicity)
    values (v_client, (k->>'seo_esencial')::uuid, seo, 'SEO Esencial', 12900, 'recurring', 'monthly');
    set constraints all immediate;
    raise exception 'FALLO: se aceptaron dos planes SEO';
  exception when others then
    if sqlerrm not like '%son alternativas%' then raise; end if;
  end;
  n := n + 1;

  -- 5. El mismo plan en otro proyecto (otra web) sí es válido.
  set constraints all deferred;
  insert into public.client_services (client_id, service_id, category_id, name, amount_cents, billing_type, periodicity, project)
  values (v_client, (k->>'seo_esencial')::uuid, seo, 'SEO Esencial', 12900, 'recurring', 'monthly', 'Segunda web');
  set constraints all immediate;
  n := n + 1;

  -- 6. Cambiar de plan editando la contratación: válido y renueva la tarifa de referencia.
  set constraints all deferred;
  update public.client_services set service_id = (k->>'seo_local_plus')::uuid, name = 'SEO Local Plus' where id = v_c1;
  set constraints all immediate;
  select list_price_cents into r from public.client_services where id = v_c1;
  if r.list_price_cents <> 34900 then raise exception 'FALLO tarifa tras cambio de plan: %', r.list_price_cents; end if;
  n := n + 1;

  -- 7. SEO + GEO excluye GEO mensual en el mismo proyecto.
  begin
    set constraints all deferred;
    update public.client_services set service_id = (k->>'seo_geo')::uuid where id = v_c1;
    insert into public.client_services (client_id, service_id, category_id, name, amount_cents, billing_type, periodicity)
    values (v_client, (k->>'geo_mensual')::uuid, seo, 'GEO mensual', 10000, 'recurring', 'monthly');
    set constraints all immediate;
    raise exception 'FALLO: SEO + GEO con GEO mensual';
  exception when others then
    if sqlerrm not like '%no es compatible%' then raise; end if;
  end;
  n := n + 1;

  -- 8. Puesta en marcha sin plan: rechazada.
  begin
    perform public.create_client_with_contracts(jsonb_build_object('trade_name', 'QA sin plan'),
      jsonb_build_array(jsonb_build_object('values', base || jsonb_build_object('name', 'PM', 'service_id', k->>'seo_puesta_en_marcha', 'billing_type', 'one_time', 'periodicity', null))));
    raise exception 'FALLO: puesta en marcha sin plan';
  exception when others then
    if sqlerrm not like '%requiere%' then raise; end if;
  end;
  n := n + 1;

  -- 9. Importación con dos planes para el mismo cliente: rechazada en bloque.
  begin
    perform public.import_workbook(jsonb_build_object(
      'clients', jsonb_build_array(jsonb_build_object('code', 'QA-IMP-1', 'trade_name', 'QA imp')),
      'contracts', jsonb_build_array(
        jsonb_build_object('code', 'QA-IMP-C1', 'client_code', 'QA-IMP-1', 'category_slug', 'seo', 'service_id', k->>'seo_esencial', 'name', 'A', 'amount_cents', 1, 'billing_type', 'recurring', 'periodicity', 'monthly'),
        jsonb_build_object('code', 'QA-IMP-C2', 'client_code', 'QA-IMP-1', 'category_slug', 'seo', 'service_id', k->>'seo_local', 'name', 'B', 'amount_cents', 1, 'billing_type', 'recurring', 'periodicity', 'monthly'))),
      'skip');
    raise exception 'FALLO: importación con dos planes';
  exception when others then
    if sqlerrm not like '%son alternativas%' then raise; end if;
  end;
  if exists (select 1 from public.clients where code = 'QA-IMP-1') then raise exception 'FALLO: importación parcial'; end if;
  n := n + 1;

  -- 10. Componente variable: pendiente sin base; 8 % al informar la base; cobro solo a petición.
  update public.client_services set variable_rate = 8, variable_basis = 'profit' where id = v_c1;
  insert into public.contract_variable_periods (client_service_id, period_start, period_end, rate, basis)
  values (v_c1, date '2026-10-01', date '2026-10-31', 8, 'profit') returning id into v_period;
  if (select result_cents from public.contract_variable_periods where id = v_period) is not null then raise exception 'FALLO variable sin base'; end if;
  if exists (select 1 from public.payments where client_service_id = v_c1) then raise exception 'FALLO cobro automático'; end if;
  update public.contract_variable_periods set base_amount_cents = 1234567 where id = v_period;
  if (select result_cents from public.contract_variable_periods where id = v_period) <> 98765 then raise exception 'FALLO cálculo variable'; end if;
  v_payment := public.create_variable_payment(v_period, current_date);
  if (select amount_due_cents from public.payments where id = v_payment) <> 98765 then raise exception 'FALLO cobro variable'; end if;
  if (select mrr_cents from public.client_services where id = v_c1) <> 19900 then raise exception 'FALLO: el variable no debe sumar al MRR'; end if;
  n := n + 1;

  -- 11. RLS: un usuario autenticado sin perfil autorizado no ve nada.
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  if exists (select 1 from public.contract_variable_periods) or exists (select 1 from public.service_catalog_modalities)
     or exists (select 1 from public.client_services) then
    raise exception 'FALLO RLS';
  end if;
  n := n + 1;

  raise exception 'TEST_OK (% comprobaciones)', n;
end;
$$;

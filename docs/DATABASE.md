# Base de datos

PostgreSQL en Supabase. Migraciones en `supabase/migrations/` (aplicar en orden):

1. `20261016090000_core_schema.sql` — tipos, tablas, índices, vistas, triggers, RLS y catálogo inicial.
2. `20261016090100_rpc_functions.sql` — funciones transaccionales.
3. `20261016120000_aggregates.sql` — agregados en SQL (`payment_totals`, `dashboard_summary`) y correcciones del linter.
4. `20261019090000_catalog_rules.sql` — catálogo con identificador estable, reglas de combinación y modalidades; proyecto, copia de condiciones y componente variable en contrataciones.
5. `20261019090100_import_rules.sql` — importación con proyecto y variable; reglas validadas sobre el lote.
6. `20261019090200_catalog_seo_plans.sql` — tarifas y prestaciones de la propuesta SEO/GEO (15/10/2026).

En producción (19/10/2026) las migraciones 4–6 se aplicaron por bloques (`catalog_rules_1_keys` … `catalog_seo_plans` en el historial de Supabase) porque el conector MCP rechaza consultas grandes; el resultado es el mismo SQL de estos archivos.

Pruebas de reglas en la BD (transacción que se deshace, ejecutada como miembro): `supabase/tests/catalog_rules.sql` → debe terminar con `TEST_OK`.

Prueba de agregados con más de 1.000 registros (transacción que se deshace, ejecutada como miembro para aplicar RLS): `supabase/tests/aggregates_over_1000.sql`.

## Tablas

| Tabla | Propósito |
|---|---|
| `authorized_emails` | Lista blanca de miembros. Sin acceso desde la API (solo administración de BD). |
| `profiles` | Perfil 1:1 con `auth.users`; rol `admin`/`member`, `is_active`. Se crea por trigger solo si el email está autorizado. |
| `agency_settings` | Fila única con datos de la agencia y moneda por defecto. |
| `service_categories` | Categorías del catálogo (redes, SEO, GEO, web, mantenimiento, otros). |
| `service_catalog`, `service_catalog_deliverables` | Tarifas y prestaciones de referencia. `key`: identificador estable (generado al crear, no editable). Reglas: `exclusive_group` (alternativas), `requires_any` (`key` o `group:<grupo>`), `excludes` (keys). |
| `service_catalog_modalities` | Otras modalidades de precio de un servicio (trimestral, anual, pago único…) con su propia tarifa. La principal es la del propio servicio. |
| `contract_variable_periods` | Componente variable por periodo: % × base (beneficios, ingresos o facturación). Sin base → pendiente. `result_cents` generado. El cobro se crea solo a petición (`create_variable_payment`). |
| `clients` | Clientes. Código `CLI-0001` automático si no se indica. Se archivan (`archived_at`), no se borran. |
| `client_notes` | Notas internas. |
| `client_services` | Contrataciones: precio acordado en céntimos, impuesto opcional, tipo de cobro, periodicidad (o regla personalizada `interval_count` + `interval_unit`), fechas, estado, `project` (web o proyecto), componente variable (`variable_rate` + `variable_basis`). `mrr_cents` es una columna generada (solo la cuota fija). `list_price_cents` y `catalog_snapshot`: copia de la tarifa del catálogo al contratar, mantenida por trigger (no editable; no cambia si cambia el catálogo). |
| `client_service_deliverables` | Prestaciones contratadas: **copia** independiente del catálogo. |
| `payments` | Cobros previstos. `amount_paid_cents` y `last_paid_on` se mantienen por trigger. Único por `(client_service_id, period_start)` para la generación idempotente. |
| `payment_transactions` | Movimientos de cobro (pago o ajuste). `idempotency_key` única evita duplicados por doble envío. |
| `activity_log` | Auditoría escrita solo por triggers (cliente creado/editado/archivado, contratación creada/modificada, cobro previsto/registrado/anulado). Guarda los nombres de columnas cambiadas, nunca valores sensibles. |
| `import_batches` | Historial de importaciones (nombre saneado, SHA-256, modo, resumen). |

Vistas (`security_invoker = true`, respetan RLS): `clients_view` (servicios activos, MRR, responsable), `client_services_view`, `payments_view` (estado calculado y pendiente).

## Estado de un cobro

`payment_status_of()`: anulado → cobrado (pagado ≥ previsto) → vencido (vencimiento < hoy) → parcial → pendiente. Igual que `paymentStatus()` en TS.

## Seguridad (RLS)

- `public.is_member()` (SECURITY DEFINER) comprueba que `auth.uid()` tiene un perfil activo.
- Todas las tablas de negocio: `select/insert/update` solo si `is_member()`. `delete` solo en tablas donde tiene sentido (notas, prestaciones, catálogo, movimientos). Clientes, contrataciones y cobros no se borran.
- Un usuario autenticado de Supabase **sin** perfil autorizado no ve ni modifica nada.
- `anon` no tiene permisos sobre ninguna tabla.
- Los miembros no pueden cambiar su rol, email ni estado (`protect_profile_columns`).

## Funciones RPC (SECURITY INVOKER)

| Función | Uso |
|---|---|
| `save_contract(id, values, deliverables)` | Alta/edición atómica de contratación + prestaciones |
| `create_client_with_contracts(client, contracts)` | Alta guiada en una transacción |
| `replace_contract_deliverables`, `replace_catalog_deliverables` | Reordenar/editar/eliminar prestaciones |
| `create_scheduled_payments(contract, items)` | Generación idempotente (`on conflict do nothing`), máx. 24 periodos por llamada |
| `import_workbook(payload, mode, file_name, sha256)` | Importación Excel completa en una transacción |
| `payment_totals(statuses, client, from, to, q)` | Totales del listado de cobros (mismos filtros que la tabla) |
| `dashboard_summary(period_start, period_end, series_start, today)` | Cobrado, previsto, pendiente, serie de 12 meses y MRR por categoría |

**Límite de 1.000 filas.** La API de Supabase devuelve como máximo 1.000 filas por petición (*Max rows*). Los totales se agregan en SQL (las dos RPC anteriores) y las listas largas (exportación, contexto de importación, selectores) se piden por páginas con `fetchAll` (`src/lib/fetch-all.ts`). Nada se suma en JavaScript sobre filas descargadas.

## Aplicar migraciones

- **MCP de Supabase** (configurado en `.mcp.json`, limitado al proyecto): `apply_migration` con cada archivo.
- **CLI**: `npx supabase login && npx supabase link --project-ref <ref> && npx supabase db push`.
- **SQL Editor**: pegar y ejecutar cada archivo en orden.

Tras aplicar, autoriza a los socios con `supabase/authorize-members.sql`.

## Regenerar tipos

`src/types/database.ts` está escrito a mano siguiendo el formato de Supabase. Puede regenerarse con
`npx supabase gen types typescript --project-id <ref> > src/types/database.ts` (revisa los alias exportados que usa el código).

## Reglas de combinación del catálogo

Una sola semántica en tres sitios: `src/lib/catalog/rules.ts` (formularios e importación), las acciones de servidor (comprobación previa con mensaje claro) y el trigger diferido `client_services_rules` → `check_contract_rules()` (garantía final para cualquier vía: formulario, alta guiada, Excel o una petición directa a la API).

- Ámbito: contrataciones **vivas** (borrador, activa, pausada) del mismo cliente y **proyecto** (`lower(trim(project))`). Finalizadas y canceladas no cuentan.
- Alternativas (`exclusive_group`): solo una. Cambiar de plan = editar la contratación o finalizar la anterior.
- Incompatibles (`excludes`): en ambos sentidos.
- Dependencias (`requires_any`): se exigen al crear, al cambiar de servicio o al reactivar; no invalidan el histórico.
- El trigger es `deferrable initially deferred`: un alta con varios servicios se valida como conjunto al final (`set constraints all immediate` en `create_client_with_contracts` e `import_workbook`).

Reglas configuradas (19/10/2026, según la propuesta comercial SEO/GEO):

| Regla | Servicios | Motivo documentado |
|---|---|---|
| Alternativas `seo_plan` | SEO Esencial, SEO Local, SEO Local Plus, SEO + GEO, SEO mensual (a medida) | Niveles de la misma contratación SEO |
| Requiere un plan `seo_plan` | Puesta en marcha SEO | «Una sola vez, con cualquiera de los planes» |
| Incompatibles | SEO + GEO ↔ GEO mensual | SEO + GEO ya incluye el trabajo GEO mensual |

Todo lo demás es combinable (p. ej. SEO + desarrollo web + mantenimiento + redes). No hay dependencias entre SEO y desarrollo web.

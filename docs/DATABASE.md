# Base de datos

PostgreSQL en Supabase. Migraciones en `supabase/migrations/` (aplicar en orden):

1. `20261016090000_core_schema.sql` — tipos, tablas, índices, vistas, triggers, RLS y catálogo inicial.
2. `20261016090100_rpc_functions.sql` — funciones transaccionales.

## Tablas

| Tabla | Propósito |
|---|---|
| `authorized_emails` | Lista blanca de miembros. Sin acceso desde la API (solo administración de BD). |
| `profiles` | Perfil 1:1 con `auth.users`; rol `admin`/`member`, `is_active`. Se crea por trigger solo si el email está autorizado. |
| `agency_settings` | Fila única con datos de la agencia y moneda por defecto. |
| `service_categories` | Categorías del catálogo (redes, SEO, GEO, web, mantenimiento, otros). |
| `service_catalog`, `service_catalog_deliverables` | Plantillas editables de servicios y sus prestaciones. |
| `clients` | Clientes. Código `CLI-0001` automático si no se indica. Se archivan (`archived_at`), no se borran. |
| `client_notes` | Notas internas. |
| `client_services` | Contrataciones: precio en céntimos, impuesto opcional, tipo de cobro, periodicidad (o regla personalizada `interval_count` + `interval_unit`), fechas, estado. `mrr_cents` es una columna generada. |
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

## Aplicar migraciones

- **MCP de Supabase** (configurado en `.mcp.json`, limitado al proyecto): `apply_migration` con cada archivo.
- **CLI**: `npx supabase login && npx supabase link --project-ref <ref> && npx supabase db push`.
- **SQL Editor**: pegar y ejecutar cada archivo en orden.

Tras aplicar, autoriza a los socios con `supabase/authorize-members.sql`.

## Regenerar tipos

`src/types/database.ts` está escrito a mano siguiendo el formato de Supabase. Puede regenerarse con
`npx supabase gen types typescript --project-id <ref> > src/types/database.ts` (revisa los alias exportados que usa el código).

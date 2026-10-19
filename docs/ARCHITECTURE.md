# Arquitectura

## Principios

- **Server Components por defecto.** Las páginas leen datos en servidor con la sesión del usuario. Solo son Client Components las piezas interactivas: formularios, tablas, menús, diálogos y gráficos.
- **Estado en la URL.** Filtros, búsqueda, ordenación, paginación, pestañas y periodo del dashboard viven en `searchParams`: son compartibles y se resuelven en servidor.
- **Autorización en tres capas.** (1) `middleware.ts` (runtime edge) refresca la sesión y redirige sin sesión; (2) `requireMember()` / `assertMember()` en cada página, Server Action y Route Handler; (3) RLS en PostgreSQL. Las dos primeras son UX y defensa en profundidad; la garantía real es RLS.
- **Dinero en céntimos enteros** (`bigint` en BD, `number` entero en TS). Nunca se opera con coma flotante sobre importes; el texto se convierte a céntimos por manipulación de cadenas (`parseMoneyToCents`).
- **Operaciones compuestas transaccionales** mediante funciones RPC de PostgreSQL: alta guiada (cliente + contrataciones + prestaciones), guardado de contratación con prestaciones, generación de cobros e importación Excel.

## Estructura

```
src/
  app/
    (auth)/            login, recuperar, recuperar/nueva
    (app)/             rutas privadas con layout (sidebar + cabecera)
      dashboard/ clientes/ servicios/ contrataciones/ cobros/ datos/ configuracion/
    api/excel/         template, export, import (Route Handlers, runtime Node)
    auth/callback/     intercambio de código / token_hash de Supabase
  middleware.ts        refresco de sesión y redirecciones (runtime edge, ver CLOUDFLARE.md)
  components/
    ui/                primitivas (shadcn personalizadas + Panel, Field, StatusBadge, Stat, NativeSelect…)
    layout/ brand/ data-table/ forms/
    clients/ contracts/ payments/ services/ dashboard/ excel/ settings/ auth/
  lib/
    calculations/      lógica de negocio pura y probada (money, mrr, billing, payments, dashboard, dates)
    validations/       esquemas Zod compartidos por formularios y servidor
    excel/             esquema del libro, parser (sin fórmulas), validador puro, generador
    supabase/          clientes navegador/servidor/proxy (@supabase/ssr)
    domain.ts          enums, etiquetas y valores de Excel
  server/
    auth.ts            getMember / requireMember / assertMember
    queries/           acceso a datos centralizado (solo servidor)
    actions/           Server Actions (validación Zod + RLS)
  config/              marca y navegación
  types/database.ts    tipos del esquema
supabase/migrations/   SQL versionado
tests/unit · tests/e2e
```

## Flujo de una mutación

1. El formulario (React Hook Form + `zodResolver`) valida en cliente con el mismo esquema Zod.
2. Llama a una Server Action con los valores de entrada.
3. `memberAction()` verifica la membresía, vuelve a validar con Zod y ejecuta la operación con el cliente de Supabase ligado a la sesión (RLS aplicada).
4. Los errores de PostgreSQL se traducen a mensajes comprensibles (`dbErrorMessage`) y los de validación se vuelcan en los campos.
5. `revalidatePath` refresca las vistas afectadas.

## Rendimiento

- Recharts se carga con `next/dynamic` (`ssr: false`) en un chunk separado, solo en el dashboard.
- ExcelJS se ejecuta en el navegador y se carga con `import()` dinámico solo al descargar o importar un Excel. El servidor intercambia JSON (ver EXCEL.md), así el Worker cabe en Workers Free.
- Las tablas piden únicamente la página visible (`range` + `count: exact`).
- Selects nativos en formularios (ligeros y cómodos en móvil); sin librerías de animación (CSS + `tw-animate-css`), con `prefers-reduced-motion`.
- Despliegue: Cloudflare Workers mediante OpenNext (ver [CLOUDFLARE.md](CLOUDFLARE.md)).
- `cacheComponents` está desactivado de forma deliberada: toda la app depende de la sesión y se renderiza dinámicamente.

## Cálculos

| Magnitud | Definición | Origen |
|---|---|---|
| MRR | Contrataciones **activas** y **recurrentes**, normalizadas a mes (trimestral ÷3, semestral ÷6, anual ÷12; personalizada: meses ÷N, años ÷12N, semanas ×52/12N, días ×365/12N), redondeo half-up al céntimo por contratación | `mrr.ts` y la columna generada `client_services.mrr_cents` (misma fórmula) |
| ARR | MRR × 12 | |
| Cobrado en el periodo | Suma de movimientos (`payment_transactions`) con `paid_on` en el periodo | |
| Facturación prevista | Suma de cobros previstos no anulados con vencimiento en el periodo | |
| Pendiente | Importe previsto − cobrado de cobros no anulados (vencido / por vencer) | |

Los pagos únicos no computan en MRR. El impuesto nunca se aplica automáticamente.

**Componente variable** (p. ej. % de beneficios): no forma parte del MRR ni de lo cobrado hasta que se crea su cobro previsto (a petición) y se registra el pago. El dashboard muestra aparte lo determinado y lo pendiente del mes (`variable_summary`). Beneficios, ingresos y facturación son bases distintas y se guardan como tales.

**Resumen económico** (`src/lib/calculations/summary.ts`): agrupa por periodicidad (pago único, mensual, trimestral…) sin sumar importes de periodicidades distintas; muestra descuento/suplemento frente a la tarifa del catálogo e impuestos solo si se han indicado.

## Catálogo y contratación

- El catálogo es la fuente de las tarifas: al elegir un servicio se cargan precio, periodicidad/modalidad y prestaciones; todo es editable para ese cliente sin tocar el catálogo.
- Al guardar, la BD copia la tarifa de referencia (`list_price_cents`, `catalog_snapshot`); cambiar el catálogo después no altera contratos.
- En el alta guiada, los servicios de un mismo grupo de alternativas se eligen como opciones (radio con «Ninguno»); los demás son casillas. Elegir una alternativa sustituye a la anterior; si se pierden personalizaciones o se rompe una dependencia, se pide confirmación.
- Reglas: ver [DATABASE.md](DATABASE.md#reglas-de-combinación-del-catálogo).

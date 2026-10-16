# Arquitectura

## Principios

- **Server Components por defecto.** Las páginas leen datos en servidor con la sesión del usuario. Solo son Client Components las piezas interactivas: formularios, tablas, menús, diálogos y gráficos.
- **Estado en la URL.** Filtros, búsqueda, ordenación, paginación, pestañas y periodo del dashboard viven en `searchParams`: son compartibles y se resuelven en servidor.
- **Autorización en tres capas.** (1) `proxy.ts` refresca la sesión y redirige sin sesión; (2) `requireMember()` / `assertMember()` en cada página, Server Action y Route Handler; (3) RLS en PostgreSQL. Las dos primeras son UX y defensa en profundidad; la garantía real es RLS.
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
  proxy.ts             refresco de sesión y redirecciones (antes "middleware")
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
- ExcelJS está en `serverExternalPackages` y solo se importa desde Route Handlers: no llega nunca al navegador.
- Las tablas piden únicamente la página visible (`range` + `count: exact`).
- Selects nativos en formularios (ligeros y cómodos en móvil); sin librerías de animación (CSS + `tw-animate-css`), con `prefers-reduced-motion`.
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

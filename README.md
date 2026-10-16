# Zyberna Internal OS

Aplicación web privada para gestionar la agencia Zyberna: clientes, catálogo de servicios, contrataciones con prestaciones personalizadas, cobros (totales y parciales), métricas (MRR/ARR, cobrado, pendiente) e importación/exportación Excel.

Acceso exclusivo para los socios autorizados. Sin registro público.

## Stack

Next.js 16 (App Router, RSC) · TypeScript estricto · Tailwind CSS 4 · shadcn/ui (radix-nova, personalizado) · Lucide · Supabase (PostgreSQL, Auth, RLS) con `@supabase/ssr` · Zod 4 · React Hook Form · TanStack Table 9 · Recharts (carga diferida) · ExcelJS (solo servidor) · Vitest · Playwright · Cloudflare Workers (OpenNext).

Producción: **https://os.alvarogaertner.com**

## Puesta en marcha

Requisitos: Node 20.9+ (probado con Node 24) y npm.

```bash
npm install
cp .env.example .env.local      # rellena las variables de Supabase
npm run dev                     # http://localhost:3000
```

> En redes con inspección TLS (por ejemplo, FortiGate) ejecuta Node con `NODE_OPTIONS=--use-system-ca`.
> Para el preview de Workers hace falta también `NODE_EXTRA_CA_CERTS`. Ver [docs/CLOUDFLARE.md](docs/CLOUDFLARE.md).

### Variables de entorno

| Variable | Dónde | Descripción |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | build (local / GitHub) | URL del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | build (local / GitHub) | Clave publicable (segura en navegador; RLS protege los datos) |
| `SITE_URL` | runtime (`wrangler.jsonc`) | URL pública para los enlaces de recuperación de contraseña |
| `E2E_EMAIL`, `E2E_PASSWORD` | `.env.test.local` | Usuario autorizado para los tests E2E |

La aplicación **no usa la service role key**. Ningún secreto se expone ni se puede editar desde la interfaz.

## Supabase

1. Aplica las migraciones de `supabase/migrations/` en orden (ver [docs/DATABASE.md](docs/DATABASE.md)).
2. Autoriza a los socios con `supabase/authorize-members.sql`.
3. Crea sus usuarios en *Authentication → Users*.
4. En *Authentication → Sign In / Providers* desactiva **Allow new users to sign up**.
5. En *Authentication → URL Configuration*: *Site URL* `https://os.alvarogaertner.com`; *Redirect URLs* `https://os.alvarogaertner.com/auth/callback` y `http://localhost:3000/auth/callback`.

## Scripts

```bash
npm run dev          # desarrollo
npm run build        # build de producción
npm run start        # servir el build
npm run lint         # ESLint
npm run typecheck    # TypeScript sin emitir
npm test             # Vitest (unitarias)
npm run test:e2e     # Playwright (levanta `next start` en el puerto 3100; requiere build)
npm run cf:build     # build OpenNext para Cloudflare
npm run preview      # Worker local en workerd (runtime real)
npm run deploy       # despliegue (normalmente lo hace la CI)
```

## Documentación

- [Arquitectura](docs/ARCHITECTURE.md)
- [Base de datos](docs/DATABASE.md)
- [Excel](docs/EXCEL.md)
- [Despliegue](docs/DEPLOYMENT.md)
- [Seguridad](docs/SECURITY.md)
- [Cloudflare](docs/CLOUDFLARE.md) · [Copias de seguridad](docs/BACKUPS.md) · [Operaciones y rollback](docs/OPERATIONS.md)

## Identidad visual

La identidad es provisional y está centralizada: tokens en `src/app/globals.css`, logotipo en `src/components/brand/logo.tsx` y `src/app/icon.svg`, textos en `src/config/brand.ts` y tipografía en `src/app/layout.tsx`.

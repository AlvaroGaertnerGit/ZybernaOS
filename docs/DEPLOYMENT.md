# Despliegue en Vercel

## Checklist

1. **Supabase listo**: migraciones aplicadas, socios autorizados (`supabase/authorize-members.sql`), usuarios creados y registro público desactivado (ver [DATABASE.md](DATABASE.md)).
2. **Repositorio**: sube el proyecto a GitHub (`.env.local` está ignorado por Git).
3. **Proyecto en Vercel**: *Add New → Project*, importa el repositorio. Framework: Next.js (autodetectado). Build: `npm run build`.
4. **Variables de entorno** (Production y Preview):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `NEXT_PUBLIC_SITE_URL` = `https://<dominio-de-producción>`
   No añadas la service role key: la app no la necesita.
5. **Auth URLs en Supabase** (*Authentication → URL Configuration*):
   - Site URL: `https://<dominio-de-producción>`
   - Redirect URLs: `https://<dominio-de-producción>/auth/callback` (y, si usas previews, `https://*-<equipo>.vercel.app/auth/callback`).
6. **Desplegar** y verificar:
   - `/login` carga, `/dashboard` sin sesión redirige a `/login`.
   - Login con un socio, crear un cliente de prueba y archivarlo.
   - Descarga de plantilla y exportación completa.
   - Recuperación de contraseña: el email lleva a `/auth/callback` → `/recuperar/nueva`.

Con la CLI: `npx vercel link`, `npx vercel env add …`, `npx vercel` (preview) y `npx vercel --prod`.

## Notas

- Las funciones de Vercel limitan el cuerpo de la petición a 4,5 MB, por eso la importación admite como máximo 4 MB.
- `/api/excel/import` declara `maxDuration = 60`.
- Las cabeceras de seguridad (HSTS, `X-Frame-Options: DENY`, `nosniff`, CSP `frame-ancestors 'none'`, `X-Robots-Tag: noindex`) se definen en `next.config.ts`.
- HTTPS lo proporciona Vercel; `upgrade-insecure-requests` solo se emite en producción.

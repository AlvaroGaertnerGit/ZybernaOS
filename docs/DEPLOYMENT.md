# Despliegue (Cloudflare Workers)

Destino: Worker `zyberna-internal` en `https://os.alvarogaertner.com`. Los detalles técnicos están en [CLOUDFLARE.md](CLOUDFLARE.md) y el día a día en [OPERATIONS.md](OPERATIONS.md).

## Estado (16/10/2026)

| Paso | Estado |
|---|---|
| Migraciones (3) aplicadas en Supabase | Hecho |
| Auth: *Site URL* `https://os.alvarogaertner.com`, *Redirect URLs* `https://os.alvarogaertner.com/**` (sin localhost) | Hecho |
| Auth: registro público desactivado (`disable_signup: true`) | Hecho |
| Worker `zyberna-internal` desplegado en Workers Free con Custom Domain `os.alvarogaertner.com` | Hecho |
| HTTPS (certificado universal `*.alvarogaertner.com`) y respuestas verificadas desde Cloudflare | Hecho |
| Socio 1 (`admin`): recuperación enviada; contraseña fijada desde producción (11:26 UTC) | Hecho |
| Socio 2 (Sevi, `alvarosevillano1@gmail.com`, `member`): autorizado e invitado (11:29 UTC) | Pendiente de que acepte la invitación |
| Repositorio en GitHub + CI/CD + backup semanal | Pendiente: el repositorio no tiene remoto |
| Pruebas E2E con sesión en producción | Pendiente de una cuenta QA o de las credenciales |

**Enlaces de email**: `/auth/callback` acepta el flujo PKCE (`?code=`), `token_hash` y, si el enlace trae los tokens en el fragmento (`#access_token=…`, formato por defecto de las invitaciones y recuperaciones enviadas desde el panel de Supabase), redirige a `/recuperar/enlace`, que establece la sesión en el navegador y lleva a crear la contraseña. No hace falta modificar las plantillas de correo.

## Checklist del primer despliegue

1. **Supabase**:
   - Migraciones aplicadas ([DATABASE.md](DATABASE.md)).
   - Socios autorizados (`supabase/authorize-members.sql`) y sus usuarios creados.
   - *Authentication → Sign In / Providers*: **Allow new users to sign up** desactivado.
   - *Authentication → URL Configuration*: *Site URL* `https://os.alvarogaertner.com`; *Redirect URLs* `https://os.alvarogaertner.com/**`. Para desarrollo local se puede añadir temporalmente `http://localhost:3000/**`.
2. **Cloudflare**: `npx wrangler login` y comprobar que la zona `alvarogaertner.com` está en la cuenta y que no existe un registro `os`.
3. **GitHub**:
   - Repositorio privado.
   - *Variables*: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` y `CLOUDFLARE_ACCOUNT_ID`.
   - *Secret* del entorno `production`: `CLOUDFLARE_API_TOKEN` (permisos mínimos, ver CLOUDFLARE.md).
4. **Dominio**: descomentar `routes` en `wrangler.jsonc` (Custom Domain).
5. **Desplegar**: merge a `main` (CI) o, la primera vez, `npm run deploy` en local.
6. **Verificar**:
   - El certificado TLS es válido.
   - `/login` responde 200 y `/dashboard` sin sesión redirige a `/login`.
   - `/robots.txt` contiene `Disallow: /`.
   - Login de los dos socios, crear y archivar un cliente de prueba, descargar la plantilla y exportar.
   - La recuperación de contraseña lleva a `https://os.alvarogaertner.com/auth/callback`.

## Notas

- Límite de tamaño de importación: 4 MB (validado en servidor).
- Cabeceras de seguridad en `next.config.ts` (HSTS, CSP `frame-ancestors 'none'`, `X-Frame-Options`, `nosniff`, `noindex`). HTTPS lo gestiona Cloudflare.
- Si algún día se despliega en otra plataforma Node (por ejemplo Vercel), basta con `next build`: el código no depende de Cloudflare.

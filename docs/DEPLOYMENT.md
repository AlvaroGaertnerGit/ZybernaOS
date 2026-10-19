# Despliegue (Cloudflare Workers)

Destino: Worker `zyberna-internal` en `https://os.alvarogaertner.com`. Los detalles técnicos están en [CLOUDFLARE.md](CLOUDFLARE.md) y el día a día en [OPERATIONS.md](OPERATIONS.md).

## Estado (actualizado 19/10/2026)

| Paso | Estado |
|---|---|
| Migraciones aplicadas en Supabase (6, ver [DATABASE.md](DATABASE.md)); las 3 del catálogo comercial el 19/10/2026 | Hecho |
| Auth: *Site URL* `https://os.alvarogaertner.com`, *Redirect URLs* `https://os.alvarogaertner.com/**` (sin localhost) | Hecho |
| Auth: registro público desactivado (`disable_signup: true`) | Hecho |
| Worker `zyberna-internal` desplegado en Workers Free con Custom Domain `os.alvarogaertner.com` | Hecho |
| HTTPS (certificado universal `*.alvarogaertner.com`) y respuestas verificadas desde Cloudflare | Hecho |
| Socio 1 (`admin`): recuperación enviada; contraseña fijada desde producción (11:26 UTC) | Hecho |
| Socio 2 (Sevi, `member`): autorizado e invitado (16/10, 11:29 UTC) | Comprobar que ha creado su contraseña |
| Catálogo comercial (tarifas, reglas, variable) desplegado: versión `0b805d0e` del Worker (19/10/2026) | Hecho, desde local con `opennextjs-cloudflare deploy` |
| Repositorio en GitHub | **Revisar**: `origin` = `github.com/AlvaroGaertnerGit/ZybernaOS` existe y es **público**; contiene la rama `feat/internal-os` hasta 483d4ee. Ver [Repositorio privado](#repositorio-privado-en-github) |
| CI/CD + backup semanal | Pendiente de que el repositorio sea privado y tenga variables y secretos |
| Pruebas E2E con sesión en producción | Pendiente de una cuenta QA o de las credenciales |

**Enlaces de email**: `/auth/callback` acepta el flujo PKCE (`?code=`), `token_hash` y, si el enlace trae los tokens en el fragmento (`#access_token=…`, formato por defecto de las invitaciones y recuperaciones enviadas desde el panel de Supabase), redirige a `/recuperar/enlace`, que establece la sesión en el navegador y lleva a crear la contraseña. No hace falta modificar las plantillas de correo.

## Repositorio privado en GitHub

Estado comprobado el 19/10/2026 (solo lectura, API pública de GitHub): el repositorio `AlvaroGaertnerGit/ZybernaOS` es **público**, su rama por defecto es `feat/internal-os` y no hay `main`. No contiene claves ni contraseñas, pero sí datos internos: el identificador del proyecto Supabase (`.mcp.json`), detalles de la red (`docs/CLOUDFLARE.md`) y, en el historial, el email de un socio (retirado de la documentación en el commit del catálogo comercial). Nada de esto da acceso por sí solo: el acceso real lo protegen Auth, la lista blanca y RLS.

Pasos (los hace un socio; requieren confirmación explícita, nada se publica automáticamente):

1. GitHub → *ZybernaOS → Settings → General → Danger Zone → Change visibility → Private*. Hacerlo **antes** de subir más commits.
2. (Opcional) Si se quiere eliminar del historial el email ya publicado, hay que reescribir la historia (`git filter-repo`) y forzar el push; mientras el repo fue público pudo copiarse, así que lo más importante es el paso 1.
3. Crear `main` a partir de `feat/internal-os` y hacerla rama por defecto (la CI despliega solo desde `main`):
   ```powershell
   git push origin feat/internal-os        # sube el commit del catálogo comercial
   git push origin feat/internal-os:main   # crea main
   ```
   Después: *Settings → General → Default branch → main* y, en *Branches*, proteger `main` (PR obligatorio).
4. *Settings → Secrets and variables → Actions*:
   - Variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `CLOUDFLARE_ACCOUNT_ID`.
   - Entorno `production` (*Settings → Environments*): secreto `CLOUDFLARE_API_TOKEN` (permisos mínimos en [CLOUDFLARE.md](CLOUDFLARE.md)) y, si se quiere, *Required reviewers*.
5. Backups: ver [BACKUPS.md](BACKUPS.md#activar-la-copia-automática).

Hasta completar el paso 4, la CI de `main` fallaría al desplegar: no crear `main` antes de configurar los secretos si no se quiere un despliegue fallido (no afecta a producción).

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

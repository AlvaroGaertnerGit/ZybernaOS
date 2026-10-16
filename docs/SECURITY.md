# Seguridad

## Autenticación

- Supabase Auth con email y contraseña; sesiones en cookies httpOnly gestionadas por `@supabase/ssr`. El proxy refresca la sesión en cada petición.
- La identidad se verifica con `auth.getClaims()` (JWT validado), nunca con `getSession()` en servidor.
- Sin registro público: no hay ruta de registro y debe desactivarse "Allow new users to sign up" en Supabase. Aunque alguien lograra crear un usuario, **no tendría perfil** (solo se crea si el email está en `authorized_emails`) y RLS le negaría todo.
- Tras el login se comprueba la membresía; si no existe, se cierra la sesión.
- Recuperación de contraseña con respuesta idéntica exista o no la cuenta (sin enumeración de usuarios). Redirecciones posteriores al login solo a rutas internas.

## Autorización

| Capa | Mecanismo |
|---|---|
| Proxy | Redirige sin sesión; la API responde 401 |
| Servidor | `requireMember()` en layouts/páginas, `assertMember()` en Server Actions y Route Handlers |
| Base de datos | RLS con `is_member()` en todas las tablas; `anon` sin permisos; funciones RPC `SECURITY INVOKER` que además comprueban `is_member()` |

Preparado para permisos granulares: `profiles.role` (`admin`/`member`) y `is_admin()` existen; hoy ambos roles tienen acceso completo a los datos operativos.

## Datos

- Entradas validadas con Zod en cliente y **de nuevo en servidor**.
- Importes en céntimos enteros; restricciones `check` en BD (importes no negativos, cobrado ≤ previsto, periodicidades coherentes, fechas).
- Idempotencia de cobros (`idempotency_key` única) y de generación de cuotas (índice único por periodo).
- Excel: firma ZIP verificada, macros rechazadas, fórmulas no evaluadas, límites de tamaño y filas, nombre de archivo saneado (solo metadato), validación repetida en servidor, importación transaccional, sin sobrescritura sin confirmación explícita, exportación protegida frente a inyección de fórmulas.
- La actividad registra nombres de columnas cambiadas, nunca valores de notas ni secretos.

## Secretos

- Solo se usan las variables públicas `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. **No se usa la service role key.**
- `.env*` está ignorado por Git (salvo los `.example`).
- La interfaz no muestra ni permite modificar secretos.

## Cabeceras

HSTS, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`, CSP (`frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'`), `X-Robots-Tag: noindex` y sin `X-Powered-By`.

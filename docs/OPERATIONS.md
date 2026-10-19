# Operaciones

## Flujo de cambios

```
rama de trabajo → Pull Request (CI: typecheck, lint, tests, audit, build OpenNext, smoke test en workerd)
               → merge a main → CI verifica de nuevo → despliegue automático a zyberna-internal
```

Un solo sistema despliega: GitHub Actions (`.github/workflows/ci.yml`). No se activa la integración Git de Cloudflare, para evitar despliegues dobles. El job `deploy` usa el entorno `production` de GitHub, donde se puede exigir aprobación manual (*Settings → Environments → production → Required reviewers*).

## Migraciones de base de datos

- Van en `supabase/migrations/`, con marca temporal, y se aplican **antes** de desplegar el código que las necesita.
- Deben ser compatibles hacia atrás (patrón *expand → migrate → contract*): añadir columnas o tablas nuevas como opcionales, desplegar el código, y eliminar lo antiguo en una migración posterior.
- Se aplican con el MCP de Supabase (`apply_migration`), con `npx supabase db push` o desde el SQL Editor. Comprueba siempre `list_migrations` antes, para no aplicar una migración dos veces.

## Rollback

Un rollback de código **no revierte las migraciones SQL**.

1. **Identificar la versión anterior**: `npx wrangler deployments list --name zyberna-internal`, o en el panel *Workers → zyberna-internal → Deployments*.
2. **Volver a ella** (sin rebuild): `npx wrangler rollback <version-id> --name zyberna-internal -m "motivo"`, o el botón *Rollback* del panel. Alternativa: `git revert` del commit en `main`, con lo que la CI vuelve a desplegar.
3. **Comprobar**: `https://os.alvarogaertner.com/login` responde 200, `/dashboard` sin sesión redirige a `/login`, login con un socio y el dashboard muestra datos.
4. **Supabase**: en *Workers Logs* no deben aparecer errores `[db]`; listar clientes en la app.
5. **Migraciones incompatibles**: si la versión anterior no es compatible con el esquema actual, no se revierte la BD automáticamente. Se escribe una migración correctiva hacia delante, o se restaura una copia (ver [BACKUPS.md](BACKUPS.md)) previa autorización.

## Supervisión

| Qué | Dónde |
|---|---|
| Errores de servidor, de BD (`[db]`), de importación/exportación (`[import]`, `[export]`) y de acciones (`[action]`) | Cloudflare → Workers → zyberna-internal → Logs, o `npx wrangler tail` |
| Fallos de autenticación (intentos, límites) | Supabase → Logs → Auth |
| Errores y rendimiento de PostgreSQL | Supabase → Logs → Postgres; *Advisors* (seguridad y rendimiento) |
| Fallos de CI y despliegue | GitHub Actions (email automático) |

## Gestión de socios

- **Alta** (p. ej. Sevi), sin interfaz en la app:
  1. Autorizar el email (SQL Editor o MCP): `insert into public.authorized_emails (email, role, full_name) values ('email@real', 'member', 'Nombre');` (`admin` si debe tener ese rol; hoy ambos roles pueden hacer todo).
  2. Supabase → *Authentication → Users → Invite user* con ese email. El enlace lleva a `https://os.alvarogaertner.com`, donde crea su contraseña.
  3. Correo: el SMTP integrado de Supabase **solo entrega a miembros del equipo de la organización** en supabase.com y como máximo 2 emails/hora. Para que llegue la invitación, añade antes a esa persona como miembro de la organización *Zyberna Org* (gratis), o configura un SMTP propio.
- **Restablecer contraseña**: desde `/recuperar` en la app, o *Users → Send password recovery* en Supabase.
- **Baja sin borrar datos**: `update public.profiles set is_active = false where email = '…';`
- El registro público está desactivado; la recuperación de contraseña sigue activa.

## Mantenimiento del subdominio

`os.alvarogaertner.com` es un Custom Domain del Worker (`routes` en `wrangler.jsonc`). Para cambiarlo: actualiza `routes`, `SITE_URL` y las URLs de Supabase Auth (*Site URL* y *Redirect URLs*). El certificado TLS lo renueva Cloudflare automáticamente.

## Comprobaciones manuales pendientes (catálogo comercial, 19/10/2026)

Verificado ya en producción el 19/10/2026 (escritorio, sesión de un socio): alta guiada con planes alternativos y dependencias, precio personalizado con indicador de descuento, resumen económico por periodicidad, aviso y bloqueo en contratación individual, componente variable pendiente sin cobro automático, dashboard, rechazo de una petición manipulada por la BD y protección de la tarifa guardada. Los datos de prueba se eliminaron.

Pendiente (hacerlo con un cliente de prueba `E2E-…` y archivarlo o pedir su borrado al terminar):

**Versión móvil** (no se pudo reducir la ventana del navegador automatizado). En un móvil real o con las herramientas de desarrollo (≈390 px de ancho):
1. *Clientes → Nuevo*: paso «Servicios» sin desplazamiento horizontal; las tarjetas de planes SEO se ven como opciones (círculo) con «Ninguno»; la puesta en marcha aparece bloqueada con el motivo hasta elegir un plan.
2. Paso «Precios»: los campos de precio, moneda, impuesto y periodicidad no se solapan; el indicador «Precio personalizado» y el botón «Aplicar tarifa» caben.
3. El diálogo de confirmación al quitar un plan con puesta en marcha se lee completo y sus botones son pulsables.
4. *Contrataciones → ficha*: panel «Componente variable» y diálogo «Registrar periodo» usables.
5. *Servicios → editar*: el diálogo con modalidades y «Reglas de combinación» se desplaza correctamente.

**Importación / exportación Excel en producción** (la validación está cubierta por tests unitarios y la transacción por `supabase/tests/catalog_rules.sql`, pero no se ha probado el flujo completo en producción):
1. *Importar / Exportar → Descargar plantilla*: la hoja CONTRATACIONES incluye `proyecto`, `tarifa_catalogo`, `variable_pct` y `variable_base`, y CATALOGOS la lista `bases_variable`.
2. Importar un libro con un cliente de prueba y dos filas de planes SEO para el mismo cliente → la previsualización muestra el error en la fila y columna `servicio`, y no se guarda nada.
3. Corregir a un plan + «Puesta en marcha SEO» (+ opcional `variable_pct` 8 / `variable_base` beneficios) → importa; la contratación muestra la tarifa al contratar.
4. *Exportar todo* → la exportación incluye `proyecto`, `tarifa_catalogo` y el variable; reimportarla en modo «Omitir» no crea duplicados.
5. Archivar el cliente de prueba (o pedir su borrado por SQL).

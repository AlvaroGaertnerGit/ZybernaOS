# Copias de seguridad y recuperación

El despliegue en Cloudflare **no** es una copia de seguridad: los datos viven en Supabase (PostgreSQL).

## Qué ofrece Supabase (documentación consultada el 16/10/2026)

| Plan | Copias automáticas | PITR |
|---|---|---|
| Free | **Ninguna.** Supabase recomienda `supabase db dump` y copias externas | No |
| Pro | Diarias, últimos 7 días, descargables | Add-on (~100 $/mes para 7 días) |

No hay que dar por hecho que existen copias automáticas: compruébalo en *Project Settings → Database → Backups*.

## Estado (19/10/2026)

- **Copia semanal: NO activa.** El repositorio de GitHub (`AlvaroGaertnerGit/ZybernaOS`) existe pero es **público** y no tiene `main` ni los secretos `SUPABASE_DB_URL` y `BACKUP_PASSPHRASE`. No se deben guardar copias de la BD como artefactos de un repositorio público: primero hay que hacerlo privado (ver [DEPLOYMENT.md](DEPLOYMENT.md#repositorio-privado-en-github)).
- El plan Free de Supabase no hace copias automáticas.
- **Última copia manual verificada**: 19/10/2026, antes de la migración del catálogo comercial. Volcado JSON de todas las tablas de `public` guardado **fuera del repositorio**, en el equipo de trabajo (carpeta `_backup-zyberna-2026-10-19` junto al proyecto), con scripts de restauración y verificación. Se comprobó la restauración reconstruyendo las filas y comparándolas con producción: 0 diferencias. Contiene emails de los socios: no subirla a Git.
- Mientras no haya copia automática, antes de cada cambio importante: *Importar / Exportar → Exportar todo* (Excel reimportable) y/o una copia manual como la anterior.

## Activar la copia automática

Requisitos previos: repositorio **privado** y rama `main` como rama por defecto (el `schedule` de GitHub Actions solo se ejecuta en la rama por defecto).

1. **Cadena de conexión**: Supabase → *Project Settings → Database → Connection string → Session pooler* (puerto 5432). Sustituir `[YOUR-PASSWORD]` por la contraseña de la BD (si no se conoce, *Reset database password*; no afecta a la app, que usa la API).
2. **Contraseña de cifrado**: generar una larga, p. ej. `[Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Maximum 256 }) -as [byte[]])` en PowerShell, y guardarla en el gestor de contraseñas de los dos socios **antes** de usarla.
3. GitHub → *Settings → Secrets and variables → Actions → New repository secret*:
   - `SUPABASE_DB_URL` = cadena del paso 1.
   - `BACKUP_PASSPHRASE` = contraseña del paso 2.
4. *Actions → Backup Supabase → Run workflow* (`workflow_dispatch`) para la primera copia. Debe terminar en verde y dejar un artefacto `zyberna-AAAAMMDDTHHMMZ.tar.gz.gpg`.
5. **Simulacro de restauración** (obligatorio la primera vez): descargar el artefacto, descifrarlo y restaurarlo en un proyecto Supabase **nuevo** de pruebas (procedimiento de abajo). Comprobar recuentos de clientes, contrataciones, cobros y servicios del catálogo.
6. A partir de ahí se ejecuta cada lunes a las 03:17 UTC; GitHub avisa por email si falla. Retención: 30 días.

## Estrategia

1. **Copia lógica semanal cifrada** (`.github/workflows/backup.yml`): `supabase db dump` (esquema + datos), cifrado AES-256 con GPG y guardado como artefacto privado de GitHub durante 30 días. Se activa al definir los secretos del repositorio:
   - `SUPABASE_DB_URL`: cadena de conexión (*Project Settings → Database → Connection string*, modo *Session pooler*). Da acceso total a la BD; solo debe estar en GitHub Secrets.
   - `BACKUP_PASSPHRASE`: contraseña larga; guárdala también en el gestor de contraseñas de los socios. Sin ella, la copia no se puede descifrar.
2. **Exportación Excel completa** (*Importar / Exportar → Exportar todo*) antes de cambios importantes y de forma mensual. Es portable y se puede reimportar.
3. **Plan Pro de Supabase** (25 $/mes) si se necesitan copias diarias gestionadas. Requiere autorización.

## Restauración (verificable)

```bash
gpg --decrypt zyberna-AAAAMMDDTHHMMZ.tar.gz.gpg > backup.tar.gz
tar xzf backup.tar.gz            # schema.sql, data.sql
# Restaurar en un proyecto Supabase NUEVO (nunca encima de producción sin decidirlo):
psql "<cadena-de-conexión-del-proyecto-destino>" -f schema.sql
psql "<cadena-de-conexión-del-proyecto-destino>" -f data.sql
```

Comprobación: iniciar sesión en la app apuntando al proyecto restaurado (ejecutando la app en local con `npm run preview` y las variables `NEXT_PUBLIC_SUPABASE_*` del proyecto restaurado) y verificar el número de clientes, contrataciones y cobros y los importes del dashboard.

Restauración parcial desde Excel: *Importar / Exportar → Importar* con el modo **Omitir**, que solo crea lo que falta y no sobrescribe nada.

Se recomienda hacer un simulacro de restauración en un proyecto de pruebas cada trimestre.

## Acceso

Solo los socios tienen acceso al repositorio (artefactos), al proyecto de Supabase y a la contraseña de cifrado.

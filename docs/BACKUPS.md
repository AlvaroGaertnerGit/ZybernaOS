# Copias de seguridad y recuperación

El despliegue en Cloudflare **no** es una copia de seguridad: los datos viven en Supabase (PostgreSQL).

## Qué ofrece Supabase (documentación consultada el 16/10/2026)

| Plan | Copias automáticas | PITR |
|---|---|---|
| Free | **Ninguna.** Supabase recomienda `supabase db dump` y copias externas | No |
| Pro | Diarias, últimos 7 días, descargables | Add-on (~100 $/mes para 7 días) |

No hay que dar por hecho que existen copias automáticas: compruébalo en *Project Settings → Database → Backups*.

## Estado (16/10/2026)

- **Copia semanal: NO activa.** El repositorio aún no tiene remoto en GitHub y faltan los secretos `SUPABASE_DB_URL` y `BACKUP_PASSPHRASE`. Hasta entonces, la copia disponible es la **exportación Excel completa** (*Importar / Exportar → Exportar todo*), que se puede reimportar.
- El plan Free de Supabase no hace copias automáticas.

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

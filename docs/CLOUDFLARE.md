# Cloudflare

Zyberna Internal OS se despliega como **Cloudflare Worker** con [OpenNext para Cloudflare](https://opennext.js.org/cloudflare) (`@opennextjs/cloudflare` 1.20, compatible con Next 16.4 y Wrangler 4.148+).

## Recursos

| Recurso | Nombre | Notas |
|---|---|---|
| Worker producción | `zyberna-internal` | Sin `workers.dev` ni preview URLs; solo el dominio personalizado |
| Dominio | `os.alvarogaertner.com` | Custom Domain del Worker (crea DNS y certificado automáticamente) |

No se usan R2, KV, D1, Durable Objects ni Images: la app es 100 % dinámica (depende de la sesión) y no usa ISR ni `next/image`.

**Convención de nombres** para futuros proyectos: `zyberna-<app>` para herramientas internas y `client-<cliente>-<web|app>` para proyectos de clientes. Un Worker y un repositorio por proyecto; producción solo desde `main`.

## Configuración

- `wrangler.jsonc`: nombre, `compatibility_date`, flags `nodejs_compat` (APIs de Node que usan Next y Supabase) y `global_fetch_strictly_public`, assets, observabilidad, variables y el Custom Domain. Sin entorno de staging.
- `open-next.config.ts`: configuración mínima, sin caché incremental.
- `src/middleware.ts` (runtime **edge**): Next 16 renombró `middleware` a `proxy`, pero `proxy.ts` se ejecuta en runtime Node, que OpenNext para Cloudflare solo soporta de forma experimental. Next 16 mantiene `middleware.ts` para el runtime edge, que es la vía soportada; la lógica (refresco de sesión de Supabase + redirecciones) es la misma.

## Variables

| Variable | Tipo | Dónde |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | pública, **build** | `.env.local` en local; *Variables* del repositorio en GitHub |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | pública, **build** | igual (no es secreta; RLS protege los datos) |
| `SITE_URL` | servidor, runtime | `vars` de `wrangler.jsonc` |
| `CLOUDFLARE_API_TOKEN` | secreto CI | *Secrets* del repositorio (entorno `production`) |
| `CLOUDFLARE_ACCOUNT_ID` | CI | *Variables* del repositorio |

No hay secretos de runtime: la app no usa la service role key. Si en el futuro hiciera falta uno: `npx wrangler secret put NOMBRE` (nunca en `wrangler.jsonc` ni en variables `NEXT_PUBLIC_*`). `.dev.vars*`, `.env*`, `.open-next/` y `.wrangler/` están ignorados por Git.

## Scripts

| Script | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo de Next.js |
| `npm run cf:build` | Build de Next + adaptación OpenNext (`.open-next/`) |
| `npm run preview` | Build + Worker local en workerd (runtime real de Workers) |
| `npm run deploy` | Build + despliegue a producción (normalmente lo hace la CI) |

## Windows, red con inspección TLS y certificados

En la red actual, un **FortiGate (Fortinet)** intercepta TLS y presenta certificados firmados por su CA (`CN=FG4H1FT922900755, O=Fortinet`). Esa CA está en el almacén de confianza de Windows, pero Node y workerd usan sus propias listas, de ahí los errores `SELF_SIGNED_CERT_IN_CHAIN` de npm, Wrangler y Supabase.

Solución segura (sin desactivar verificaciones; **prohibido** `NODE_TLS_REJECT_UNAUTHORIZED=0` o `strict-ssl=false`):

```powershell
# Node / npm / Wrangler: usar los certificados del sistema (Node ≥ 22.15 / 23.8)
$env:NODE_OPTIONS = "--use-system-ca"

# workerd (wrangler dev / preview) no lee el almacén de Windows: exportar la CA ya confiada
# por el sistema (una vez) y pasarla con NODE_EXTRA_CA_CERTS
$c = Get-ChildItem Cert:\LocalMachine\Root | Where-Object Subject -like '*O=Fortinet*' | Select-Object -First 1
New-Item -ItemType Directory -Force "$env:USERPROFILE\.certs" | Out-Null
"-----BEGIN CERTIFICATE-----`n$([Convert]::ToBase64String($c.RawData,'InsertLineBreaks'))`n-----END CERTIFICATE-----" |
  Set-Content "$env:USERPROFILE\.certs\fortinet-ca.pem" -Encoding ascii
$env:NODE_EXTRA_CA_CERTS = "$env:USERPROFILE\.certs\fortinet-ca.pem"
```

Las variables se fijan solo en la sesión de terminal (no globalmente). Fuera de esa red no hace falta nada.

**Symlinks en Windows**: OpenNext crea enlaces simbólicos al copiar dependencias, algo que Windows solo permite con modo desarrollador o como administrador. Sin ellos, el build local usa un shim que copia en lugar de enlazar:

```powershell
$env:NODE_OPTIONS = "--use-system-ca --require ./scripts/win-symlink-shim.cjs"
npm run cf:build
```

La CI (Linux) no lo necesita.

## Autenticación de Wrangler

```powershell
$env:NODE_OPTIONS = "--use-system-ca"
npx wrangler login     # abre el navegador (OAuth)
npx wrangler whoami
```

La CI usa un **API token** con permisos mínimos: *Account → Workers Scripts: Edit* y, para el Custom Domain, *Zone (alvarogaertner.com) → Workers Routes: Edit*, más *DNS: Edit* solo si se gestiona el dominio desde la CI. El MCP de Cloudflare usa su propia autorización OAuth y no comparte credenciales con Wrangler.

## Dominio personalizado

**Activo desde el 16/10/2026.** Configurado en `wrangler.jsonc`:

```jsonc
"routes": [{ "pattern": "os.alvarogaertner.com", "custom_domain": true }]
```

Cloudflare crea el registro DNS de `os` y el certificado TLS. No toca el dominio raíz, los MX/SPF/DKIM/DMARC ni otros subdominios. Requisito: la zona `alvarogaertner.com` debe estar en la misma cuenta de Cloudflare y no debe existir ya un registro `os`.

## Plan y límites: Workers Free (medido)

Se usa **Workers Free** (0 €). Límites relevantes ([documentación](https://developers.cloudflare.com/workers/platform/limits/), 16/10/2026): 10 ms de CPU por petición (la espera de red no cuenta), 64 MiB de Worker sin comprimir (sin límite comprimido desde el 04/09/2026), 1 s de arranque, 128 MB de memoria, 50 subpeticiones, 100.000 peticiones/día.

| Medida | Valor | Límite Free |
|---|---|---|
| Tamaño del Worker | 10,8 MiB (2,25 MiB gzip) | 64 MiB |
| Arranque (medido por Cloudflare al desplegar) | 19 ms | 1 s |
| Subpeticiones máximas por petición | 12 (dashboard) | 50 |
| CPU con isolate caliente (producción) | login 11–15 ms, redirecciones y 401 1–7 ms | 10 ms |
| CPU primera petición de un isolate frío (producción) | 230–570 ms | 10 ms |
| Peticiones cortadas por CPU (error 1102) | 0 de 140 (16/10/2026) | — |

Cloudflare tolera excesos ocasionales de CPU por isolate; con dos usuarios no se ha observado ningún corte. Lo que más CPU gastaba (generar y leer Excel, 49–273 ms) se ha movido al navegador, y los totales se agregan en SQL. Consultar `cpuTimeMs` y `outcome` en *Workers → zyberna-internal → Observability*; si aparecieran `exceededCpu` de forma sostenida, ese sería el dato para valorar Workers Paid (5 $/mes).

Mediciones locales y método: `scripts/bench/` (CPU por ciclos de hilo en workerd con Supabase simulado).

**Red con FortiGuard**: la red actual bloquea por DNS los dominios recién creados (página «Fortiguard SDNS Blocked Page»). Desde esa red `os.alvarogaertner.com` no abre hasta que FortiGuard lo clasifique; desde otras redes (móvil, casa) funciona.

## Observabilidad

`observability.enabled` activa Workers Logs (logs de `console.*` y errores por petición) en el panel de Cloudflare: *Workers → zyberna-internal → Logs*. La app registra errores con prefijos (`[db]`, `[action]`, `[import]`, `[export]`) y nunca registra contraseñas, tokens ni datos de clientes. Los despliegues fallidos se ven en GitHub Actions (notificación por email de GitHub). Logs en vivo: `npx wrangler tail zyberna-internal`.

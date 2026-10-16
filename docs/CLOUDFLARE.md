# Cloudflare

Zyberna Internal OS se despliega como **Cloudflare Worker** con [OpenNext para Cloudflare](https://opennext.js.org/cloudflare) (`@opennextjs/cloudflare` 1.20, compatible con Next 16.4 y Wrangler 4.148+).

## Recursos

| Recurso | Nombre | Notas |
|---|---|---|
| Worker producción | `zyberna-internal` | Sin `workers.dev` ni preview URLs; solo el dominio personalizado |
| Dominio | `os.alvarogaertner.com` | Custom Domain del Worker (crea DNS y certificado automáticamente) |
| Worker staging (opcional) | `zyberna-internal-staging` | `wrangler deploy --env staging`, URL `*.workers.dev` |

No se usan R2, KV, D1, Durable Objects ni Images: la app es 100 % dinámica (depende de la sesión) y no usa ISR ni `next/image`.

**Convención de nombres** para futuros proyectos: `zyberna-<app>` / `zyberna-<app>-staging` para herramientas internas y `client-<cliente>-<web|app>` para proyectos de clientes. Un Worker y un repositorio por proyecto; producción solo desde `main`.

## Configuración

- `wrangler.jsonc`: nombre, `compatibility_date`, flags `nodejs_compat` (APIs de Node que usan Next, Supabase y ExcelJS) y `global_fetch_strictly_public`, assets, observabilidad, variables y el entorno `staging`.
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
| `npm run deploy:staging` | Build + despliegue al Worker de staging |

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

En el primer despliegue autorizado se activa en `wrangler.jsonc`:

```jsonc
"routes": [{ "pattern": "os.alvarogaertner.com", "custom_domain": true }]
```

Cloudflare crea el registro DNS de `os` y el certificado TLS. No toca el dominio raíz, los MX/SPF/DKIM/DMARC ni otros subdominios. Requisito: la zona `alvarogaertner.com` debe estar en la misma cuenta de Cloudflare y no debe existir ya un registro `os`.

## Costes (precios consultados el 16/10/2026)

| Plan | Límites relevantes | Coste |
|---|---|---|
| Workers Free | 100.000 peticiones/día, **10 ms de CPU por petición**, 50 subpeticiones | 0 € |
| Workers Paid | 10 M peticiones/mes y 30 M ms de CPU incluidos, hasta 5 min de CPU, Workers Logs 20 M eventos/mes | 5 $/mes |

El tráfico y los assets estáticos no se facturan. **Riesgo del plan gratuito**: el render de Next.js en servidor y, sobre todo, la lectura y generación de Excel superan con frecuencia los 10 ms de CPU, lo que provoca errores 1102 intermitentes. Para un uso diario fiable se recomienda Workers Paid (5 $/mes); no se contrata sin autorización.

## Observabilidad

`observability.enabled` activa Workers Logs (logs de `console.*` y errores por petición) en el panel de Cloudflare: *Workers → zyberna-internal → Logs*. La app registra errores con prefijos (`[db]`, `[action]`, `[import]`, `[export]`) y nunca registra contraseñas, tokens ni datos de clientes. Los despliegues fallidos se ven en GitHub Actions (notificación por email de GitHub). Logs en vivo: `npx wrangler tail zyberna-internal`.

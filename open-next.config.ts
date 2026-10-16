import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Toda la aplicación es dinámica (depende de la sesión): no usa ISR ni caché
// incremental, por lo que no necesita R2, KV ni D1. Menos recursos y sin coste extra.
export default defineCloudflareConfig({});

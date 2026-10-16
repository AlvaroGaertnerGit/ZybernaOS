import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

/**
 * Refresco de sesión de Supabase y redirección a /login.
 *
 * Se usa `middleware.ts` (runtime edge) en lugar de `proxy.ts` (runtime Node, sin
 * soporte oficial en OpenNext para Cloudflare). Next 16 mantiene `middleware` para el
 * runtime edge; la lógica es idéntica. Ver docs/CLOUDFLARE.md.
 */
export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt|.*\.(?:svg|png|jpg|jpeg|webp|ico)$).*)"],
};

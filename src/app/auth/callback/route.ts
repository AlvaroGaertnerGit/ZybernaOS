import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Destino de los enlaces de email de Supabase (recuperación de contraseña, invitación).
 * Admite el flujo PKCE (?code=) y el de token_hash (?token_hash=&type=).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const nextParam = searchParams.get("next") ?? "/dashboard";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/dashboard";
  const supabase = await createClient();

  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  // Sin code ni token_hash: enlace con los tokens en el fragmento (#…), que el servidor no ve.
  // El navegador conserva el fragmento en la redirección y la página cliente lo procesa.
  if (!code && !tokenHash) return NextResponse.redirect(new URL("/recuperar/enlace", origin));

  let ok = false;
  if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  } else if (tokenHash && type) {
    ok = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error;
  }

  if (!ok) return NextResponse.redirect(new URL("/login?error=link", origin));
  const destination = type === "recovery" || type === "invite" ? "/recuperar/nueva" : next;
  return NextResponse.redirect(new URL(destination, origin));
}

"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { forgotPasswordSchema, loginSchema, passwordSchema } from "@/lib/validations/schemas";
import { getMember } from "@/server/auth";

export type AuthFormState = { error?: string; message?: string; email?: string } | undefined;

/** Solo se permiten redirecciones internas tras el login. */
function safeNext(next: FormDataEntryValue | null): string {
  const value = typeof next === "string" ? next : "";
  return value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\") ? value : "/dashboard";
}

async function siteUrl() {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function signIn(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = loginSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  const email = typeof formData.get("email") === "string" ? String(formData.get("email")) : "";
  if (!parsed.success) return { error: "Introduce un email y una contraseña válidos.", email };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    if (error.code === "email_not_confirmed") return { error: "Confirma tu email antes de acceder.", email };
    if (error.status === 429) return { error: "Demasiados intentos. Espera unos minutos.", email };
    return { error: "Email o contraseña incorrectos.", email };
  }

  // Autenticado no implica autorizado: debe existir un perfil de miembro activo.
  const member = await getMember();
  if (!member) {
    await supabase.auth.signOut();
    return { error: "Esta cuenta no tiene acceso a Zyberna Internal OS.", email };
  }

  redirect(safeNext(formData.get("next")));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function requestPasswordReset(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = forgotPasswordSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { error: "Introduce un email válido." };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${await siteUrl()}/auth/callback?next=/recuperar/nueva`,
  });
  if (error?.status === 429) return { error: "Demasiadas solicitudes. Inténtalo más tarde." };
  // Respuesta idéntica exista o no la cuenta (evita enumeración de usuarios).
  return { message: "Si el email pertenece a una cuenta autorizada, recibirás un enlace para restablecer la contraseña." };
}

export async function updatePassword(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = passwordSchema.safeParse({ password: formData.get("password"), confirm: formData.get("confirm") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Contraseña no válida." };

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) return { error: "El enlace ha caducado. Solicita uno nuevo." };

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (error.code === "same_password") return { error: "La nueva contraseña debe ser distinta de la actual." };
    if (error.code === "weak_password") return { error: "La contraseña es demasiado débil." };
    return { error: "No se pudo actualizar la contraseña. Inténtalo de nuevo." };
  }
  return { message: "Contraseña actualizada." };
}

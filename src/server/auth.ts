import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ProfileRow } from "@/types/database";

export interface Member {
  id: string;
  email: string;
  fullName: string;
  role: ProfileRow["role"];
}

/**
 * Devuelve el miembro autenticado o null. Verifica el JWT (getClaims) y que exista
 * un perfil activo: un usuario autenticado sin perfil autorizado no es miembro.
 */
export const getMember = cache(async (): Promise<Member | null> => {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, is_active")
    .eq("id", userId)
    .maybeSingle();

  if (!profile || !profile.is_active) return null;
  return { id: profile.id, email: profile.email, fullName: profile.full_name, role: profile.role };
});

/** Para páginas y layouts privados. */
export async function requireMember(): Promise<Member> {
  const member = await getMember();
  if (!member) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    redirect(data?.claims?.sub ? "/login?error=unauthorized" : "/login");
  }
  return member;
}

export class UnauthorizedError extends Error {
  constructor() {
    super("No autorizado");
  }
}

/** Para Server Actions y Route Handlers: lanza en lugar de redirigir. */
export async function assertMember() {
  const member = await getMember();
  if (!member) throw new UnauthorizedError();
  const supabase = await createClient();
  return { member, supabase };
}

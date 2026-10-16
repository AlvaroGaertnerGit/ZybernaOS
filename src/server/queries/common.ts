import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { requireMember } from "@/server/auth";

export const PAGE_SIZE = 25;

/** Cliente de Supabase para consultas de páginas privadas (verifica membresía). */
export async function db() {
  await requireMember();
  return createClient();
}

/** Lanza un error legible si la consulta falla (lo captura error.tsx). */
export function unwrap<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) {
    console.error(`[db] ${what}:`, res.error.message);
    throw new Error(`No se pudo cargar ${what}.`);
  }
  return res.data as T;
}

/** Sanea texto de búsqueda para filtros or() de PostgREST. */
export function searchTerm(q: string | undefined | null): string | null {
  if (!q) return null;
  const cleaned = q.replace(/[,()*%\\:"']/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  return cleaned.length > 0 ? cleaned : null;
}

export function pageFrom(searchParam: string | string[] | undefined): number {
  const n = Number(Array.isArray(searchParam) ? searchParam[0] : searchParam);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

export function param(sp: Record<string, string | string[] | undefined>, key: string): string | undefined {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

export interface Paginated<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}

export const getMembers = cache(async () => {
  const supabase = await db();
  const res = await supabase.from("profiles").select("id, full_name, email, role").eq("is_active", true).order("full_name");
  return unwrap(res, "los miembros");
});

export const getCategories = cache(async () => {
  const supabase = await db();
  const res = await supabase
    .from("service_categories")
    .select("id, slug, name, description, sort_order, is_active")
    .order("sort_order");
  return unwrap(res, "las categorías");
});

export const getAgencySettings = cache(async () => {
  const supabase = await db();
  const res = await supabase.from("agency_settings").select("*").maybeSingle();
  return unwrap(res, "la configuración");
});

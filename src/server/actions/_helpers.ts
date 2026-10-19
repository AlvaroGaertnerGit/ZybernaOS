import "server-only";

import type { z } from "zod";
import type { ActionResult } from "@/lib/validations/common";
import { assertMember, UnauthorizedError } from "@/server/auth";

type PgError = { code?: string; message: string; details?: string | null };

/** Traduce errores de PostgreSQL/PostgREST a mensajes comprensibles (sin filtrar detalles internos). */
export function dbErrorMessage(error: PgError): string {
  switch (error.code) {
    case "23505":
      if (error.message.includes("code")) return "Ya existe un registro con ese código.";
      if (error.message.includes("idempotency")) return "Esta operación ya se había registrado.";
      if (error.message.includes("service_catalog_name")) return "Ya existe un servicio con ese nombre en la categoría.";
      return "Ya existe un registro con esos datos.";
    case "23503":
      return "El registro está relacionado con otros datos y no se puede completar la operación.";
    case "23514":
      if (error.message.includes("payments_paid_chk")) return "El importe cobrado no puede superar el importe previsto.";
      return "Algún valor no cumple las reglas de validación.";
    case "42501":
      return "No tienes permiso para realizar esta operación.";
    case "P0001":
      // Las reglas del catálogo empiezan por el código de la contratación («CON-0004: …»),
      // útil en importaciones pero no en un formulario donde aún no tiene código visible.
      return error.message.replace(/^[A-Z]{2,5}-\d+: /, "");
    default:
      return "No se pudo guardar. Inténtalo de nuevo.";
  }
}

export function validationError(error: z.ZodError): ActionResult<never> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return { ok: false, error: error.issues[0]?.message ?? "Revisa los datos del formulario.", fieldErrors };
}

/**
 * Ejecuta una acción autenticada: verifica membresía en servidor, valida la entrada
 * con Zod y captura errores. La autorización final la aplica RLS en PostgreSQL.
 */
export async function memberAction<S extends z.ZodType, T>(
  schema: S,
  input: unknown,
  fn: (data: z.output<S>, ctx: Awaited<ReturnType<typeof assertMember>>) => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  let ctx: Awaited<ReturnType<typeof assertMember>>;
  try {
    ctx = await assertMember();
  } catch (e) {
    if (e instanceof UnauthorizedError) return { ok: false, error: "Tu sesión ha caducado. Vuelve a iniciar sesión." };
    throw e;
  }
  const parsed = schema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  try {
    return await fn(parsed.data, ctx);
  } catch (e) {
    console.error("[action]", e instanceof Error ? e.message : e);
    return { ok: false, error: "Se produjo un error inesperado. Inténtalo de nuevo." };
  }
}

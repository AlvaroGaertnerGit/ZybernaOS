import type { FieldErrors, FieldValues } from "react-hook-form";

/** Mensaje de error de un campo anidado ("contracts.0.amount"). */
export function errorAt(errors: FieldErrors<FieldValues>, path: string): string | undefined {
  const node = path
    .split(".")
    .reduce<unknown>((acc, k) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[k] : undefined), errors);
  const message = (node as { message?: unknown } | undefined)?.message;
  return typeof message === "string" ? message : undefined;
}

export function newIdempotencyKey() {
  return `tx_${crypto.randomUUID()}`;
}

export type MemberOption = { id: string; full_name: string; email: string };
export type CategoryOption = { id: string; slug: string; name: string; is_active: boolean };

import type { PaymentStatus } from "@/lib/domain";
import type { IsoDate } from "./dates";
import type { Cents } from "./money";

/**
 * Estado derivado de un cobro. Debe coincidir con public.payment_status_of().
 * Prioridad: anulado > cobrado > vencido > parcial > pendiente.
 * Un cobro parcialmente pagado cuya fecha ha vencido se considera vencido
 * (el importe pendiente sigue mostrándose).
 */
export function paymentStatus(p: {
  amount_due_cents: Cents;
  amount_paid_cents: Cents;
  due_date: IsoDate;
  voided_at: string | null;
}, today: IsoDate): PaymentStatus {
  if (p.voided_at) return "void";
  if (p.amount_paid_cents >= p.amount_due_cents) return "paid";
  if (p.due_date < today) return "overdue";
  if (p.amount_paid_cents > 0) return "partial";
  return "pending";
}

export function outstanding(p: { amount_due_cents: Cents; amount_paid_cents: Cents; voided_at: string | null }): Cents {
  if (p.voided_at) return 0;
  return Math.max(p.amount_due_cents - p.amount_paid_cents, 0);
}

export type RecordPaymentCheck =
  | { ok: true }
  | { ok: false; reason: string };

/** Validación de un nuevo movimiento de cobro sobre un cobro previsto. */
export function canRecordPayment(
  p: { amount_due_cents: Cents; amount_paid_cents: Cents; voided_at: string | null },
  amount: Cents,
): RecordPaymentCheck {
  if (p.voided_at) return { ok: false, reason: "El cobro está anulado." };
  if (!Number.isInteger(amount) || amount <= 0) return { ok: false, reason: "El importe debe ser mayor que cero." };
  const pending = outstanding(p);
  if (pending === 0) return { ok: false, reason: "Este cobro ya está cobrado por completo." };
  if (amount > pending) return { ok: false, reason: "El importe supera lo pendiente de cobro." };
  return { ok: true };
}

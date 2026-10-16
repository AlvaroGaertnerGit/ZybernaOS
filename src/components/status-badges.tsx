import {
  CLIENT_STATUS_META,
  CONTRACT_STATUS_META,
  PAYMENT_STATUS_META,
  type ClientStatus,
  type ContractStatus,
  type PaymentStatus,
} from "@/lib/domain";
import { StatusBadge } from "@/components/ui/status-badge";

export function ClientStatusBadge({ status }: { status: ClientStatus }) {
  const m = CLIENT_STATUS_META[status];
  return <StatusBadge tone={m.tone}>{m.label}</StatusBadge>;
}

export function ContractStatusBadge({ status }: { status: ContractStatus }) {
  const m = CONTRACT_STATUS_META[status];
  return <StatusBadge tone={m.tone}>{m.label}</StatusBadge>;
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const m = PAYMENT_STATUS_META[status];
  return <StatusBadge tone={m.tone}>{m.label}</StatusBadge>;
}

import { describe, expect, it } from "vitest";
import { clientSchema, contractSchema, paymentSchema, transactionSchema } from "@/lib/validations/schemas";

const UUID = "7f3c2a5e-1b2d-4c3e-8f9a-0b1c2d3e4f5a";

const client = {
  code: "",
  trade_name: "Grupo Manor",
  legal_name: "",
  tax_id: "",
  contact_name: "Laura Gil",
  email: "Laura@GrupoManor.es",
  phone: "",
  website: "grupomanor.es",
  address: "",
  sector: "",
  status: "active",
  owner_id: "",
  joined_on: "2026-10-16",
  notes: "",
};

describe("clientSchema", () => {
  it("normaliza campos opcionales vacíos a null", () => {
    const r = clientSchema.parse(client);
    expect(r.legal_name).toBeNull();
    expect(r.code).toBeNull();
    expect(r.email).toBe("laura@grupomanor.es");
    expect(r.website).toBe("https://grupomanor.es");
  });
  it("exige nombre comercial, email válido y fecha", () => {
    const r = clientSchema.safeParse({ ...client, trade_name: " ", email: "no-es-email", joined_on: "2026-13-01" });
    expect(r.success).toBe(false);
    if (!r.success) {
      const paths = r.error.issues.map((i) => i.path.join("."));
      expect(paths).toEqual(expect.arrayContaining(["trade_name", "email", "joined_on"]));
    }
  });
  it("rechaza estados desconocidos", () => {
    expect(clientSchema.safeParse({ ...client, status: "vip" }).success).toBe(false);
  });
});

const contract = {
  code: "",
  client_id: UUID,
  service_id: "",
  category_id: UUID,
  name: "Gestión SEO",
  description: "",
  amount: "450,00",
  tax_rate: "",
  currency: "eur",
  billing_type: "recurring",
  periodicity: "monthly",
  interval_count: "",
  interval_unit: "",
  start_date: "2026-10-01",
  end_date: "",
  next_renewal_date: "",
  status: "active",
  owner_id: "",
  notes: "",
  deliverables: [{ title: "Auditoría técnica inicial", description: "" }],
};

describe("contractSchema", () => {
  it("convierte el precio a céntimos y la moneda a mayúsculas", () => {
    const r = contractSchema.parse(contract);
    expect(r.amount).toBe(45000);
    expect(r.currency).toBe("EUR");
    expect(r.tax_rate).toBeNull();
    expect(r.deliverables[0].description).toBeNull();
  });
  it("pago único: elimina la periodicidad", () => {
    const r = contractSchema.parse({ ...contract, billing_type: "one_time" });
    expect(r.periodicity).toBeNull();
  });
  it("recurrente sin periodicidad → error", () => {
    expect(contractSchema.safeParse({ ...contract, periodicity: "" }).success).toBe(false);
  });
  it("personalizada exige la regla completa", () => {
    expect(contractSchema.safeParse({ ...contract, periodicity: "custom" }).success).toBe(false);
    const r = contractSchema.parse({ ...contract, periodicity: "custom", interval_count: "2", interval_unit: "month" });
    expect(r.interval_count).toBe(2);
  });
  it("la finalización no puede ser anterior al inicio", () => {
    expect(contractSchema.safeParse({ ...contract, end_date: "2026-09-01" }).success).toBe(false);
  });
  it("IVA solo si se indica explícitamente", () => {
    expect(contractSchema.parse({ ...contract, tax_rate: "21" }).tax_rate).toBe(21);
    expect(contractSchema.safeParse({ ...contract, tax_rate: "121" }).success).toBe(false);
  });
});

describe("cobros", () => {
  it("el importe previsto debe ser mayor que cero", () => {
    const base = { client_id: UUID, client_service_id: "", concept: "Cuota", amount_due: "0", tax_rate: "", currency: "EUR", due_date: "2026-10-31", invoice_ref: "", notes: "" };
    expect(paymentSchema.safeParse(base).success).toBe(false);
    expect(paymentSchema.parse({ ...base, amount_due: "450" }).amount_due).toBe(45000);
  });
  it("movimiento con clave de idempotencia", () => {
    const r = transactionSchema.safeParse({ payment_id: UUID, amount: "100", paid_on: "2026-10-16", method: "", note: "", idempotency_key: "short" });
    expect(r.success).toBe(false);
  });
});

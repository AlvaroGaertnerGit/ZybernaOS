import "server-only";

import {
  BILLING_TYPE_META,
  CLIENT_STATUS_META,
  CONTRACT_STATUS_META,
  INTERVAL_UNIT_META,
  PAYMENT_STATUS_META,
  PERIODICITY_META,
} from "@/lib/domain";
import type { SheetRows } from "@/lib/excel/workbook";
import type { ImportContext } from "@/lib/excel/validate";
import type { ServerSupabase } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/fetch-all";
import { searchTerm } from "./common";

const units = (cents: number | null) => (cents === null ? null : cents / 100);

export interface ExportFilters {
  q?: string;
  status?: string;
  owner?: string;
  archived?: boolean;
  client?: string;
  from?: string;
  to?: string;
}

/**
 * Datos para exportación con el mismo esquema que la importación. Los códigos
 * preservan las relaciones entre hojas.
 */
export async function exportRows(
  supabase: ServerSupabase,
  type: "clients" | "contracts" | "payments" | "all",
  filters: ExportFilters = {},
): Promise<SheetRows> {
  const members = await fetchAll((f, t) => supabase.from("profiles").select("id, email").order("id").range(f, t), "los miembros");
  const ownerEmail = new Map(members.map((m) => [m.id, m.email]));
  const rows: SheetRows = {};

  if (type === "clients" || type === "all") {
    const clients = await fetchAll((from, to) => {
      let q = supabase.from("clients").select("*").order("code").range(from, to);
      if (type === "clients") {
        q = filters.archived ? q.not("archived_at", "is", null) : q.is("archived_at", null);
        if (filters.status && filters.status in CLIENT_STATUS_META) q = q.eq("status", filters.status as keyof typeof CLIENT_STATUS_META);
        if (filters.owner) q = filters.owner === "none" ? q.is("owner_id", null) : q.eq("owner_id", filters.owner);
        const term = searchTerm(filters.q);
        if (term) q = q.or(`trade_name.ilike.%${term}%,contact_name.ilike.%${term}%,email.ilike.%${term}%,code.ilike.%${term}%`);
      }
      return q;
    }, "los clientes");
    rows.clients = clients.map((c) => ({
      codigo_cliente: c.code,
      nombre_comercial: c.trade_name,
      razon_social: c.legal_name,
      cif_nif: c.tax_id,
      contacto: c.contact_name,
      email: c.email,
      telefono: c.phone,
      web: c.website,
      sector: c.sector,
      estado: CLIENT_STATUS_META[c.status].excel,
      responsable: c.owner_id ? ownerEmail.get(c.owner_id) : null,
      fecha_alta: c.joined_on,
      notas: c.notes,
    }));
  }

  if (type === "contracts" || type === "all") {
    const contracts = await fetchAll((f, t) => supabase.from("client_services_view").select("*").order("code").range(f, t), "las contrataciones");
    rows.contracts = contracts.map((c) => ({
      codigo_contratacion: c.code,
      codigo_cliente: c.client_code,
      categoria: c.category_slug,
      servicio: c.catalog_name,
      nombre_plan: c.name,
      descripcion: c.description,
      precio: units(c.amount_cents),
      impuesto_pct: c.tax_rate,
      moneda: c.currency,
      tipo_cobro: BILLING_TYPE_META[c.billing_type].excel,
      periodicidad: c.periodicity ? PERIODICITY_META[c.periodicity].excel : null,
      intervalo_cada: c.interval_count,
      intervalo_unidad: c.interval_unit ? INTERVAL_UNIT_META[c.interval_unit].excel : null,
      fecha_inicio: c.start_date,
      fecha_fin: c.end_date,
      proxima_renovacion: c.next_renewal_date,
      estado: CONTRACT_STATUS_META[c.status].excel,
      responsable: c.owner_id ? ownerEmail.get(c.owner_id) : null,
      notas: c.notes,
    }));
    const codeById = new Map(contracts.map((c) => [c.id, c.code]));
    const deliverables = await fetchAll(
      (f, t) =>
        supabase.from("client_service_deliverables").select("client_service_id, position, title, description").order("id").range(f, t),
      "las prestaciones",
    );
    rows.deliverables = deliverables
      .filter((d) => codeById.has(d.client_service_id))
      .sort((a, b) => (codeById.get(a.client_service_id)! < codeById.get(b.client_service_id)! ? -1 : 1) || a.position - b.position)
      .map((d) => ({
        codigo_contratacion: codeById.get(d.client_service_id),
        orden: d.position,
        prestacion: d.title,
        descripcion: d.description,
      }));
  }

  if (type === "payments" || type === "all") {
    const payments = await fetchAll((from, to) => {
      let q = supabase.from("payments_view").select("*").order("code").range(from, to);
      if (type === "payments") {
        const statuses = (filters.status ?? "").split(",").filter((s) => s in PAYMENT_STATUS_META) as (keyof typeof PAYMENT_STATUS_META)[];
        if (statuses.length) q = q.in("status", statuses);
        if (filters.client) q = q.eq("client_id", filters.client);
        if (filters.from) q = q.gte("due_date", filters.from);
        if (filters.to) q = q.lte("due_date", filters.to);
        const term = searchTerm(filters.q);
        if (term) q = q.or(`concept.ilike.%${term}%,client_name.ilike.%${term}%,code.ilike.%${term}%`);
      }
      return q;
    }, "los cobros");
    rows.payments = payments.map((p) => ({
      codigo_cobro: p.code,
      codigo_cliente: p.client_code,
      codigo_contratacion: p.contract_code,
      concepto: p.concept,
      importe: units(p.amount_due_cents),
      impuesto_pct: p.tax_rate,
      moneda: p.currency,
      fecha_vencimiento: p.due_date,
      estado: PAYMENT_STATUS_META[p.status].excel,
      fecha_cobro: p.last_paid_on,
      importe_cobrado: p.amount_paid_cents ? units(p.amount_paid_cents) : null,
      referencia_factura: p.invoice_ref,
      notas: p.notes,
    }));
  }
  return rows;
}

/** Contexto de base de datos necesario para validar una importación. */
export async function importContext(supabase: ServerSupabase): Promise<ImportContext> {
  const [categories, catalog, members, clients, contracts, payments] = await Promise.all([
    fetchAll((f, t) => supabase.from("service_categories").select("id, slug, name").order("id").range(f, t), "las categorías"),
    fetchAll((f, t) => supabase.from("service_catalog").select("id, category_id, name").order("id").range(f, t), "el catálogo"),
    fetchAll((f, t) => supabase.from("profiles").select("id, email, full_name").eq("is_active", true).order("id").range(f, t), "los miembros"),
    fetchAll((f, t) => supabase.from("clients").select("code, email, trade_name").order("code").range(f, t), "los clientes"),
    fetchAll((f, t) => supabase.from("client_services_view").select("code, client_code").order("code").range(f, t), "las contrataciones"),
    fetchAll((f, t) => supabase.from("payments_view").select("code, client_code").order("code").range(f, t), "los cobros"),
  ]);
  return {
    categories,
    catalog,
    members,
    existingClients: clients,
    existingContracts: contracts,
    existingPayments: payments,
  };
}

// Tipos del esquema public. Mantener sincronizado con supabase/migrations.
// Regenerables con: npx supabase gen types typescript --project-id <ref> > src/types/database.ts

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type AppRole = "admin" | "member";
type ClientStatus = "lead" | "negotiation" | "active" | "paused" | "finished";
type CatalogStatus = "active" | "inactive";
type BillingType = "one_time" | "recurring";
type Periodicity = "monthly" | "quarterly" | "semiannual" | "annual" | "custom";
type IntervalUnit = "day" | "week" | "month" | "year";
type ContractStatus = "draft" | "active" | "paused" | "finished" | "cancelled";
type PaymentStatus = "pending" | "partial" | "paid" | "overdue" | "void";
type TransactionKind = "payment" | "adjustment";

type Table<Row, Required extends keyof Row, Generated extends keyof Row = never> = {
  Row: Row;
  Insert: Pick<Row, Required> & Partial<Omit<Row, Required | Generated>>;
  Update: Partial<Omit<Row, Generated>>;
  Relationships: [];
};

export type ProfileRow = {
  id: string;
  email: string;
  full_name: string;
  role: AppRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type AgencySettingsRow = {
  id: boolean;
  name: string;
  legal_name: string | null;
  tax_id: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  default_currency: string;
  default_tax_rate: number | null;
  updated_at: string;
}

export type ServiceCategoryRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type ServiceCatalogRow = {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  default_price_cents: number | null;
  currency: string;
  suggested_billing_type: BillingType;
  suggested_periodicity: Periodicity | null;
  status: CatalogStatus;
  created_at: string;
  updated_at: string;
}

export type DeliverableRow = {
  id: string;
  position: number;
  title: string;
  description: string | null;
  created_at: string;
}
export type CatalogDeliverableRow = DeliverableRow & {
  service_id: string;
}
export type ContractDeliverableRow = DeliverableRow & {
  client_service_id: string;
}

export type ClientRow = {
  id: string;
  code: string;
  trade_name: string;
  legal_name: string | null;
  tax_id: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  sector: string | null;
  status: ClientStatus;
  owner_id: string | null;
  joined_on: string;
  notes: string | null;
  archived_at: string | null;
  import_batch_id: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export type ClientNoteRow = {
  id: string;
  client_id: string;
  body: string;
  author_id: string | null;
  created_at: string;
}

export type ContractRow = {
  id: string;
  code: string;
  client_id: string;
  service_id: string | null;
  category_id: string;
  name: string;
  description: string | null;
  amount_cents: number;
  tax_rate: number | null;
  currency: string;
  billing_type: BillingType;
  periodicity: Periodicity | null;
  interval_count: number | null;
  interval_unit: IntervalUnit | null;
  start_date: string;
  end_date: string | null;
  next_renewal_date: string | null;
  status: ContractStatus;
  owner_id: string | null;
  notes: string | null;
  mrr_cents: number;
  import_batch_id: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export type PaymentRow = {
  id: string;
  code: string;
  client_id: string;
  client_service_id: string | null;
  concept: string;
  amount_due_cents: number;
  tax_rate: number | null;
  currency: string;
  due_date: string;
  period_start: string | null;
  amount_paid_cents: number;
  last_paid_on: string | null;
  voided_at: string | null;
  invoice_ref: string | null;
  notes: string | null;
  import_batch_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type TransactionRow = {
  id: string;
  payment_id: string;
  kind: TransactionKind;
  amount_cents: number;
  paid_on: string;
  method: string | null;
  note: string | null;
  idempotency_key: string;
  created_by: string | null;
  created_at: string;
}

export type ActivityRow = {
  id: number;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  client_id: string | null;
  summary: string;
  metadata: Json;
  created_at: string;
}

export type ImportBatchRow = {
  id: string;
  created_by: string | null;
  file_name: string | null;
  file_sha256: string | null;
  mode: string;
  summary: Json;
  created_at: string;
}

export type ClientsViewRow = ClientRow & {
  active_services: number;
  mrr_cents: number;
  owner_name: string | null;
}

export type PaymentsViewRow = PaymentRow & {
  amount_outstanding_cents: number;
  status: PaymentStatus;
  client_name: string;
  client_code: string;
  contract_name: string | null;
  contract_code: string | null;
}

export type ContractsViewRow = ContractRow & {
  client_name: string;
  client_code: string;
  category_name: string;
  category_slug: string;
  catalog_name: string | null;
  owner_name: string | null;
}

type View<Row> = { Row: Row; Relationships: [] };

export type Database = {
  public: {
    Tables: {
      profiles: Table<ProfileRow, "id" | "email">;
      agency_settings: Table<AgencySettingsRow, never>;
      service_categories: Table<ServiceCategoryRow, "slug" | "name", "id">;
      service_catalog: Table<ServiceCatalogRow, "category_id" | "name", "id">;
      service_catalog_deliverables: Table<CatalogDeliverableRow, "service_id" | "title", "id">;
      clients: Table<ClientRow, "trade_name", "id">;
      client_notes: Table<ClientNoteRow, "client_id" | "body", "id">;
      client_services: Table<
        ContractRow,
        "client_id" | "category_id" | "name" | "amount_cents" | "billing_type",
        "id" | "mrr_cents"
      >;
      client_service_deliverables: Table<ContractDeliverableRow, "client_service_id" | "title", "id">;
      payments: Table<PaymentRow, "client_id" | "concept" | "amount_due_cents" | "due_date", "id" | "amount_paid_cents" | "last_paid_on">;
      payment_transactions: Table<TransactionRow, "payment_id" | "amount_cents" | "idempotency_key", "id">;
      activity_log: Table<ActivityRow, "action" | "entity_type" | "summary", "id">;
      import_batches: Table<ImportBatchRow, "mode", "id">;
    };
    Views: {
      clients_view: View<ClientsViewRow>;
      payments_view: View<PaymentsViewRow>;
      client_services_view: View<ContractsViewRow>;
    };
    Functions: {
      is_member: { Args: Record<string, never>; Returns: boolean };
      is_admin: { Args: Record<string, never>; Returns: boolean };
      create_scheduled_payments: { Args: { p_contract_id: string; p_items: Json }; Returns: number };
      replace_contract_deliverables: { Args: { p_contract_id: string; p_items: Json }; Returns: undefined };
      replace_catalog_deliverables: { Args: { p_service_id: string; p_items: Json }; Returns: undefined };
      save_contract: { Args: { p_id: string | null; p_values: Json; p_deliverables?: Json | null }; Returns: Json };
      create_client_with_contracts: { Args: { p_client: Json; p_contracts: Json }; Returns: Json };
      import_workbook: {
        Args: { p_payload: Json; p_mode: string; p_file_name?: string; p_file_sha256?: string };
        Returns: Json;
      };
    };
    Enums: {
      app_role: AppRole;
      client_status: ClientStatus;
      catalog_status: CatalogStatus;
      billing_type: BillingType;
      periodicity: Periodicity;
      interval_unit: IntervalUnit;
      contract_status: ContractStatus;
      payment_status: PaymentStatus;
      transaction_kind: TransactionKind;
    };
    CompositeTypes: Record<string, never>;
  };
}

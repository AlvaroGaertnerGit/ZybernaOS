/**
 * Esquema único del libro Excel de Zyberna. Lo comparten la plantilla, la
 * exportación y la importación: un libro exportado se puede reimportar tal cual.
 */

import {
  BILLING_TYPE_META,
  CLIENT_STATUS_META,
  CONTRACT_STATUS_META,
  CURRENCIES,
  INTERVAL_UNIT_META,
  PAYMENT_STATUS_META,
  PERIODICITY_META,
  VARIABLE_BASIS_META,
} from "@/lib/domain";

export type ColumnKind = "text" | "code" | "email" | "date" | "money" | "percent" | "integer" | "list";

export interface SheetColumn {
  key: string;
  required?: boolean;
  kind: ColumnKind;
  width: number;
  description: string;
  /** Nombre de la lista de CATALOGOS que valida la columna. */
  list?: ListName;
}

export const LISTS = {
  estados_cliente: Object.values(CLIENT_STATUS_META).map((m) => m.excel),
  estados_contratacion: Object.values(CONTRACT_STATUS_META).map((m) => m.excel),
  estados_cobro: Object.values(PAYMENT_STATUS_META).map((m) => m.excel),
  tipos_cobro: Object.values(BILLING_TYPE_META).map((m) => m.excel),
  periodicidades: Object.values(PERIODICITY_META).map((m) => m.excel),
  unidades_intervalo: Object.values(INTERVAL_UNIT_META).map((m) => m.excel),
  monedas: [...CURRENCIES],
  bases_variable: Object.values(VARIABLE_BASIS_META).map((m) => m.excel),
} as const;
export type ListName = keyof typeof LISTS | "categorias";

export const SHEETS = {
  clients: {
    name: "CLIENTES",
    columns: [
      { key: "codigo_cliente", required: true, kind: "code", width: 16, description: "Código único del cliente. Relaciona las demás hojas. Ej. CLI-0001" },
      { key: "nombre_comercial", required: true, kind: "text", width: 28, description: "Nombre comercial" },
      { key: "razon_social", kind: "text", width: 28, description: "Razón social (opcional)" },
      { key: "cif_nif", kind: "text", width: 14, description: "CIF/NIF (opcional)" },
      { key: "contacto", kind: "text", width: 22, description: "Persona de contacto" },
      { key: "email", kind: "email", width: 28, description: "Email de contacto" },
      { key: "telefono", kind: "text", width: 16, description: "Teléfono" },
      { key: "web", kind: "text", width: 24, description: "Web" },
      { key: "sector", kind: "text", width: 18, description: "Sector (opcional)" },
      { key: "estado", kind: "list", list: "estados_cliente", width: 14, description: "potencial, negociacion, activo, pausado o finalizado" },
      { key: "responsable", kind: "text", width: 24, description: "Email o nombre del socio responsable" },
      { key: "fecha_alta", kind: "date", width: 13, description: "Fecha de alta (dd/mm/aaaa). Vacío = hoy" },
      { key: "notas", kind: "text", width: 36, description: "Notas internas" },
    ],
  },
  contracts: {
    name: "CONTRATACIONES",
    columns: [
      { key: "codigo_contratacion", required: true, kind: "code", width: 18, description: "Código único de la contratación. Ej. CON-0001" },
      { key: "codigo_cliente", required: true, kind: "code", width: 16, description: "Código del cliente (hoja CLIENTES o ya existente)" },
      { key: "categoria", required: true, kind: "list", list: "categorias", width: 22, description: "Categoría del catálogo" },
      { key: "servicio", kind: "text", width: 26, description: "Servicio o plan del catálogo (nombre o identificador). Aplica sus reglas: planes alternativos, dependencias e incompatibilidades" },
      { key: "nombre_plan", required: true, kind: "text", width: 26, description: "Nombre de la contratación (puede personalizarse)" },
      { key: "proyecto", kind: "text", width: 20, description: "Proyecto o web (opcional). Permite el mismo plan para webs distintas del cliente" },
      { key: "descripcion", kind: "text", width: 32, description: "Descripción" },
      { key: "precio", required: true, kind: "money", width: 12, description: "Precio acordado por periodo (o total si es pago único), sin impuestos" },
      { key: "tarifa_catalogo", kind: "money", width: 15, description: "Solo informativo (exportación): tarifa del catálogo al contratar. Se ignora al importar" },
      { key: "impuesto_pct", kind: "percent", width: 12, description: "Impuesto en % (opcional; vacío = sin impuesto)" },
      { key: "moneda", kind: "list", list: "monedas", width: 9, description: "EUR por defecto" },
      { key: "tipo_cobro", required: true, kind: "list", list: "tipos_cobro", width: 12, description: "Modalidad: unico o recurrente" },
      { key: "periodicidad", kind: "list", list: "periodicidades", width: 14, description: "Modalidad: obligatoria si es recurrente" },
      { key: "intervalo_cada", kind: "integer", width: 13, description: "Solo periodicidad personalizada: cada cuántas unidades" },
      { key: "intervalo_unidad", kind: "list", list: "unidades_intervalo", width: 15, description: "Solo personalizada: dias, semanas, meses o anos" },
      { key: "fecha_inicio", required: true, kind: "date", width: 13, description: "Fecha de inicio" },
      { key: "fecha_fin", kind: "date", width: 13, description: "Fecha de finalización (opcional)" },
      { key: "proxima_renovacion", kind: "date", width: 16, description: "Próxima renovación (opcional)" },
      { key: "variable_pct", kind: "percent", width: 12, description: "Componente variable en % (opcional, p. ej. 8)" },
      { key: "variable_base", kind: "list", list: "bases_variable", width: 14, description: "Base del variable: beneficios, ingresos o facturacion" },
      { key: "estado", kind: "list", list: "estados_contratacion", width: 13, description: "borrador, activo, pausado, finalizado o cancelado" },
      { key: "responsable", kind: "text", width: 24, description: "Email o nombre del socio responsable" },
      { key: "notas", kind: "text", width: 32, description: "Notas" },
    ],
  },
  deliverables: {
    name: "PRESTACIONES",
    columns: [
      { key: "codigo_contratacion", required: true, kind: "code", width: 18, description: "Código de la contratación" },
      { key: "orden", kind: "integer", width: 8, description: "Orden de la prestación (1, 2, 3…)" },
      { key: "prestacion", required: true, kind: "text", width: 36, description: "Prestación incluida" },
      { key: "descripcion", kind: "text", width: 40, description: "Detalle (opcional)" },
    ],
  },
  payments: {
    name: "COBROS",
    columns: [
      { key: "codigo_cobro", required: true, kind: "code", width: 16, description: "Código único del cobro. Ej. COB-00001" },
      { key: "codigo_cliente", required: true, kind: "code", width: 16, description: "Código del cliente" },
      { key: "codigo_contratacion", kind: "code", width: 18, description: "Código de la contratación (opcional)" },
      { key: "concepto", required: true, kind: "text", width: 30, description: "Concepto" },
      { key: "importe", required: true, kind: "money", width: 12, description: "Importe previsto (sin impuestos)" },
      { key: "impuesto_pct", kind: "percent", width: 12, description: "Impuesto en % (opcional)" },
      { key: "moneda", kind: "list", list: "monedas", width: 9, description: "EUR por defecto" },
      { key: "fecha_vencimiento", required: true, kind: "date", width: 16, description: "Fecha de vencimiento" },
      { key: "estado", kind: "list", list: "estados_cobro", width: 13, description: "Solo «anulado» cambia datos; el resto se calcula a partir de los importes" },
      { key: "fecha_cobro", kind: "date", width: 13, description: "Fecha del cobro (si hay importe cobrado)" },
      { key: "importe_cobrado", kind: "money", width: 15, description: "Importe ya cobrado (total o parcial)" },
      { key: "referencia_factura", kind: "text", width: 18, description: "Nº de factura (opcional)" },
      { key: "notas", kind: "text", width: 30, description: "Notas" },
    ],
  },
} as const satisfies Record<string, { name: string; columns: readonly SheetColumn[] }>;

export type SheetKey = keyof typeof SHEETS;
export const SHEET_ORDER: SheetKey[] = ["clients", "contracts", "deliverables", "payments"];

export const TEMPLATE_FILE_NAME = "ZYBERNA_Plantilla_Clientes.xlsx";
export const EXAMPLE_PREFIX = "EJEMPLO-";

export const IMPORT_LIMITS = {
  maxBytes: 4 * 1024 * 1024, // margen holgado bajo los límites de cuerpo de petición de Workers y Vercel
  maxRowsPerSheet: 5_000,
  maxTotalRows: 15_000,
} as const;

/**
 * Evita la inyección de fórmulas (CSV/Excel injection) en contenido introducido por
 * usuarios: un texto que empieza por =, +, -, @, tab o retorno se prefija con
 * apóstrofo. Se conserva "+34 600…" (teléfonos) y los números negativos se exportan como número.
 */
export function sanitizeCellText(value: string): string {
  if (/^[=@\t\r]/.test(value) || /^[+-](?![\d\s(])/.test(value)) return `'${value}`;
  return value;
}

/** Inversa de sanitizeCellText al importar. */
export function unsanitizeCellText(value: string): string {
  if (/^'[=@+\-\t\r]/.test(value)) return value.slice(1);
  return value;
}

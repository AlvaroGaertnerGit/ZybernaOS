/**
 * Reglas de combinación del catálogo. Lógica pura compartida por los formularios
 * (selección en tiempo real), la importación Excel y las pruebas. La garantía final
 * la da la base de datos (trigger `check_contract_rules`), con la misma semántica:
 *
 * - Alternativas: servicios con el mismo `exclusive_group` → solo uno por cliente y proyecto.
 * - Incompatibles: `excludes` (por key, en cualquiera de los dos sentidos).
 * - Dependencias: `requires_any` → necesita uno de esos servicios ("key" o "group:<grupo>").
 * - Ámbito: contrataciones vivas (borrador, activa, pausada) del mismo cliente y proyecto.
 *
 * Todo se referencia por identificadores estables (id / key), nunca por el nombre visible.
 */

import { LIVE_CONTRACT_STATUSES } from "@/lib/domain";

export interface RuleService {
  id: string;
  key: string;
  name: string;
  exclusive_group: string | null;
  requires_any: readonly string[];
  excludes: readonly string[];
  /** Solo para ordenar las opciones en los mensajes (a medida al final). */
  default_price_cents?: number | null;
}

export interface RuleItem {
  service_id: string | null;
  project?: string | null;
  status?: string | null;
}

export type ConflictKind = "alternative" | "excluded";

export type Violation =
  | { kind: ConflictKind; index: number; other: number; message: string }
  | { kind: "requires"; index: number; message: string };

/** Clave de proyecto normalizada (igual que en SQL: lower(trim(coalesce(project, '')))). */
export function projectKey(project: string | null | undefined): string {
  return (project ?? "").trim().toLowerCase();
}

export function isLiveStatus(status: string | null | undefined): boolean {
  return !status || (LIVE_CONTRACT_STATUSES as readonly string[]).includes(status);
}

/** ¿Pueden coexistir dos servicios en el mismo cliente y proyecto? */
export function conflictBetween(a: RuleService, b: RuleService): ConflictKind | null {
  if (a.id === b.id) return null;
  if (a.exclusive_group && a.exclusive_group === b.exclusive_group) return "alternative";
  if (a.excludes.includes(b.key) || b.excludes.includes(a.key)) return "excluded";
  return null;
}

/** ¿El servicio `s` satisface la referencia de dependencia `ref`? */
export function satisfies(ref: string, s: RuleService): boolean {
  return ref.startsWith("group:") ? s.exclusive_group === ref.slice(6) : s.key === ref;
}

/** Servicios del catálogo que cumplen alguna de las dependencias de `svc`. */
export function requirementOptions(svc: RuleService, catalog: readonly RuleService[]): RuleService[] {
  // Mismo orden que en SQL: por tarifa (a medida al final) y luego por nombre.
  const price = (s: RuleService) => s.default_price_cents ?? Number.MAX_SAFE_INTEGER;
  return catalog
    .filter((s) => s.id !== svc.id && svc.requires_any.some((ref) => satisfies(ref, s)))
    .sort((a, b) => price(a) - price(b) || a.name.localeCompare(b.name));
}

export function requirementLabel(svc: RuleService, catalog: readonly RuleService[]): string {
  const names = requirementOptions(svc, catalog).map((s) => s.name);
  return names.length ? names.join(", ") : svc.requires_any.join(", ");
}

export function conflictMessage(kind: ConflictKind, a: { name: string }, b: { name: string }): string {
  return kind === "alternative"
    ? `«${a.name}» y «${b.name}» son alternativas: solo puede haber una por cliente y proyecto.`
    : `«${a.name}» no es compatible con «${b.name}» en el mismo cliente y proyecto.`;
}

export function requiresMessage(svc: RuleService, catalog: readonly RuleService[]): string {
  return `«${svc.name}» requiere contratar también uno de estos servicios para el mismo proyecto: ${requirementLabel(svc, catalog)}.`;
}

/**
 * Valida un conjunto de contrataciones (p. ej. selección de un alta, o filas de un
 * Excel junto con las contrataciones vivas existentes). Cada conflicto se informa
 * una vez, en el elemento posterior. `checkRequires(i)` limita qué elementos deben
 * cumplir sus dependencias (por defecto, todos).
 */
export function findViolations(
  items: readonly RuleItem[],
  catalog: readonly RuleService[],
  opts: { checkRequires?: (index: number) => boolean; checkPair?: (a: number, b: number) => boolean } = {},
): Violation[] {
  const byId = new Map(catalog.map((s) => [s.id, s]));
  const live = items.map((it) => (it.service_id && isLiveStatus(it.status) ? byId.get(it.service_id) ?? null : null));
  const proj = items.map((it) => projectKey(it.project));
  const out: Violation[] = [];

  for (let j = 0; j < items.length; j++) {
    const b = live[j];
    if (!b) continue;
    for (let i = 0; i < j; i++) {
      const a = live[i];
      if (!a || proj[i] !== proj[j] || (opts.checkPair && !opts.checkPair(i, j))) continue;
      const kind = conflictBetween(a, b);
      if (kind) {
        out.push({ kind, index: j, other: i, message: conflictMessage(kind, b, a) });
        break;
      }
    }
  }

  for (let i = 0; i < items.length; i++) {
    const s = live[i];
    if (!s || s.requires_any.length === 0 || (opts.checkRequires && !opts.checkRequires(i))) continue;
    const ok = live.some((o, j) => j !== i && o && proj[j] === proj[i] && s.requires_any.some((ref) => satisfies(ref, o)));
    if (!ok) out.push({ kind: "requires", index: i, message: requiresMessage(s, catalog) });
  }
  return out;
}

/**
 * Selección en un formulario: marcar `id` desmarca automáticamente las alternativas y
 * los servicios incompatibles ya seleccionados. Devuelve la nueva selección y lo quitado.
 */
export function selectService(
  selected: readonly string[],
  id: string,
  catalog: readonly RuleService[],
): { selected: string[]; removed: string[] } {
  const byId = new Map(catalog.map((s) => [s.id, s]));
  const svc = byId.get(id);
  if (!svc) return { selected: selected.includes(id) ? [...selected] : [...selected, id], removed: [] };
  const removed: string[] = [];
  const next: string[] = [];
  for (const other of selected) {
    const o = byId.get(other);
    if (other !== id && o && conflictBetween(svc, o)) removed.push(other);
    else if (other !== id) next.push(other);
  }
  next.push(id);
  return { selected: next, removed };
}

/** Dependencias no cumplidas de `id` dentro de una selección. */
export function hasUnmetRequirements(id: string, selected: readonly string[], catalog: readonly RuleService[]): boolean {
  const byId = new Map(catalog.map((s) => [s.id, s]));
  const svc = byId.get(id);
  if (!svc || svc.requires_any.length === 0) return false;
  return !selected.some((other) => {
    const o = byId.get(other);
    return other !== id && o !== undefined && svc.requires_any.some((ref) => satisfies(ref, o));
  });
}

/**
 * ¿Hay que exigir las dependencias al guardar? Igual que el trigger de la BD: al contratar
 * (sin estado previo), al cambiar de servicio o al reactivar una contratación cerrada.
 */
export function shouldCheckRequires(
  previous: { service_id: string | null; status?: string | null } | null | undefined,
  nextServiceId: string | null,
): boolean {
  return !previous || previous.service_id !== nextServiceId || previous.status === "finished" || previous.status === "cancelled";
}

/**
 * Comprueba una contratación nueva o editada frente a las vivas del mismo cliente.
 * Útil en el formulario de contratación individual.
 */
export function checkAgainstExisting(
  candidate: RuleItem & { id?: string | null },
  existing: readonly (RuleItem & { id: string; name: string; code?: string })[],
  catalog: readonly RuleService[],
  { checkRequires = true }: { checkRequires?: boolean } = {},
): string[] {
  const others = existing.filter((e) => e.id !== candidate.id);
  const items: RuleItem[] = [...others, candidate];
  const last = items.length - 1;
  return findViolations(items, catalog, {
    checkRequires: (i) => checkRequires && i === last,
    checkPair: (_a, b) => b === last,
  })
    .filter((v) => v.index === last)
    .map((v) => {
      if (v.kind === "requires") return v.message;
      const o = others[v.other];
      return `${v.message.replace(/\.$/, "")} (ya contratado${o.code ? `: ${o.code}` : ""}).`;
    });
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { catalogServiceSchema, categorySchema } from "@/lib/validations/schemas";
import { uuid, type ActionResult } from "@/lib/validations/common";
import { normalizeToken } from "@/lib/domain";
import { dbErrorMessage, memberAction } from "./_helpers";

function revalidateCatalog() {
  revalidatePath("/servicios");
  revalidatePath("/configuracion");
}

export async function saveCatalogServiceAction(id: string | null, input: unknown): Promise<ActionResult<{ id: string }>> {
  return memberAction(
    z.object({ id: uuid.nullable(), values: catalogServiceSchema }),
    { id, values: input },
    async ({ id, values }, { supabase }) => {
      // Servicio, prestaciones y modalidades en una única transacción. La key (identificador
      // estable de las reglas) la genera la base de datos al crear y no cambia después.
      const { deliverables, modalities, default_price, ...rest } = values;
      const { data, error } = await supabase.rpc("save_catalog_service", {
        p_id: id,
        p_values: { ...rest, default_price_cents: default_price },
        p_deliverables: deliverables,
        p_modalities: modalities,
      });
      if (error) return { ok: false, error: dbErrorMessage(error) };
      revalidateCatalog();
      revalidatePath("/clientes/nuevo");
      revalidatePath("/contrataciones/nueva");
      return { ok: true, data: { id: data as string }, message: id ? "Servicio actualizado." : "Servicio creado." };
    },
  );
}

export async function deleteCatalogServiceAction(id: string): Promise<ActionResult> {
  return memberAction(uuid, id, async (serviceId, { supabase }) => {
    // Las contrataciones conservan sus datos y prestaciones (copias); solo pierden el vínculo.
    const { error } = await supabase.from("service_catalog").delete().eq("id", serviceId);
    if (error) return { ok: false, error: dbErrorMessage(error) };
    revalidateCatalog();
    return { ok: true, data: undefined, message: "Servicio eliminado del catálogo." };
  });
}

function slugify(name: string) {
  return normalizeToken(name).replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "categoria";
}

export async function saveCategoryAction(id: string | null, input: unknown): Promise<ActionResult<{ id: string }>> {
  return memberAction(
    z.object({ id: uuid.nullable(), values: categorySchema }),
    { id, values: input },
    async ({ id, values }, { supabase }) => {
      if (id) {
        const { error } = await supabase.from("service_categories").update(values).eq("id", id);
        if (error) return { ok: false, error: dbErrorMessage(error) };
        revalidateCatalog();
        return { ok: true, data: { id }, message: "Categoría actualizada." };
      }
      const { data: last } = await supabase
        .from("service_categories")
        .select("sort_order")
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      const { data, error } = await supabase
        .from("service_categories")
        .insert({ ...values, slug: slugify(values.name), sort_order: (last?.sort_order ?? 0) + 10 })
        .select("id")
        .single();
      if (error) return { ok: false, error: dbErrorMessage(error) };
      revalidateCatalog();
      return { ok: true, data: { id: data.id }, message: "Categoría creada." };
    },
  );
}

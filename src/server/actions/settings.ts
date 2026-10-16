"use server";

import { revalidatePath } from "next/cache";
import { agencySettingsSchema, profileSchema } from "@/lib/validations/schemas";
import type { ActionResult } from "@/lib/validations/common";
import { dbErrorMessage, memberAction } from "./_helpers";

export async function updateAgencySettingsAction(input: unknown): Promise<ActionResult> {
  return memberAction(agencySettingsSchema, input, async (data, { supabase }) => {
    const { error } = await supabase.from("agency_settings").update(data).eq("id", true);
    if (error) return { ok: false, error: dbErrorMessage(error) };
    revalidatePath("/", "layout");
    return { ok: true, data: undefined, message: "Datos de la agencia guardados." };
  });
}

export async function updateProfileAction(input: unknown): Promise<ActionResult> {
  return memberAction(profileSchema, input, async (data, { supabase, member }) => {
    const { error } = await supabase.from("profiles").update({ full_name: data.full_name }).eq("id", member.id);
    if (error) return { ok: false, error: dbErrorMessage(error) };
    revalidatePath("/", "layout");
    return { ok: true, data: undefined, message: "Perfil actualizado." };
  });
}

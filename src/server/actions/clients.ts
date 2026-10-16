"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { clientNoteSchema, clientSchema, wizardContractSchema } from "@/lib/validations/schemas";
import { uuid } from "@/lib/validations/common";
import type { ActionResult } from "@/lib/validations/common";
import type { Database } from "@/types/database";

type ClientInsert = Database["public"]["Tables"]["clients"]["Insert"];
import { dbErrorMessage, memberAction } from "./_helpers";
import { contractRow } from "./contracts-core";

function revalidateClients(id?: string) {
  revalidatePath("/clientes");
  revalidatePath("/dashboard");
  if (id) revalidatePath(`/clientes/${id}`);
}

export async function createClientAction(input: unknown): Promise<ActionResult<{ id: string; code: string }>> {
  return memberAction(clientSchema, input, async (data, { supabase }) => {
    const { code, ...rest } = data;
    const payload: ClientInsert = code ? { ...rest, code } : rest;
    const { data: row, error } = await supabase
      .from("clients")
      .insert(payload)
      .select("id, code")
      .single();
    if (error) return { ok: false, error: dbErrorMessage(error) };
    revalidateClients();
    return { ok: true, data: row, message: "Cliente creado." };
  });
}

const wizardSchema = z.object({
  client: clientSchema,
  contracts: z.array(wizardContractSchema).max(20),
});

/** Alta guiada: cliente + contrataciones + prestaciones en una única transacción. */
export async function createClientWithContractsAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return memberAction(wizardSchema, input, async ({ client, contracts }, { supabase }) => {
    const { data, error } = await supabase.rpc("create_client_with_contracts", {
      p_client: client,
      p_contracts: contracts.map((c) => ({ values: contractRow({ ...c, code: null }), deliverables: c.deliverables })),
    });
    if (error) return { ok: false, error: dbErrorMessage(error) };
    const { id } = data as { id: string };
    revalidateClients(id);
    revalidatePath("/contrataciones");
    return {
      ok: true,
      data: { id },
      message: contracts.length ? `Cliente creado con ${contracts.length} contratación(es).` : "Cliente creado.",
    };
  });
}

export async function updateClientAction(id: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  return memberAction(z.object({ id: uuid, values: clientSchema }), { id, values: input }, async ({ id, values }, { supabase }) => {
    const { code, ...rest } = values;
    const patch = code ? { ...rest, code } : rest;
    const { error } = await supabase.from("clients").update(patch).eq("id", id);
    if (error) return { ok: false, error: dbErrorMessage(error) };
    revalidateClients(id);
    return { ok: true, data: { id }, message: "Cambios guardados." };
  });
}

export async function setClientArchivedAction(id: string, archived: boolean): Promise<ActionResult> {
  return memberAction(z.object({ id: uuid, archived: z.boolean() }), { id, archived }, async (v, { supabase }) => {
    const { error } = await supabase
      .from("clients")
      .update({ archived_at: v.archived ? new Date().toISOString() : null })
      .eq("id", v.id);
    if (error) return { ok: false, error: dbErrorMessage(error) };
    revalidateClients(v.id);
    return { ok: true, data: undefined, message: v.archived ? "Cliente archivado." : "Cliente restaurado." };
  });
}

export async function addClientNoteAction(input: unknown): Promise<ActionResult> {
  return memberAction(clientNoteSchema, input, async (data, { supabase }) => {
    const { error } = await supabase.from("client_notes").insert(data);
    if (error) return { ok: false, error: dbErrorMessage(error) };
    revalidatePath(`/clientes/${data.client_id}`);
    return { ok: true, data: undefined, message: "Nota añadida." };
  });
}

export async function deleteClientNoteAction(id: string, clientId: string): Promise<ActionResult> {
  return memberAction(z.object({ id: uuid, clientId: uuid }), { id, clientId }, async (v, { supabase }) => {
    const { error } = await supabase.from("client_notes").delete().eq("id", v.id);
    if (error) return { ok: false, error: dbErrorMessage(error) };
    revalidatePath(`/clientes/${v.clientId}`);
    return { ok: true, data: undefined, message: "Nota eliminada." };
  });
}

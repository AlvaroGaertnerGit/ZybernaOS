"use client";

import { useRouter } from "next/navigation";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2Icon } from "lucide-react";
import { clientSchema, type ClientFormValues, type ClientInput } from "@/lib/validations/schemas";
import { updateClientAction } from "@/server/actions/clients";
import { Button } from "@/components/ui/button";
import { Panel, PanelContent, PanelFooter } from "@/components/ui/panel";
import { useServerAction } from "@/components/forms/use-action";
import type { MemberOption } from "@/components/forms/form-utils";
import { ClientFields } from "./client-fields";

export function ClientEditForm({
  clientId,
  defaultValues,
  members,
}: {
  clientId: string;
  defaultValues: ClientFormValues;
  members: MemberOption[];
}) {
  const router = useRouter();
  const form = useForm<ClientFormValues, unknown, ClientInput>({ resolver: zodResolver(clientSchema), defaultValues, mode: "onBlur" });
  const { run, pending } = useServerAction();

  const onSubmit = form.handleSubmit(() => {
    const values = form.getValues();
    run(() => updateClientAction(clientId, values), {
      setError: form.setError,
      onSuccess: () => router.push(`/clientes/${clientId}`),
    });
  });

  return (
    <FormProvider {...form}>
      <form onSubmit={onSubmit} noValidate>
        <Panel>
          <PanelContent className="p-4 sm:p-6">
            <ClientFields members={members} />
          </PanelContent>
          <PanelFooter>
            <Button type="button" variant="ghost" onClick={() => router.back()}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending || !form.formState.isDirty}>
              {pending && <Loader2Icon className="animate-spin" aria-hidden="true" />}
              Guardar cambios
            </Button>
          </PanelFooter>
        </Panel>
      </form>
    </FormProvider>
  );
}

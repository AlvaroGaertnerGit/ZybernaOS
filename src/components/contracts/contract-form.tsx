"use client";

import { useRouter } from "next/navigation";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2Icon } from "lucide-react";
import { contractSchema, type ContractFormValues, type ContractInput } from "@/lib/validations/schemas";
import { createContractAction, updateContractAction } from "@/server/actions/contracts";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { NativeSelect } from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";
import { Panel, PanelContent, PanelFooter } from "@/components/ui/panel";
import { useServerAction } from "@/components/forms/use-action";
import { errorAt, type CategoryOption, type MemberOption } from "@/components/forms/form-utils";
import { ContractFields } from "./contract-fields";
import type { CatalogOption } from "./catalog-option";

export function ContractForm({
  contractId,
  defaultValues,
  clients,
  categories,
  catalog,
  members,
  lockClient,
}: {
  contractId?: string;
  defaultValues: ContractFormValues;
  clients: { id: string; code: string; trade_name: string }[];
  categories: CategoryOption[];
  catalog: CatalogOption[];
  members: MemberOption[];
  lockClient?: boolean;
}) {
  const router = useRouter();
  const form = useForm<ContractFormValues, unknown, ContractInput>({
    resolver: zodResolver(contractSchema),
    defaultValues,
    mode: "onBlur",
  });
  const { run, pending } = useServerAction();

  const onSubmit = form.handleSubmit(() => {
    const values = form.getValues();
    run(() => (contractId ? updateContractAction(contractId, values) : createContractAction(values)), {
      setError: form.setError,
      onSuccess: (data) => {
        form.reset(values);
        router.push(`/contrataciones/${data.id}`);
      },
    });
  });

  return (
    <FormProvider {...form}>
      <form onSubmit={onSubmit} noValidate>
        <Panel>
          <PanelContent className="flex flex-col gap-6 p-4 sm:p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Cliente" htmlFor="contract-client_id" error={errorAt(form.formState.errors, "client_id")} required>
                <NativeSelect {...form.register("client_id")} disabled={lockClient}>
                  <option value="" disabled>
                    Elige un cliente…
                  </option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.trade_name} · {c.code}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field
                label="Código"
                htmlFor="contract-code"
                error={errorAt(form.formState.errors, "code")}
                hint="Se genera automáticamente si se deja vacío."
              >
                <Input {...form.register("code")} placeholder="CON-0001" autoCapitalize="characters" />
              </Field>
            </div>
            <ContractFields categories={categories} catalog={catalog} members={members} />
          </PanelContent>
          <PanelFooter className="sticky bottom-0 rounded-b-xl bg-surface/95 backdrop-blur-sm">
            <Button type="button" variant="ghost" onClick={() => router.back()}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2Icon className="animate-spin" aria-hidden="true" />}
              {contractId ? "Guardar cambios" : "Crear contratación"}
            </Button>
          </PanelFooter>
        </Panel>
      </form>
    </FormProvider>
  );
}

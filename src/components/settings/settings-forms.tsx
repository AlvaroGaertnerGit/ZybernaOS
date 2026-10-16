"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2Icon } from "lucide-react";
import { agencySettingsSchema, profileSchema, type AgencySettingsFormValues } from "@/lib/validations/schemas";
import { updateAgencySettingsAction, updateProfileAction } from "@/server/actions/settings";
import { CURRENCIES } from "@/lib/domain";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { useServerAction } from "@/components/forms/use-action";

export function ProfileForm({ fullName, email }: { fullName: string; email: string }) {
  const form = useForm<{ full_name: string }>({ resolver: zodResolver(profileSchema), defaultValues: { full_name: fullName } });
  const { run, pending } = useServerAction();
  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={form.handleSubmit(() => run(() => updateProfileAction(form.getValues()), { setError: form.setError, onSuccess: () => form.reset(form.getValues()) }))}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre" htmlFor="profile-name" error={form.formState.errors.full_name?.message} required>
          <Input {...form.register("full_name")} autoComplete="name" />
        </Field>
        <Field label="Email" htmlFor="profile-email" hint="El email de acceso se gestiona en Supabase Auth.">
          <Input value={email} readOnly disabled />
        </Field>
      </div>
      <Button type="submit" size="sm" className="self-start" disabled={pending || !form.formState.isDirty}>
        {pending && <Loader2Icon className="animate-spin" aria-hidden="true" />}
        Guardar perfil
      </Button>
    </form>
  );
}

export function AgencyForm({ defaultValues }: { defaultValues: AgencySettingsFormValues }) {
  const form = useForm<AgencySettingsFormValues>({ resolver: zodResolver(agencySettingsSchema) as never, defaultValues });
  const { run, pending } = useServerAction();
  const e = form.formState.errors;
  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={form.handleSubmit(() =>
        run(() => updateAgencySettingsAction(form.getValues()), { setError: form.setError, onSuccess: () => form.reset(form.getValues()) }),
      )}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre de la agencia" htmlFor="agency-name" error={e.name?.message} required>
          <Input {...form.register("name")} />
        </Field>
        <Field label="Razón social" htmlFor="agency-legal" error={e.legal_name?.message}>
          <Input {...form.register("legal_name")} />
        </Field>
        <Field label="CIF" htmlFor="agency-tax" error={e.tax_id?.message}>
          <Input {...form.register("tax_id")} />
        </Field>
        <Field label="Email" htmlFor="agency-email" error={e.email?.message}>
          <Input {...form.register("email")} type="email" />
        </Field>
        <Field label="Teléfono" htmlFor="agency-phone" error={e.phone?.message}>
          <Input {...form.register("phone")} type="tel" />
        </Field>
        <Field label="Web" htmlFor="agency-web" error={e.website?.message}>
          <Input {...form.register("website")} />
        </Field>
        <Field label="Dirección" htmlFor="agency-address" error={e.address?.message} className="sm:col-span-2">
          <Input {...form.register("address")} />
        </Field>
        <Field label="Moneda por defecto" htmlFor="agency-currency" error={e.default_currency?.message}>
          <NativeSelect {...form.register("default_currency")}>
            {CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </NativeSelect>
        </Field>
        <Field
          label="Impuesto de referencia (%)"
          htmlFor="agency-tax-rate"
          error={e.default_tax_rate?.message}
          hint="Solo informativo. Nunca se aplica automáticamente: cada contratación lo indica de forma explícita."
        >
          <Input {...form.register("default_tax_rate")} inputMode="decimal" />
        </Field>
      </div>
      <Button type="submit" size="sm" className="self-start" disabled={pending || !form.formState.isDirty}>
        {pending && <Loader2Icon className="animate-spin" aria-hidden="true" />}
        Guardar datos de la agencia
      </Button>
    </form>
  );
}

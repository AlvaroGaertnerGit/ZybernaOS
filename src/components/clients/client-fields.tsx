"use client";

import { useFormContext, type FieldValues } from "react-hook-form";
import { CLIENT_STATUSES, CLIENT_STATUS_META } from "@/lib/domain";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { errorAt, type MemberOption } from "@/components/forms/form-utils";

/** Campos del cliente. `prefix` permite anidarlos en otros formularios ("client."). */
export function ClientFields({
  members,
  prefix = "",
  compact = false,
}: {
  members: MemberOption[];
  prefix?: string;
  compact?: boolean;
}) {
  const { register, formState } = useFormContext<FieldValues>();
  const n = (k: string) => `${prefix}${k}`;
  const e = (k: string) => errorAt(formState.errors, n(k));
  const id = (k: string) => `client-${prefix.replace(/\W/g, "")}${k}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre comercial" htmlFor={id("trade_name")} error={e("trade_name")} required className="sm:col-span-2">
          <Input {...register(n("trade_name"))} autoComplete="organization" placeholder="Ej. Grupo Manor" />
        </Field>
        <Field label="Persona de contacto" htmlFor={id("contact_name")} error={e("contact_name")}>
          <Input {...register(n("contact_name"))} autoComplete="name" />
        </Field>
        <Field label="Email" htmlFor={id("email")} error={e("email")}>
          <Input {...register(n("email"))} type="email" inputMode="email" autoComplete="email" />
        </Field>
        <Field label="Teléfono" htmlFor={id("phone")} error={e("phone")}>
          <Input {...register(n("phone"))} type="tel" inputMode="tel" autoComplete="tel" />
        </Field>
        <Field label="Web" htmlFor={id("website")} error={e("website")}>
          <Input {...register(n("website"))} inputMode="url" placeholder="empresa.com" />
        </Field>
        <Field label="Estado" htmlFor={id("status")} error={e("status")} required>
          <NativeSelect {...register(n("status"))}>
            {CLIENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {CLIENT_STATUS_META[s].label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Responsable interno" htmlFor={id("owner_id")} error={e("owner_id")}>
          <NativeSelect {...register(n("owner_id"))}>
            <option value="">Sin asignar</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.full_name || m.email}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>

      <details className="group rounded-lg border border-border" open={!compact}>
        <summary className="flex cursor-pointer list-none items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-colors hover:bg-surface-sunken focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&::-webkit-details-marker]:hidden">
          Datos fiscales y adicionales
          <span className="text-xs font-normal text-subtle-foreground group-open:hidden">Opcional</span>
        </summary>
        <div className="grid gap-4 border-t border-border p-3 sm:grid-cols-2">
          <Field label="Razón social" htmlFor={id("legal_name")} error={e("legal_name")}>
            <Input {...register(n("legal_name"))} />
          </Field>
          <Field label="CIF / NIF" htmlFor={id("tax_id")} error={e("tax_id")}>
            <Input {...register(n("tax_id"))} autoCapitalize="characters" />
          </Field>
          <Field label="Sector" htmlFor={id("sector")} error={e("sector")}>
            <Input {...register(n("sector"))} placeholder="Ej. Restauración" />
          </Field>
          <Field label="Fecha de alta" htmlFor={id("joined_on")} error={e("joined_on")} required>
            <Input {...register(n("joined_on"))} type="date" />
          </Field>
          <Field
            label="Código externo"
            htmlFor={id("code")}
            error={e("code")}
            hint="Se genera automáticamente si lo dejas vacío. Se usa para relacionar datos en Excel."
          >
            <Input {...register(n("code"))} placeholder="CLI-0001" autoCapitalize="characters" />
          </Field>
          <Field label="Dirección" htmlFor={id("address")} error={e("address")}>
            <Input {...register(n("address"))} autoComplete="street-address" />
          </Field>
          <Field label="Notas" htmlFor={id("notes")} error={e("notes")} className="sm:col-span-2">
            <Textarea {...register(n("notes"))} rows={3} />
          </Field>
        </div>
      </details>
    </div>
  );
}

"use client";

import { useActionState } from "react";
import Link from "next/link";
import { updatePassword } from "@/server/actions/auth";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "./submit-button";
import { FormAlert } from "./form-alert";

export function NewPasswordForm({ backHref = "/dashboard" }: { backHref?: string }) {
  const [state, action] = useActionState(updatePassword, undefined);
  if (state?.message) {
    return (
      <div className="flex flex-col gap-4">
        <FormAlert tone="success">{state.message}</FormAlert>
        <Button asChild size="lg">
          <Link href={backHref}>Continuar</Link>
        </Button>
      </div>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state?.error && <FormAlert tone="error">{state.error}</FormAlert>}
      <Field label="Nueva contraseña" htmlFor="password" hint="Mínimo 10 caracteres.">
        <Input name="password" type="password" autoComplete="new-password" required minLength={10} />
      </Field>
      <Field label="Repite la contraseña" htmlFor="confirm">
        <Input name="confirm" type="password" autoComplete="new-password" required minLength={10} />
      </Field>
      <SubmitButton pendingLabel="Guardando…">Guardar contraseña</SubmitButton>
    </form>
  );
}

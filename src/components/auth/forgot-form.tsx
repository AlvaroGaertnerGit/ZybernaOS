"use client";

import { useActionState } from "react";
import { requestPasswordReset } from "@/server/actions/auth";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { SubmitButton } from "./submit-button";
import { FormAlert } from "./form-alert";

export function ForgotPasswordForm() {
  const [state, action] = useActionState(requestPasswordReset, undefined);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state?.error && <FormAlert tone="error">{state.error}</FormAlert>}
      {state?.message && <FormAlert tone="success">{state.message}</FormAlert>}
      <Field label="Email" htmlFor="email">
        <Input name="email" type="email" autoComplete="email" inputMode="email" required autoFocus />
      </Field>
      <SubmitButton pendingLabel="Enviando…">Enviar enlace</SubmitButton>
    </form>
  );
}

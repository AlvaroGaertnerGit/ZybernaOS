"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signIn } from "@/server/actions/auth";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { SubmitButton } from "./submit-button";
import { FormAlert } from "./form-alert";

const QUERY_ERRORS: Record<string, string> = {
  unauthorized: "Esta cuenta no tiene acceso a Zyberna Internal OS.",
  link: "El enlace no es válido o ha caducado. Solicita uno nuevo.",
};

export function LoginForm({ next, queryError }: { next?: string; queryError?: string }) {
  const [state, action] = useActionState(signIn, undefined);
  const error = state?.error ?? (queryError ? QUERY_ERRORS[queryError] : undefined);

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {next && <input type="hidden" name="next" value={next} />}
      {error && <FormAlert tone="error">{error}</FormAlert>}
      <Field label="Email" htmlFor="email">
        <Input
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          autoFocus
          defaultValue={state?.email}
          placeholder="nombre@empresa.com"
        />
      </Field>
      <div className="flex flex-col gap-1.5">
        <Field label="Contraseña" htmlFor="password">
          <Input name="password" type="password" autoComplete="current-password" required />
        </Field>
        <Link
          href="/recuperar"
          className="self-end rounded-sm text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          ¿Has olvidado la contraseña?
        </Link>
      </div>
      <SubmitButton pendingLabel="Accediendo…">Acceder</SubmitButton>
    </form>
  );
}

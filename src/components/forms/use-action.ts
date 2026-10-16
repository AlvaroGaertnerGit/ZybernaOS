"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import type { ActionResult } from "@/lib/validations/common";

/**
 * Ejecuta una Server Action mostrando feedback (toast) y volcando los errores de
 * validación del servidor en los campos del formulario.
 */
export function useServerAction() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run<T, F extends FieldValues = FieldValues>(
    action: () => Promise<ActionResult<T>>,
    opts: { onSuccess?: (data: T) => void; setError?: UseFormSetError<F>; successToast?: boolean } = {},
  ) {
    setError(null);
    startTransition(async () => {
      try {
        const res = await action();
        if (res.ok) {
          if (opts.successToast !== false && res.message) toast.success(res.message);
          opts.onSuccess?.(res.data);
        } else {
          setError(res.error);
          toast.error(res.error);
          if (res.fieldErrors && opts.setError) {
            for (const [field, messages] of Object.entries(res.fieldErrors)) {
              opts.setError(field as Path<F>, { type: "server", message: messages[0] });
            }
          }
        }
      } catch {
        const msg = "No se pudo conectar con el servidor. Revisa tu conexión.";
        setError(msg);
        toast.error(msg);
      }
    });
  }

  return { run, pending, error };
}

"use client";

import { useFieldArray, useFormContext, type FieldValues } from "react-hook-form";
import { ArrowDownIcon, ArrowUpIcon, ListPlusIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Editor de prestaciones: añadir, editar, eliminar y reordenar (con botones accesibles
 * por teclado en lugar de arrastrar). `name` es la ruta del array en el formulario.
 */
export function DeliverablesEditor({
  name,
  templates,
  label = "Prestaciones incluidas",
}: {
  name: string;
  templates?: { title: string; description: string | null }[];
  label?: string;
}) {
  const { control, register, formState } = useFormContext<FieldValues>();
  const { fields, append, remove, move, replace } = useFieldArray({ control, name });
  const errors = getPath(formState.errors, name) as { title?: { message?: string } }[] | undefined;

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 flex w-full items-center justify-between text-xs font-medium text-muted-foreground">
        <span>
          {label} <span className="text-subtle-foreground">({fields.length})</span>
        </span>
        {templates && templates.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => replace(templates.map((t) => ({ title: t.title, description: t.description ?? "" })))}
          >
            <ListPlusIcon aria-hidden="true" /> Usar plantilla del catálogo
          </Button>
        )}
      </legend>
      {fields.length === 0 && (
        <p className="rounded-lg border border-dashed border-border px-3 py-3 text-xs text-subtle-foreground">
          Sin prestaciones. Añade las que incluya este servicio.
        </p>
      )}
      <ol className="flex flex-col gap-1.5">
        {fields.map((field, i) => {
          const error = errors?.[i]?.title?.message;
          return (
            <li key={field.id} className="group/item flex items-start gap-1.5">
              <span className="tabular mt-2 w-5 shrink-0 text-right text-xs text-subtle-foreground" aria-hidden="true">
                {i + 1}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <Input
                  {...register(`${name}.${i}.title`)}
                  placeholder="Ej. Informe mensual de resultados"
                  aria-label={`Prestación ${i + 1}`}
                  aria-invalid={error ? true : undefined}
                />
                {error && <p className="text-xs text-destructive">{error}</p>}
              </div>
              <div className="flex shrink-0 items-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={i === 0}
                  onClick={() => move(i, i - 1)}
                  aria-label={`Subir prestación ${i + 1}`}
                >
                  <ArrowUpIcon aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={i === fields.length - 1}
                  onClick={() => move(i, i + 1)}
                  aria-label={`Bajar prestación ${i + 1}`}
                >
                  <ArrowDownIcon aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => remove(i)}
                  aria-label={`Eliminar prestación ${i + 1}`}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2Icon aria-hidden="true" />
                </Button>
              </div>
            </li>
          );
        })}
      </ol>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => append({ title: "", description: "" })}
        disabled={fields.length >= 100}
      >
        <PlusIcon aria-hidden="true" /> Añadir prestación
      </Button>
    </fieldset>
  );
}

function getPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined), obj);
}

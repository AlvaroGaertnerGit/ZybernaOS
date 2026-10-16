"use client";

import { useState } from "react";
import { Loader2Icon, Trash2Icon } from "lucide-react";
import type { ClientNoteRow } from "@/types/database";
import { addClientNoteAction, deleteClientNoteAction } from "@/server/actions/clients";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useServerAction } from "@/components/forms/use-action";

const dateTime = new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Madrid" });

export function NotesPanel({
  clientId,
  notes,
  authors,
}: {
  clientId: string;
  notes: ClientNoteRow[];
  authors: Record<string, string>;
}) {
  const [body, setBody] = useState("");
  const { run, pending } = useServerAction();

  return (
    <div className="flex flex-col gap-4">
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!body.trim()) return;
          run(() => addClientNoteAction({ client_id: clientId, body }), { onSuccess: () => setBody("") });
        }}
      >
        <label htmlFor="new-note" className="sr-only">
          Nueva nota
        </label>
        <Textarea
          id="new-note"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          maxLength={5000}
          placeholder="Escribe una nota interna: acuerdos, contexto, próximos pasos…"
        />
        <Button type="submit" size="sm" className="self-end" disabled={pending || !body.trim()}>
          {pending && <Loader2Icon className="animate-spin" aria-hidden="true" />}
          Añadir nota
        </Button>
      </form>
      {notes.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Sin notas todavía.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {notes.map((n) => (
            <li key={n.id} className="group/note rounded-lg border border-border bg-surface p-3">
              <p className="text-sm whitespace-pre-wrap">{n.body}</p>
              <div className="mt-2 flex items-center justify-between text-xs text-subtle-foreground">
                <span>
                  {(n.author_id && authors[n.author_id]) || "Miembro"} · {dateTime.format(new Date(n.created_at))}
                </span>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Eliminar nota"
                  className="opacity-60 group-hover/note:opacity-100 hover:text-destructive"
                  onClick={() => run(() => deleteClientNoteAction(n.id, clientId))}
                >
                  <Trash2Icon aria-hidden="true" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

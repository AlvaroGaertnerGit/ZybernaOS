"use client";

import Link from "next/link";
import { useState } from "react";
import { ArchiveIcon, ArchiveRestoreIcon, EyeIcon, MoreHorizontalIcon, PencilIcon, PlusIcon } from "lucide-react";
import { setClientArchivedAction } from "@/server/actions/clients";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/forms/confirm-dialog";
import { useServerAction } from "@/components/forms/use-action";

export function ClientRowActions({ id, name, archived }: { id: string; name: string; archived: boolean }) {
  const [confirm, setConfirm] = useState(false);
  const { run, pending } = useServerAction();

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Acciones de ${name}`}>
            <MoreHorizontalIcon aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem asChild>
            <Link href={`/clientes/${id}`}>
              <EyeIcon aria-hidden="true" /> Ver ficha
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`/clientes/${id}/editar`}>
              <PencilIcon aria-hidden="true" /> Editar
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`/contrataciones/nueva?cliente=${id}`}>
              <PlusIcon aria-hidden="true" /> Nueva contratación
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setConfirm(true)}>
            {archived ? <ArchiveRestoreIcon aria-hidden="true" /> : <ArchiveIcon aria-hidden="true" />}
            {archived ? "Restaurar" : "Archivar"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={archived ? `¿Restaurar ${name}?` : `¿Archivar ${name}?`}
        description={
          archived
            ? "Volverá a aparecer en el listado de clientes."
            : "Dejará de aparecer en el listado principal. Sus contrataciones y cobros se conservan y puedes restaurarlo en cualquier momento."
        }
        confirmLabel={archived ? "Restaurar" : "Archivar"}
        pending={pending}
        onConfirm={() => run(() => setClientArchivedAction(id, !archived), { onSuccess: () => setConfirm(false) })}
      />
    </>
  );
}

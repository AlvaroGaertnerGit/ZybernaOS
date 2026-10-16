"use client";

import Link from "next/link";
import { useState } from "react";
import { CalendarPlusIcon, MoreHorizontalIcon, PencilIcon } from "lucide-react";
import { CONTRACT_STATUSES, CONTRACT_STATUS_META, type ContractStatus } from "@/lib/domain";
import { setContractStatusAction } from "@/server/actions/contracts";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useServerAction } from "@/components/forms/use-action";
import { GeneratePaymentsDialog } from "./generate-payments-dialog";

export function ContractQuickActions({ contractId, status, name }: { contractId: string; status: ContractStatus; name: string }) {
  const { run } = useServerAction();
  const [generate, setGenerate] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Acciones de ${name}`}>
            <MoreHorizontalIcon aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem asChild>
            <Link href={`/contrataciones/${contractId}/editar`}>
              <PencilIcon aria-hidden="true" /> Editar condiciones
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem disabled={status !== "active"} onSelect={() => setGenerate(true)}>
            <CalendarPlusIcon aria-hidden="true" /> Generar cobros previstos
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs font-normal text-subtle-foreground">Cambiar estado</DropdownMenuLabel>
          {CONTRACT_STATUSES.filter((s) => s !== status).map((s) => (
            <DropdownMenuItem key={s} onSelect={() => run(() => setContractStatusAction(contractId, s))}>
              {CONTRACT_STATUS_META[s].label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <GeneratePaymentsDialog contractId={contractId} open={generate} onOpenChange={setGenerate} />
    </>
  );
}

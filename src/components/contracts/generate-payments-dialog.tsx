"use client";

import { useState } from "react";
import { Loader2Icon } from "lucide-react";
import { generatePaymentsAction } from "@/server/actions/contracts";
import { addMonths, todayIso } from "@/lib/calculations/dates";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useServerAction } from "@/components/forms/use-action";

export function GeneratePaymentsDialog({
  contractId,
  open,
  onOpenChange,
}: {
  contractId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [until, setUntil] = useState(() => todayIso());
  const { run, pending } = useServerAction();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Generar cobros previstos</DialogTitle>
          <DialogDescription>
            Crea un cobro por cada periodo de la contratación hasta la fecha indicada (máximo 12 por vez). Los periodos ya
            generados no se duplican.
          </DialogDescription>
        </DialogHeader>
        <Field label="Generar hasta" htmlFor="generate-until">
          <Input type="date" value={until} max={addMonths(todayIso(), 24)} onChange={(e) => setUntil(e.target.value)} />
        </Field>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={pending || !until}
            onClick={() => run(() => generatePaymentsAction({ contract_id: contractId, until }), { onSuccess: () => onOpenChange(false) })}
          >
            {pending && <Loader2Icon className="animate-spin" aria-hidden="true" />}
            Generar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useState } from "react";
import { Loader2Icon, MoreHorizontalIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { BILLING_TYPE_META, PERIODICITY_META } from "@/lib/domain";
import { formatMoney } from "@/lib/calculations/money";
import { deleteCatalogServiceAction, saveCategoryAction } from "@/server/actions/catalog";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Panel, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { ConfirmDialog } from "@/components/forms/confirm-dialog";
import { useServerAction } from "@/components/forms/use-action";
import type { CategoryOption } from "@/components/forms/form-utils";
import type { CatalogOption } from "@/components/contracts/catalog-option";
import { ServiceDialog } from "./service-dialog";

export function CatalogManager({
  categories,
  services,
  usage,
}: {
  categories: (CategoryOption & { description: string | null })[];
  services: CatalogOption[];
  usage: Record<string, number>;
}) {
  const [editing, setEditing] = useState<{ service: CatalogOption | null; categoryId?: string } | null>(null);
  const [deleting, setDeleting] = useState<CatalogOption | null>(null);
  const [categoryDialog, setCategoryDialog] = useState<(CategoryOption & { description: string | null }) | "new" | null>(null);
  const { run, pending } = useServerAction();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setEditing({ service: null })}>
          <PlusIcon aria-hidden="true" /> Nuevo servicio
        </Button>
        <Button size="sm" variant="outline" onClick={() => setCategoryDialog("new")}>
          <PlusIcon aria-hidden="true" /> Nueva categoría
        </Button>
      </div>

      {categories.map((cat) => {
        const items = services.filter((s) => s.category_id === cat.id);
        return (
          <Panel key={cat.id} className={cn(!cat.is_active && "opacity-70")}>
            <PanelHeader>
              <div className="flex min-w-0 items-center gap-2">
                <PanelTitle>{cat.name}</PanelTitle>
                <span className="tabular text-xs text-subtle-foreground">{items.length}</span>
                {!cat.is_active && <StatusBadge tone="muted">Inactiva</StatusBadge>}
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => setEditing({ service: null, categoryId: cat.id })}>
                  <PlusIcon aria-hidden="true" /> Servicio
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label={`Editar categoría ${cat.name}`} onClick={() => setCategoryDialog(cat)}>
                  <PencilIcon aria-hidden="true" />
                </Button>
              </div>
            </PanelHeader>
            {items.length === 0 ? (
              <p className="px-4 py-5 text-sm text-muted-foreground">Sin servicios en esta categoría.</p>
            ) : (
              <ul className="divide-y divide-border">
                {items.map((s) => (
                  <li key={s.id} className="flex items-start gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setEditing({ service: s })}
                          className="truncate text-left text-sm font-medium hover:underline focus-visible:underline focus-visible:outline-none"
                        >
                          {s.name}
                        </button>
                        {s.status === "inactive" && <StatusBadge tone="muted">Inactivo</StatusBadge>}
                      </div>
                      {s.description && <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{s.description}</p>}
                      <p className="mt-1 text-xs text-subtle-foreground">
                        {s.suggested_billing_type === "one_time"
                          ? BILLING_TYPE_META.one_time.label
                          : PERIODICITY_META[s.suggested_periodicity ?? "monthly"].label}
                        {s.default_price_cents != null && ` · ${formatMoney(s.default_price_cents, s.currency)}`}
                        {` · ${s.deliverables.length} prestaciones`}
                        {usage[s.id] ? ` · ${usage[s.id]} contratación(es)` : ""}
                      </p>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label={`Acciones de ${s.name}`}>
                          <MoreHorizontalIcon aria-hidden="true" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setEditing({ service: s })}>
                          <PencilIcon aria-hidden="true" /> Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(s)}>
                          <Trash2Icon aria-hidden="true" /> Eliminar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        );
      })}

      <ServiceDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        service={editing?.service ?? null}
        defaultCategoryId={editing?.categoryId}
        categories={categories}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`¿Eliminar «${deleting?.name}» del catálogo?`}
        description={
          deleting && usage[deleting.id]
            ? `Hay ${usage[deleting.id]} contratación(es) basadas en este servicio. Conservarán su nombre, precio y prestaciones; solo se pierde el vínculo con la plantilla. Si prefieres ocultarlo, márcalo como inactivo.`
            : "La plantilla dejará de estar disponible al contratar."
        }
        confirmLabel="Eliminar"
        destructive
        pending={pending}
        onConfirm={() => deleting && run(() => deleteCatalogServiceAction(deleting.id), { onSuccess: () => setDeleting(null) })}
      />
      <CategoryDialog category={categoryDialog} onClose={() => setCategoryDialog(null)} />
    </div>
  );
}

function CategoryDialog({
  category,
  onClose,
}: {
  category: (CategoryOption & { description: string | null }) | "new" | null;
  onClose: () => void;
}) {
  const existing = category && category !== "new" ? category : null;
  return (
    <Dialog open={category !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        {category !== null && <CategoryForm key={existing?.id ?? "new"} existing={existing} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function CategoryForm({ existing, onClose }: { existing: (CategoryOption & { description: string | null }) | null; onClose: () => void }) {
  const [name, setName] = useState(existing?.name ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [active, setActive] = useState(existing?.is_active ?? true);
  const { run, pending } = useServerAction();
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => saveCategoryAction(existing?.id ?? null, { name, description, is_active: active }), { onSuccess: onClose });
      }}
    >
      <DialogHeader>
        <DialogTitle>{existing ? "Editar categoría" : "Nueva categoría"}</DialogTitle>
        <DialogDescription>Las categorías agrupan el catálogo y el MRR del dashboard.</DialogDescription>
      </DialogHeader>
      <Field label="Nombre" htmlFor="cat-name" required>
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
      </Field>
      <Field label="Descripción" htmlFor="cat-description">
        <Input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} />
      </Field>
      {existing && (
        <label className="flex items-center justify-between gap-3 text-sm">
          Categoría activa
          <Switch checked={active} onCheckedChange={setActive} />
        </label>
      )}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending || !name.trim()}>
          {pending && <Loader2Icon className="animate-spin" aria-hidden="true" />}
          Guardar
        </Button>
      </DialogFooter>
    </form>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { PlusIcon } from "lucide-react";
import { quickActions } from "@/config/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Menú "Nuevo" con atajos de teclado (Alt + letra) para las operaciones habituales. */
export function QuickActions() {
  const router = useRouter();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!e.altKey || e.metaKey || e.ctrlKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable=true]")) return;
      const action = quickActions.find((a) => e.code === `Key${a.shortcut}`);
      if (action) {
        e.preventDefault();
        router.push(action.href);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="dark" className="gap-1.5" data-testid="quick-actions">
          <PlusIcon aria-hidden="true" />
          Nuevo
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {quickActions.map((a) => (
          <DropdownMenuItem key={a.href} asChild>
            <Link href={a.href}>
              {a.label}
              <DropdownMenuShortcut>Alt {a.shortcut}</DropdownMenuShortcut>
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

"use client";

import { useState } from "react";
import { MenuIcon } from "lucide-react";
import { mainNav, secondaryNav } from "@/config/navigation";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { NavLinks } from "./nav-links";
import { UserMenu } from "./user-menu";

export function MobileNav({ name, email }: { name: string; email: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Abrir navegación">
          <MenuIcon aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 gap-0 bg-sidebar p-0">
        <SheetTitle className="sr-only">Navegación</SheetTitle>
        <SheetDescription className="sr-only">Secciones de Zyberna Internal OS</SheetDescription>
        <div className="flex h-14 items-center border-b border-sidebar-border px-4">
          <Logo />
        </div>
        <nav className="flex flex-1 flex-col gap-6 overflow-y-auto p-3" aria-label="Navegación principal">
          <NavLinks items={mainNav} onNavigate={() => setOpen(false)} />
          <div className="mt-auto">
            <NavLinks items={secondaryNav} onNavigate={() => setOpen(false)} />
          </div>
        </nav>
        <div className="border-t border-sidebar-border p-2">
          <UserMenu name={name} email={email} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

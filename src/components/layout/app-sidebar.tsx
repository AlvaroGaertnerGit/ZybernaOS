"use client";

import { useState } from "react";
import Link from "next/link";
import { PanelLeftCloseIcon, PanelLeftOpenIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { mainNav, secondaryNav, SIDEBAR_COOKIE } from "@/config/navigation";
import { Logo, LogoMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { NavLinks } from "./nav-links";
import { UserMenu } from "./user-menu";

export function AppSidebar({
  name,
  email,
  defaultCollapsed,
}: {
  name: string;
  email: string;
  defaultCollapsed: boolean;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${SIDEBAR_COOKIE}=${next ? "collapsed" : "expanded"}; path=/; max-age=31536000; samesite=lax`;
  }

  return (
    <aside
      aria-label="Navegación principal"
      data-collapsed={collapsed}
      className={cn(
        "sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-(--motion-duration-base) ease-(--motion-ease-out) md:flex",
        collapsed ? "w-16" : "w-60",
      )}
    >
      <div className={cn("flex h-14 items-center px-3", collapsed ? "justify-center" : "justify-between")}>
        <Link
          href="/dashboard"
          className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
          aria-label="Zyberna, ir al dashboard"
        >
          {collapsed ? <LogoMark /> : <Logo />}
        </Link>
        {!collapsed && (
          <Button variant="ghost" size="icon-sm" onClick={toggle} aria-label="Contraer navegación">
            <PanelLeftCloseIcon aria-hidden="true" />
          </Button>
        )}
      </div>

      <nav className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-3">
        <div>
          {!collapsed && <p className="eyebrow mb-1.5 px-2.5">Gestión</p>}
          <NavLinks items={mainNav} collapsed={collapsed} />
        </div>
        <div className="mt-auto">
          <NavLinks items={secondaryNav} collapsed={collapsed} />
        </div>
      </nav>

      <div className="flex flex-col gap-1 border-t border-sidebar-border p-2">
        {collapsed && (
          <Button variant="ghost" size="icon-sm" onClick={toggle} aria-label="Expandir navegación" className="mx-auto">
            <PanelLeftOpenIcon aria-hidden="true" />
          </Button>
        )}
        <UserMenu name={name} email={email} collapsed={collapsed} />
      </div>
    </aside>
  );
}

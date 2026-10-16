import { cookies } from "next/headers";
import Link from "next/link";
import { requireMember } from "@/server/auth";
import { SIDEBAR_COOKIE } from "@/config/navigation";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { QuickActions } from "@/components/layout/quick-actions";
import { LogoMark } from "@/components/brand/logo";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const member = await requireMember();
  const collapsed = (await cookies()).get(SIDEBAR_COOKIE)?.value === "collapsed";

  return (
    <div className="flex min-h-dvh">
      <a
        href="#contenido"
        className="sr-only z-50 rounded-md bg-foreground px-3 py-2 text-sm text-background focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Saltar al contenido
      </a>
      <AppSidebar name={member.fullName} email={member.email} defaultCollapsed={collapsed} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-background/90 px-3 backdrop-blur-sm sm:px-6 md:justify-end">
          <MobileNav name={member.fullName} email={member.email} />
          <Link href="/dashboard" className="md:hidden" aria-label="Ir al dashboard">
            <LogoMark className="size-6" />
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <QuickActions />
          </div>
        </header>
        <main id="contenido" className="mx-auto w-full max-w-7xl flex-1 px-4 pt-6 pb-16 sm:px-6 lg:px-8 lg:pt-8">
          {children}
        </main>
      </div>
    </div>
  );
}

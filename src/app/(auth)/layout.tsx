import { Logo } from "@/components/brand/logo";
import { brand } from "@/config/brand";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="flex flex-col px-6 py-8 sm:px-10">
        <Logo />
        <main className="flex flex-1 items-center justify-center py-12">
          <div className="w-full max-w-sm animate-fade-up">{children}</div>
        </main>
        <p className="text-xs text-subtle-foreground">Acceso restringido a miembros autorizados de {brand.name}.</p>
      </div>
      <aside
        aria-hidden="true"
        className="relative hidden overflow-hidden border-l border-border bg-foreground text-background lg:block"
      >
        <svg className="absolute inset-0 size-full opacity-10" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="zyb-grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M40 0H0V40" fill="none" stroke="currentColor" strokeWidth="0.75" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#zyb-grid)" />
        </svg>
        <div className="relative flex h-full flex-col justify-end p-12 xl:p-16">
          <p className="eyebrow text-background/60">{brand.product}</p>
          <p className="mt-4 max-w-md text-3xl leading-tight font-medium tracking-tight text-balance xl:text-4xl">
            Cada cliente, cada servicio y cada cobro, con la precisión que merece la agencia.
          </p>
          <div className="mt-10 flex gap-8 text-sm text-background/60">
            <span>Clientes</span>
            <span>Contrataciones</span>
            <span>Cobros</span>
            <span>MRR</span>
          </div>
        </div>
      </aside>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRightIcon, LogOutIcon } from "lucide-react";
import { requireMember } from "@/server/auth";
import { getAgencySettings, getCategories, getMembers } from "@/server/queries/common";
import { signOut } from "@/server/actions/auth";
import { brand } from "@/config/brand";
import { PageHeader } from "@/components/layout/page-header";
import { Panel, PanelContent, PanelDescription, PanelHeader, PanelTitle } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Logo } from "@/components/brand/logo";
import { AgencyForm, ProfileForm } from "@/components/settings/settings-forms";
import { NewPasswordForm } from "@/components/auth/new-password-form";

export const metadata: Metadata = { title: "Configuración" };

export default async function SettingsPage() {
  const member = await requireMember();
  const [settings, categories, members] = await Promise.all([getAgencySettings(), getCategories(), getMembers()]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <PageHeader title="Configuración" description="Perfil, datos de la agencia, catálogo y datos." />

      <Section title="Perfil" description="Tu información de acceso.">
        <ProfileForm fullName={member.fullName} email={member.email} />
        <div className="mt-6 border-t border-border pt-6">
          <h3 className="mb-3 text-sm font-medium">Cambiar contraseña</h3>
          <div className="max-w-sm">
            <NewPasswordForm backHref="/configuracion" />
          </div>
        </div>
        <form action={signOut} className="mt-6 border-t border-border pt-6">
          <Button type="submit" variant="outline" size="sm">
            <LogOutIcon aria-hidden="true" /> Cerrar sesión
          </Button>
        </form>
      </Section>

      <Section title="Agencia" description="Datos básicos y moneda por defecto.">
        <AgencyForm
          defaultValues={{
            name: settings?.name ?? brand.name,
            legal_name: settings?.legal_name ?? "",
            tax_id: settings?.tax_id ?? "",
            email: settings?.email ?? "",
            phone: settings?.phone ?? "",
            website: settings?.website ?? "",
            address: settings?.address ?? "",
            default_currency: settings?.default_currency ?? "EUR",
            default_tax_rate: settings?.default_tax_rate === null || settings?.default_tax_rate === undefined ? "" : String(settings.default_tax_rate),
          }}
        />
      </Section>

      <Section title="Miembros" description="Socios con acceso. Las altas se gestionan de forma segura desde Supabase (ver documentación).">
        <ul className="divide-y divide-border rounded-lg border border-border">
          {members.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
              <span className="min-w-0">
                <span className="block truncate font-medium">{m.full_name || "Sin nombre"}</span>
                <span className="block truncate text-xs text-subtle-foreground">{m.email}</span>
              </span>
              <StatusBadge tone={m.role === "admin" ? "info" : "neutral"} dot={false}>
                {m.role === "admin" ? "Admin" : "Miembro"}
              </StatusBadge>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Catálogo" description="Categorías, servicios y prestaciones predeterminadas.">
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <StatusBadge key={c.id} tone={c.is_active ? "neutral" : "muted"} dot={false}>
              {c.name}
            </StatusBadge>
          ))}
        </div>
        <Button asChild variant="outline" size="sm" className="mt-4">
          <Link href="/servicios">
            Gestionar catálogo <ArrowRightIcon aria-hidden="true" />
          </Link>
        </Button>
      </Section>

      <Section title="Datos" description="Importación, exportación y copias de seguridad.">
        <div className="flex flex-col gap-3 text-sm text-muted-foreground">
          <p>
            Puedes descargar en cualquier momento una exportación completa en Excel desde{" "}
            <Link href="/datos" className="text-foreground underline-offset-4 hover:underline">
              Importar / Exportar
            </Link>
            . Es compatible con la importación, por lo que sirve como copia portable.
          </p>
          <p>
            La base de datos está alojada en Supabase (PostgreSQL). Las copias de seguridad automáticas dependen del plan del
            proyecto de Supabase; se recomienda además descargar una exportación completa de forma periódica.
          </p>
          <p>Los secretos y claves de servicio no se pueden consultar ni modificar desde esta interfaz.</p>
        </div>
      </Section>

      <Section title="Identidad visual" description="Identidad provisional, centralizada para sustituirla por el branding definitivo.">
        <div className="flex flex-wrap items-center gap-6">
          <Logo />
          <div className="flex gap-1.5" aria-label="Paleta">
            {["bg-foreground", "bg-primary", "bg-chart-2", "bg-chart-3", "bg-chart-4", "bg-surface-sunken"].map((c) => (
              <span key={c} className={`size-6 rounded-md border border-border ${c}`} />
            ))}
          </div>
        </div>
        <p className="mt-4 text-xs text-subtle-foreground">
          Colores y tipografía en <code className="font-mono">src/app/globals.css</code>, logotipo en{" "}
          <code className="font-mono">src/components/brand/logo.tsx</code> y textos de marca en{" "}
          <code className="font-mono">src/config/brand.ts</code>.
        </p>
      </Section>
    </div>
  );
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <Panel>
      <PanelHeader>
        <div>
          <PanelTitle>{title}</PanelTitle>
          <PanelDescription>{description}</PanelDescription>
        </div>
      </PanelHeader>
      <PanelContent className="p-4 sm:p-5">{children}</PanelContent>
    </Panel>
  );
}

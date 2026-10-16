import {
  FileSpreadsheetIcon,
  FileTextIcon,
  LayersIcon,
  LayoutGridIcon,
  SettingsIcon,
  UsersIcon,
  WalletIcon,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const mainNav: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutGridIcon },
  { href: "/clientes", label: "Clientes", icon: UsersIcon },
  { href: "/servicios", label: "Servicios", icon: LayersIcon },
  { href: "/contrataciones", label: "Contrataciones", icon: FileTextIcon },
  { href: "/cobros", label: "Cobros", icon: WalletIcon },
  { href: "/datos", label: "Importar / Exportar", icon: FileSpreadsheetIcon },
];

export const secondaryNav: NavItem[] = [{ href: "/configuracion", label: "Configuración", icon: SettingsIcon }];

export const quickActions = [
  { href: "/clientes/nuevo", label: "Nuevo cliente", shortcut: "C" },
  { href: "/contrataciones/nueva", label: "Nueva contratación", shortcut: "S" },
  { href: "/cobros?status=pending%2Cpartial%2Coverdue", label: "Registrar cobro", shortcut: "P" },
  { href: "/cobros?registrar=1", label: "Nuevo cobro previsto", shortcut: "N" },
  { href: "/datos#importar", label: "Importar Excel", shortcut: "I" },
] as const;

export const SIDEBAR_COOKIE = "zyb_sidebar";

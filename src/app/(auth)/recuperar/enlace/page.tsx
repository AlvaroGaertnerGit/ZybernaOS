import type { Metadata } from "next";
import { HashSessionHandler } from "@/components/auth/hash-session-handler";

export const metadata: Metadata = { title: "Comprobando enlace" };

/**
 * Destino de los enlaces de email con los tokens en el fragmento (#access_token=…),
 * el formato por defecto de Supabase para invitaciones y recuperaciones enviadas
 * desde el panel. El fragmento no llega al servidor: lo procesa el navegador.
 */
export default function EmailLinkPage() {
  return <HashSessionHandler />;
}

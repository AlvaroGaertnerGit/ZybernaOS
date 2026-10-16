import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { ForgotPasswordForm } from "@/components/auth/forgot-form";

export const metadata: Metadata = { title: "Recuperar contraseña" };

export default function ForgotPasswordPage() {
  return (
    <>
      <Link
        href="/login"
        className="mb-8 inline-flex items-center gap-1.5 rounded-sm text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <ArrowLeftIcon className="size-3.5" aria-hidden="true" /> Volver
      </Link>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Recuperar contraseña</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">Te enviaremos un enlace seguro para crear una nueva.</p>
      </div>
      <ForgotPasswordForm />
    </>
  );
}

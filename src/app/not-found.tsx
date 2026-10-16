import Link from "next/link";
import { CompassIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <EmptyState icon={CompassIcon} title="Página no encontrada" description="El enlace no existe o el registro se ha eliminado.">
        <Button asChild size="sm">
          <Link href="/dashboard">Ir al dashboard</Link>
        </Button>
      </EmptyState>
    </main>
  );
}

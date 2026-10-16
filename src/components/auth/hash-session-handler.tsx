"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/**
 * Recoge la sesión de un enlace de email en formato implícito (#access_token&refresh_token&type)
 * y lleva a crear la contraseña. Limpia el fragmento de la URL inmediatamente.
 */
export function HashSessionHandler() {
  const router = useRouter();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    window.history.replaceState(null, "", window.location.pathname);
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    const type = params.get("type");
    if (!accessToken || !refreshToken || params.get("error")) {
      router.replace("/login?error=link");
      return;
    }
    createClient()
      .auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ error }) => {
        if (error) {
          setFailed(true);
          router.replace("/login?error=link");
          return;
        }
        router.replace(type === "recovery" || type === "invite" || type === "signup" ? "/recuperar/nueva" : "/dashboard");
        router.refresh();
      });
  }, [router]);

  return (
    <p className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
      {!failed && <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />}
      {failed ? "El enlace no es válido o ha caducado." : "Comprobando el enlace…"}
    </p>
  );
}

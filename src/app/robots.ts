import type { MetadataRoute } from "next";

// Aplicación privada: no indexar nada. No sustituye a la autenticación.
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", disallow: "/" }] };
}

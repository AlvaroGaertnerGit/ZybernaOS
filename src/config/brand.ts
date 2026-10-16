/**
 * Identidad provisional de Zyberna. Para el branding definitivo:
 *  1. Sustituir el SVG de <LogoMark> (src/components/brand/logo.tsx) y src/app/icon.svg.
 *  2. Ajustar los tokens de color en src/app/globals.css.
 *  3. Cambiar la tipografía en src/app/layout.tsx (next/font).
 */
export const brand = {
  name: "Zyberna",
  product: "Internal OS",
  tagline: "Clientes, servicios y cobros de la agencia en un solo lugar.",
  locale: "es-ES",
  timeZone: "Europe/Madrid",
  defaultCurrency: "EUR",
} as const;

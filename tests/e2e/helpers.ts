import { expect, type Page } from "@playwright/test";

/**
 * Credenciales de un usuario de pruebas autorizado (en .env.test.local, nunca en Git).
 * Los datos creados por E2E usan el prefijo E2E- y se archivan al terminar.
 */
export const E2E_EMAIL = process.env.E2E_EMAIL ?? "";
export const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "";
export const hasCredentials = Boolean(E2E_EMAIL && E2E_PASSWORD);

export async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_EMAIL);
  await page.getByLabel("Contraseña").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Acceder" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

/** Falla el test si aparecen errores de consola o de red no esperados. */
export function trackConsole(page: Page) {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}

/** No debe existir desplazamiento horizontal del documento (desbordamientos). */
export async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

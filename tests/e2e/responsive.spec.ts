import { expect, test } from "@playwright/test";
import { expectNoHorizontalOverflow, hasCredentials, login, trackConsole } from "./helpers";

test("login en móvil sin desbordamientos", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Acceder" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test.describe("app en móvil", () => {
  test.skip(!hasCredentials, "Define E2E_EMAIL y E2E_PASSWORD en .env.test.local");

  for (const path of ["/dashboard", "/clientes", "/contrataciones", "/cobros", "/servicios", "/datos", "/configuracion", "/clientes/nuevo"]) {
    test(`${path} se adapta a móvil`, async ({ page }) => {
      const errors = trackConsole(page);
      await login(page);
      await page.goto(path);
      await expect(page.locator("main h1")).toBeVisible();
      await expectNoHorizontalOverflow(page);
      expect(errors).toEqual([]);
    });
  }

  test("navegación móvil", async ({ page }) => {
    await login(page);
    await page.getByRole("button", { name: "Abrir navegación" }).click();
    await page.getByRole("dialog").getByRole("link", { name: "Clientes" }).click();
    await expect(page).toHaveURL(/\/clientes/);
  });
});

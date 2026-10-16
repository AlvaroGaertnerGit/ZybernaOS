import { expect, test } from "@playwright/test";

// Pruebas sin credenciales: protección de rutas y pantalla de login.
test.describe("autenticación y rutas privadas", () => {
  test("las rutas privadas redirigen a login", async ({ page }) => {
    for (const path of ["/dashboard", "/clientes", "/cobros", "/datos", "/configuracion"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
    }
  });

  test("la API privada responde 401 sin sesión", async ({ request }) => {
    const res = await request.get("/api/excel/template");
    expect(res.status()).toBe(401);
    const exp = await request.get("/api/excel/export?type=all");
    expect(exp.status()).toBe(401);
  });

  test("login: credenciales incorrectas muestran un error claro", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Bienvenido de nuevo" })).toBeVisible();
    await page.getByLabel("Email").fill("nadie@example.com");
    await page.getByLabel("Contraseña").fill("contraseña-incorrecta");
    await page.getByRole("button", { name: "Acceder" }).click();
    await expect(page.getByRole("alert").filter({ hasText: /incorrectos|intentos/ })).toBeVisible();
  });

  test("no existe registro público", async ({ page }) => {
    await page.goto("/registro");
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/login");
    await expect(page.getByRole("link", { name: /registr|crear cuenta/i })).toHaveCount(0);
  });

  test("cabeceras de seguridad", async ({ request }) => {
    const res = await request.get("/login");
    const h = res.headers();
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(h["x-powered-by"]).toBeUndefined();
  });
});

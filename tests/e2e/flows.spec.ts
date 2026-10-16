import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import ExcelJS from "exceljs";
import { E2E_EMAIL, expectNoHorizontalOverflow, hasCredentials, login, trackConsole } from "./helpers";

/**
 * Flujo completo de negocio (requiere E2E_EMAIL / E2E_PASSWORD de un usuario autorizado):
 * login → crear cliente → añadir SEO y GEO → cuota → cobro → dashboard → plantilla →
 * importar → exportar → cerrar sesión. Los datos usan el prefijo E2E- y se archivan al final.
 */
test.describe.configure({ mode: "serial" });
test.skip(!hasCredentials, "Define E2E_EMAIL y E2E_PASSWORD en .env.test.local");

const stamp = Date.now().toString(36).toUpperCase();
const CLIENT = `E2E Cliente ${stamp}`;
let clientUrl = "";

test("1–4. login, alta guiada con SEO y GEO", async ({ page }) => {
  const errors = trackConsole(page);
  await login(page);
  await page.goto("/clientes/nuevo");
  await page.getByLabel("Nombre comercial").fill(CLIENT);
  await page.getByLabel("Email").fill(`e2e+${stamp.toLowerCase()}@example.com`);
  await page.getByRole("button", { name: "Continuar" }).click();

  await page.getByText("SEO mensual", { exact: true }).click();
  await page.getByText("GEO mensual", { exact: true }).click();
  await page.getByRole("button", { name: "Continuar" }).click();

  const prices = page.getByLabel("Precio por periodo");
  await prices.nth(0).fill("450");
  await prices.nth(1).fill("300");
  await page.getByRole("button", { name: "Continuar" }).click();

  await expect(page.getByText("MRR estimado")).toBeVisible();
  await expect(page.getByText(/750,00\s€\/mes/)).toBeVisible();
  await page.getByTestId("wizard-submit").click();
  await expect(page.getByRole("heading", { name: CLIENT })).toBeVisible();
  clientUrl = page.url().split("?")[0];
  await expect(page.getByText("750 €").first()).toBeVisible(); // MRR del cliente
  expect(errors).toEqual([]);
});

test("5–6. registrar cuota y cobro (parcial y total, sin duplicados)", async ({ page }) => {
  await login(page);
  await page.goto(`${clientUrl}?tab=cobros`);
  await page.getByTestId("new-payment").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Contratación").selectOption({ label: "SEO mensual" });
  await expect(dialog.getByLabel("Importe previsto")).toHaveValue("450,00");
  await dialog.getByTestId("save-payment").click();
  await expect(page.getByText("Cobro previsto creado.")).toBeVisible();

  // Pago parcial
  await page.getByTestId("record-payment").first().click();
  const pay = page.getByRole("dialog");
  await pay.getByLabel("Importe cobrado").fill("200");
  await pay.getByTestId("confirm-payment").dblclick(); // doble clic: no debe duplicar
  await expect(page.getByText("Parcialmente cobrado").first()).toBeVisible();
  await expect(page.getByText(/pendiente 250,00\s€/)).toBeVisible();

  // Resto
  await page.getByTestId("record-payment").first().click();
  await page.getByRole("dialog").getByTestId("confirm-payment").click();
  await expect(page.getByText("Cobrado", { exact: true }).first()).toBeVisible();
});

test("7. el dashboard refleja los datos reales", async ({ page }) => {
  await login(page);
  await page.goto("/dashboard");
  await expect(page.getByText("MRR", { exact: true })).toBeVisible();
  await expect(page.getByText(CLIENT).first()).toBeVisible(); // últimos clientes / actividad
  await expect(page.getByText(/Cobro registrado/).first()).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("8–10. plantilla, importación y exportación", async ({ page }, testInfo) => {
  await login(page);
  await page.goto("/datos");

  const [tpl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("download-template").click()]);
  expect(tpl.suggestedFilename()).toBe("ZYBERNA_Plantilla_Clientes.xlsx");

  // Construye un libro a partir de la plantilla con un cliente E2E
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(await tpl.path());
  const ws = wb.getWorksheet("CLIENTES")!;
  ws.addRow([`E2E-${stamp}`, `E2E Importado ${stamp}`, null, null, "Import", `imp+${stamp.toLowerCase()}@example.com`, null, null, null, "activo", E2E_EMAIL, new Date(Date.UTC(2026, 0, 2))]);
  const file = testInfo.outputPath("import.xlsx");
  await wb.xlsx.writeFile(file);

  await page.getByTestId("import-file").setInputFiles({
    name: "import.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: await readFile(file),
  });
  await expect(page.getByTestId("import-analysis")).toBeVisible();
  await page.getByTestId("import-confirm").click();
  await expect(page.getByTestId("import-result")).toBeVisible();

  // Reimportar el mismo archivo no crea duplicados (se omite)
  await page.getByRole("button", { name: "Importar otro archivo" }).click();
  await page.getByTestId("import-file").setInputFiles(file);
  await expect(page.getByTestId("import-analysis")).toContainText("existentes");

  const [exp] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-all").click()]);
  expect(exp.suggestedFilename()).toMatch(/^ZYBERNA_Completo_\d{4}-\d{2}-\d{2}\.xlsx$/);
  const out = new ExcelJS.Workbook();
  await out.xlsx.readFile(await exp.path());
  expect(out.worksheets.map((w) => w.name)).toEqual(["CLIENTES", "CONTRATACIONES", "PRESTACIONES", "COBROS", "CATALOGOS"]);
});

test("11. limpieza (archivar datos E2E) y cierre de sesión", async ({ page }) => {
  await login(page);
  for (const q of [CLIENT, `E2E Importado ${stamp}`]) {
    await page.goto(`/clientes?q=${encodeURIComponent(q)}`);
    const row = page.getByRole("button", { name: `Acciones de ${q}` }).first();
    if (await row.isVisible()) {
      await row.click();
      await page.getByRole("menuitem", { name: "Archivar" }).click();
      await page.getByRole("button", { name: "Archivar" }).click();
      await expect(page.getByText("Cliente archivado.")).toBeVisible();
    }
  }
  await page.getByRole("button", { name: "Menú de usuario" }).first().click();
  await page.getByTestId("sign-out").click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});

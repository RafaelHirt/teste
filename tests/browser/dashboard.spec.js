import { test, expect } from "@playwright/test";
import { demoSnapshot } from "../../shared/demo.js";

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-08T12:00:00Z"));
  await page.route("**/api/dashboard", (route) =>
    route.fulfill({ json: demoSnapshot(new Date("2026-10-08T12:00:00Z")) }),
  );
});

test("dashboard mostra dados ilustrativos, mapa e todos os indicadores", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByText("Dados de demonstração — não representam a planilha."),
  ).toBeVisible();
  await expect(page.locator(".metric-value").first()).toHaveText(
    "R$ 4.085.000,00",
  );
  await expect(page.locator(".metric-value").nth(2)).toHaveText(
    "R$ 9.294.000,00",
  );
  await expect(page.locator("path.municipality")).toHaveCount(246);
  await expect(page.locator("[data-marker]")).toHaveCount(11);
  expect(errors).toEqual([]);
});

test("seleção por município atualiza valores e permite retornar ao global", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Município", { exact: true }).selectOption("Goiânia");
  await expect(page.locator(".metric-value").first()).toHaveText(
    "R$ 979.000,00",
  );
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Limpar filtros", exact: true })
    .click();
  await expect(page.locator(".metric-value").first()).toHaveText(
    "R$ 4.085.000,00",
  );
});

test("mapa é acessível por teclado e seleciona município", async ({ page }) => {
  await page.goto("/");
  const marker = page.getByRole("button", {
    name: "Anápolis: 1 unidade",
    exact: true,
  });
  await marker.focus();
  await marker.press("Enter");
  await expect(page.getByLabel("Município", { exact: true })).toHaveValue(
    "Anápolis",
  );
  await expect(page.locator(".metric-value").nth(2)).toHaveText("R$ 0,00");
  await expect(page.getByText("100% empenhado", { exact: true })).toBeVisible();
});

test("busca encontra unidade, detalhes exibem vigência e saldo", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Buscar unidade ou município").fill("rio verde");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Detalhes de Hospital Regional de Rio Verde" })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("dialog").getByText("R$ 1.254.000,00").first(),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
});

test("CSV contém apenas os dados da seleção", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Município", { exact: true }).selectOption("Goiânia");
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar CSV" }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toBe("unidades-goias.csv");
  const stream = await download.createReadStream();
  let content = "";
  for await (const chunk of stream) content += chunk.toString();
  expect(content).toContain("Hospital Estadual de Goiânia");
  expect(content).not.toContain("Rio Verde");
});

test("falha real é explícita e demonstração depende de uma ação do usuário", async ({
  page,
}) => {
  await page.route("**/api/dashboard", (route) =>
    route.fulfill({ status: 503, json: { detail: "Arquivo sem acesso." } }),
  );
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText("Arquivo sem acesso.");
  await expect(page.locator("tbody tr")).toHaveCount(0);
  await page.getByRole("button", { name: "Explorar demonstração" }).click();
  await expect(page.locator("tbody tr")).toHaveCount(8);
  await expect(
    page.getByText("Dados de demonstração — não representam a planilha."),
  ).toBeVisible();
});

test("leitura antiga mostra aviso com a última data válida", async ({
  page,
}) => {
  const data = {
    ...demoSnapshot(),
    source: { kind: "google", sheetId: "fixture", tab: "Contratos" },
    updatedAt: "2026-10-07T09:00:00Z",
    stale: true,
    syncError: "Falha de conexão.",
  };
  await page.route("**/api/dashboard", (route) =>
    route.fulfill({ json: data }),
  );
  await page.goto("/");
  await expect(
    page.getByText("Exibindo a última leitura válida."),
  ).toBeVisible();
  await expect(
    page.getByText("Última leitura: 07/10/2026, 06:00"),
  ).toBeVisible();
});

test("versão móvel mantém filtros e conteúdo sem rolagem horizontal da página", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator(".metrics-grid")).toBeVisible();
  await page.getByLabel("Município", { exact: true }).selectOption("Catalão");
  await expect(page.locator(".metric-value").nth(2)).toHaveText("R$ 0,00");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
});

test("parcelas separam registros da unidade, preservam ausência de valores e datas mensais", async ({
  page,
}) => {
  const data = {
    ...demoSnapshot(),
    source: { kind: "google", tab: "Planilha1" },
    updatedAt: "2026-10-08T09:00:00Z",
    records: [
      {
        id: "1",
        unit: "Hospital A",
        municipality: "Goiânia",
        monthly: 100,
        committed: 500,
        remaining: 0,
        deduction: 0,
        installments: "jan - jun",
        start: "2026-01-01",
        end: "2026-06-30",
        startPrecision: "month",
        endPrecision: "month",
      },
      {
        id: "2",
        unit: "Hospital A",
        municipality: "Goiânia",
        monthly: 200,
        committed: 300,
        remaining: 20,
        deduction: 0,
        installments: "jul - dez",
        start: "2026-07-01",
        end: "2026-12-31",
        startPrecision: "month",
        endPrecision: "month",
      },
      {
        id: "3",
        unit: "Hospital B",
        municipality: "Rio Verde",
        monthly: null,
        committed: null,
        remaining: null,
        deduction: null,
        start: null,
        end: null,
      },
    ],
  };
  await page.route("**/api/dashboard", (route) =>
    route.fulfill({ json: data }),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator(".metric-value").first()).toHaveText("R$ 200,00");
  await expect(
    page.getByText("1 unidade a conferir · total parcial").first(),
  ).toBeVisible();
  await page.getByLabel("Parcelas", { exact: true }).selectOption("jan - jun");
  await expect(page.locator(".metric-value").first()).toHaveText("R$ 200,00");
  await expect(page.locator(".metric-value").nth(1)).toHaveText("R$ 500,00");
  await page.getByLabel("Parcelas", { exact: true }).selectOption("jul - dez");
  await expect(page.locator(".metric-value").first()).toHaveText("R$ 200,00");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.getByRole("button", { name: "Detalhes de Hospital A" }).click();
  await expect(
    page.getByRole("dialog").getByText("Parcelas: jul - dez"),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog").getByText("jul. de 2026"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Fechar detalhes" }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});

test("sobreposição e ausência de vigência ficam fora do subtotal e aparecem nas linhas", async ({
  page,
}) => {
  const data = {
    ...demoSnapshot(new Date("2026-10-08T12:00:00Z")),
    source: { kind: "google", tab: "Planilha1" },
    records: [
      {
        id: "1",
        unit: "Hospital A",
        municipality: "Goiânia",
        monthly: 100,
        committed: 500,
        remaining: 30,
        deduction: 0,
        start: "2026-01-01",
        end: "2026-12-31",
        installments: "jan - dez",
      },
      {
        id: "2",
        unit: "Hospital A",
        municipality: "Goiânia",
        monthly: 200,
        committed: 700,
        remaining: 40,
        deduction: 0,
        start: "2026-07-01",
        end: "2027-06-30",
        installments: "jul - dez",
      },
      {
        id: "3",
        unit: "Hospital B",
        municipality: "Rio Verde",
        monthly: 300,
        committed: 1000,
        remaining: 50,
        deduction: 0,
        start: null,
        end: null,
      },
      {
        id: "4",
        unit: "Hospital C",
        municipality: "Anápolis",
        monthly: 50,
        committed: 100,
        remaining: 0,
        deduction: 0,
        start: "2026-01-01",
        end: "2026-12-31",
      },
    ],
  };
  await page.route("**/api/dashboard", (route) =>
    route.fulfill({ json: data }),
  );
  await page.goto("/");
  await expect(page.locator(".metric-value").first()).toHaveText("R$ 50,00");
  await expect(page.locator(".metric-value").nth(1)).toHaveText("R$ 2.300,00");
  await expect(page.locator(".metric-value").nth(2)).toHaveText("R$ 120,00");
  await expect(
    page.getByText("2 unidades a conferir · total parcial"),
  ).toBeVisible();
  await expect(
    page.getByText("Vigências sobrepostas · conferir"),
  ).toBeVisible();
  await expect(page.getByText("Vigência ausente · conferir")).toBeVisible();
  await page.getByLabel("Parcelas", { exact: true }).selectOption("jan - dez");
  await expect(page.locator(".metric-value").first()).toHaveText(
    "Não informado",
  );
  await page.getByRole("button", { name: "Detalhes de Hospital A" }).click();
  await expect(
    page
      .getByRole("dialog")
      .getByText("Vigências sobrepostas · conferir")
      .first(),
  ).toBeVisible();
});

test("valores de centenas de milhões cabem nos cartões no celular", async ({
  page,
}) => {
  const snapshot = demoSnapshot();
  snapshot.records = [
    {
      ...snapshot.records[0],
      monthly: 46503700.76,
      committed: 257278648.64,
      remaining: 32338185.65,
      deduction: 40541053.54,
    },
  ];
  await page.route("**/api/dashboard", (route) =>
    route.fulfill({ json: snapshot }),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator(".metric-value").nth(1)).toHaveText(
    "R$ 257.278.648,64",
  );
  expect(
    await page
      .locator(".metric-value")
      .evaluateAll((elements) =>
        elements.every((e) => e.scrollWidth <= e.clientWidth),
      ),
  ).toBeTruthy();
});

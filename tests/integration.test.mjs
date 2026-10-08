import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { generateKeyPairSync, createVerify } from "node:crypto";
import { parseWorkbook } from "../server/workbook.mjs";
import {
  downloadSheet,
  serviceAccountToken,
  DEFAULT_SHEET_ID,
} from "../server/google.mjs";
import {
  createDashboardService,
  sourceConfig,
  synchronize,
} from "../server/sync.mjs";
import { config as schedule } from "../netlify/functions/sync-daily.mjs";
import { aggregate, parseMoney } from "../shared/domain.js";
import { createCSV } from "../src/format.js";
import { Readable } from "node:stream";

const headers = [
  "Unidade",
  "Município",
  "Valor Mensal",
  "Valor Empenhado",
  "A Empenhar",
  "Glosa",
  "Início da Vigência",
  "Fim da Vigência",
];
async function fixture(extra = false) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Contratos");
  worksheet.addRow(["RELATÓRIO DE CONTRATOS"]);
  worksheet.addRow(headers);
  worksheet.addRow([
    "Unidade A",
    "Goiânia",
    "R$ 10.000,00",
    20000,
    "-",
    300,
    new Date("2026-01-01T00:00:00Z"),
    "31/12/2026",
  ]);
  worksheet.addRow([
    "Unidade B",
    "Anápolis",
    5000,
    { formula: "10000+20000", result: 30000 },
    "1.200,50",
    null,
    "01/03/2026",
    "30/11/2026",
  ]);
  worksheet.addRow(["TOTAL GERAL", "", 15000, 50000, 1200.5, 300]);
  if (extra) {
    const other = workbook.addWorksheet("Histórico");
    other.addRow(headers);
    other.addRow(["Unidade antiga", "Goiânia", 200]);
  }
  return workbook.xlsx.writeBuffer();
}

function memoryStore() {
  const entries = new Map();
  return {
    entries,
    get: async (key) => entries.get(key) ?? null,
    setJSON: async (key, value) => {
      entries.set(key, structuredClone(value));
    },
  };
}

test("XLSX com títulos, fórmulas em cache, totais e hífen em A Empenhar", async () => {
  const parsed = await parseWorkbook(await fixture());
  assert.equal(parsed.tab, "Contratos");
  assert.equal(parsed.records.length, 2);
  assert.equal(parsed.records[0].remaining, 0);
  assert.equal(parsed.records[0].monthly, 10000);
  assert.equal(parsed.records[0].start, "2026-01-01");
  assert.equal(parsed.records[1].committed, 30000);
  assert.equal(parsed.records[1].remaining, 1200.5);
  assert.equal(parsed.records[1].deduction, null);
  assert.equal(parsed.warnings.length, 0);
});

test("abas de períodos diferentes exigem seleção explícita", async () => {
  const bytes = await fixture(true);
  await assert.rejects(parseWorkbook(bytes), /mais de uma aba/);
  assert.equal(
    (await parseWorkbook(bytes, { tab: "Contratos" })).records.length,
    2,
  );
  await assert.rejects(
    parseWorkbook(bytes, { tab: "Não existe" }),
    /não encontrada/,
  );
});

test("mapeamento explícito reconhece os cabeçalhos reais sem inferir valores", async () => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Dados");
  worksheet.addRow(["Local atendido", "Mensalidade", "Saldo oficial"]);
  worksheet.addRow(["Unidade X", 600, "-"]);
  const bytes = await workbook.xlsx.writeBuffer();
  const parsed = await parseWorkbook(bytes, {
    columns: {
      unit: "Local atendido",
      monthly: "Mensalidade",
      remaining: "Saldo oficial",
    },
  });
  assert.equal(parsed.records[0].remaining, 0);
  assert.equal(parsed.records[0].committed, null);
  assert.ok(parsed.warnings.length > 0);
});

test("não transforma um arquivo HTML de login em dados", async () => {
  await assert.rejects(
    parseWorkbook(Buffer.from("<html>Login</html>")),
    /XLSX válido/,
  );
  await assert.rejects(
    downloadSheet(
      { SHEET_ID: DEFAULT_SHEET_ID },
      async () => new Response("<html>Login</html>"),
    ),
    /Não foi possível ler/,
  );
});

test("rota pública aceita XLSX do Google Sheets e arquivo do Drive", async () => {
  const bytes = await fixture();
  const seen = [];
  const result = await downloadSheet({}, async (url) => {
    seen.push(url);
    return seen.length < 3
      ? new Response("Forbidden", { status: 403 })
      : new Response(bytes);
  });
  assert.equal((await parseWorkbook(result)).records.length, 2);
  assert.equal(seen.length, 3);
  assert.match(seen[2], /drive.google.com/);
});

test("tabela pública preserva células mescladas, parcelas, meses e unidades sem valores", async () => {
  const html = `<div class="docs-sheet-tab-caption">Planilha1</div><table class="waffle"><tbody>
    <tr><td>UNIDADE</td><td>MUNICÍPIO</td><td>PROCESSO</td><td>VALOR MENSAL</td><td>EMPENHADO</td><td>A EMPENHAR</td><td>GLOSA</td><td>PARCELAS</td><td>VIGÊNCIA INÍCIO</td><td>VIGÊNCIA FIM</td></tr>
    <tr><td rowspan="2">Hospital A</td><td rowspan="2">Goiânia</td><td rowspan="2">123</td><td>R$ 100,00</td><td>R$ 600,00</td><td>R$ -</td><td>R$ -</td><td>jan - jun</td><td rowspan="2">mai/26</td><td rowspan="2">abr.-27</td></tr>
    <tr><td>R$ 200,00</td><td>R$ 800,00</td><td>R$ 70,00</td><td>R$ -</td><td>jul - dez</td></tr>
    <tr><td>Hospital B</td><td>Rio Verde</td><td>456</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
  </tbody></table>`;
  const bytes = await downloadSheet({}, async (url) =>
    url.endsWith("/edit")
      ? new Response(html)
      : new Response("Forbidden", { status: 403 }),
  );
  assert.equal(bytes.format, "html");
  const parsed = await parseWorkbook(bytes);
  assert.equal(parsed.records.length, 3);
  assert.equal(parsed.records[1].unit, "Hospital A");
  assert.equal(parsed.records[1].process, "123");
  assert.equal(parsed.records[1].monthly, 200);
  assert.equal(parsed.records[1].installments, "jul - dez");
  assert.equal(parsed.records[1].start, "2026-05-01");
  assert.equal(parsed.records[1].end, "2027-04-30");
  assert.equal(parsed.records[1].endPrecision, "month");
  assert.equal(parsed.records[0].remaining, 0);
  assert.equal(parsed.records[0].deduction, 0);
  assert.equal(parsed.records[2].monthly, null);
  assert.equal(parsed.warnings.length, 1);
});

test("linhas de continuação preservam a identidade da unidade e não atravessam separadores", async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Dados");
  sheet.addRow(headers);
  sheet.addRow([
    "Hospital A",
    "Goiânia",
    100,
    500,
    "-",
    0,
    "jan.-26",
    "dez.-26",
  ]);
  sheet.addRow(["", "", 200, 300, 50, 0, "fev.-26", "jan.-27"]);
  sheet.addRow([]);
  sheet.addRow(["", "", 1000, 2000, 30]);
  const parsed = await parseWorkbook(await workbook.xlsx.writeBuffer());
  assert.equal(parsed.records.length, 2);
  assert.equal(parsed.records[1].unit, "Hospital A");
  assert.equal(parsed.records[1].municipality, "Goiânia");
  assert.ok(
    parsed.warnings.some((w) => w.includes("sem unidade identificável")),
  );
});

test("glosa em uma célula mesclada é contada uma vez, inclusive no CSV exportado", async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Dados");
  sheet.addRow(headers);
  sheet.addRow([
    "Hospital A",
    "Goiânia",
    100,
    200,
    "-",
    300,
    "jan.-26",
    "dez.-26",
  ]);
  sheet.addRow([
    "Hospital A",
    "Goiânia",
    150,
    250,
    "-",
    null,
    "jan.-26",
    "dez.-26",
  ]);
  sheet.mergeCells("F2:F3");
  const parsed = await parseWorkbook(await workbook.xlsx.writeBuffer());
  assert.equal(parsed.records[1].deduction, 300);
  assert.equal(aggregate(parsed.records).deduction, 300);
  assert.equal(aggregate(parsed.records).missing.deduction, 0);
  assert.equal(aggregate([parsed.records[1]]).deduction, 300);
  const exported = new ExcelJS.Workbook();
  const csv = await exported.csv.read(
    Readable.from([createCSV(parsed.records)]),
    { parserOptions: { delimiter: ";" }, map: (value) => value },
  );
  let total = 0;
  csv.eachRow((row, index) => {
    if (index > 1) total += parseMoney(row.getCell(8).value) || 0;
  });
  assert.equal(total, 300);
});

test("conta de serviço assina JWT válido e limita autorização ao Google", async () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const credentials = JSON.stringify({
    client_email: "dashboard@example.iam.gserviceaccount.com",
    private_key: privateKey.export({ format: "pem", type: "pkcs8" }),
  });
  const token = await serviceAccountToken(credentials, async (url, options) => {
    assert.equal(url, "https://oauth2.googleapis.com/token");
    const assertion = options.body.get("assertion");
    const [header, payload, signature] = assertion.split(".");
    const claims = JSON.parse(Buffer.from(payload, "base64url"));
    assert.equal(
      claims.scope,
      "https://www.googleapis.com/auth/drive.readonly",
    );
    assert.equal(claims.aud, url);
    assert.equal(claims.exp - claims.iat, 3600);
    assert.ok(
      createVerify("RSA-SHA256")
        .update(`${header}.${payload}`)
        .verify(publicKey, Buffer.from(signature, "base64url")),
    );
    return Response.json({ access_token: "fixture-token" });
  });
  assert.equal(token, "fixture-token");
});

test("cache atualiza no dia seguinte e conserva dados válidos em falhas", async () => {
  const store = memoryStore();
  const bytes = await fixture();
  let now = new Date("2026-10-08T09:00:00Z");
  let calls = 0;
  let shouldFail = false;
  const service = createDashboardService(store, {
    clock: () => now,
    download: async () => {
      calls++;
      if (shouldFail) throw new Error("Acesso indisponível");
      return bytes;
    },
  });
  const first = await service();
  assert.equal(first.stale, false);
  assert.equal((await service()).records.length, 2);
  assert.equal(calls, 1);
  now = new Date("2026-10-09T02:00:00Z");
  await service();
  assert.equal(calls, 1, "ainda é o mesmo dia em Brasília");
  now = new Date("2026-10-09T09:00:00Z");
  shouldFail = true;
  const stale = await service();
  assert.equal(stale.stale, true);
  assert.equal(stale.updatedAt, first.updatedAt);
  assert.equal(stale.records.length, 2);
  assert.equal([...store.entries.values()][0].updatedAt, first.updatedAt);
});

test("falha no primeiro carregamento não é substituída por dados de demonstração", async () => {
  const service = createDashboardService(memoryStore(), {
    download: async () => {
      throw new Error("Sem acesso");
    },
  });
  await assert.rejects(service(), /Sem acesso/);
});

test("leituras simultâneas no mesmo processo compartilham a sincronização", async () => {
  const bytes = await fixture();
  let calls = 0;
  const service = createDashboardService(memoryStore(), {
    download: async () => {
      calls++;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return bytes;
    },
  });
  await Promise.all([service(), service(), service()]);
  assert.equal(calls, 1);
});

test("aba e mapeamento fazem parte da chave de cache; JSON inválido é rejeitado", () => {
  assert.notEqual(
    sourceConfig({ SHEET_TAB: "A" }).key,
    sourceConfig({ SHEET_TAB: "B" }).key,
  );
  assert.throws(
    () => sourceConfig({ SHEET_COLUMNS_JSON: "inválido" }),
    /JSON válido/,
  );
  assert.throws(
    () => sourceConfig({ SHEET_COLUMNS_JSON: '["Unidade"]' }),
    /mapear/,
  );
});

test("agendamento diário executa às 6h de Brasília, 9h UTC", () => {
  assert.equal(schedule.schedule, "0 9 * * *");
});

test("snapshot inválido nunca substitui uma leitura anterior", async () => {
  const store = memoryStore();
  await synchronize(store, { download: () => fixture() });
  const before = JSON.stringify([...store.entries.values()]);
  await assert.rejects(
    synchronize(store, { download: async () => Buffer.from("não é um XLSX") }),
  );
  assert.equal(JSON.stringify([...store.entries.values()]), before);
});

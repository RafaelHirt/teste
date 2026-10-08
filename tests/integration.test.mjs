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
    return seen.length === 1
      ? new Response("Forbidden", { status: 403 })
      : new Response(bytes);
  });
  assert.equal((await parseWorkbook(result)).records.length, 2);
  assert.equal(seen.length, 2);
  assert.match(seen[1], /drive.google.com/);
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

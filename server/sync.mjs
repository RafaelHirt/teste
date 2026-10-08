import { createHash } from "node:crypto";
import { todayInBrazil } from "../shared/domain.js";
import { downloadSheet, DEFAULT_SHEET_ID } from "./google.mjs";
import { parseWorkbook } from "./workbook.mjs";

export function sourceConfig(env = process.env) {
  let columns = {};
  try {
    columns = JSON.parse(env.SHEET_COLUMNS_JSON || "{}");
  } catch {
    throw new Error("SHEET_COLUMNS_JSON não é um JSON válido.");
  }
  if (
    !columns ||
    Array.isArray(columns) ||
    typeof columns !== "object" ||
    Object.values(columns).some((v) => typeof v !== "string")
  )
    throw new Error(
      "SHEET_COLUMNS_JSON deve mapear nomes de campos para cabeçalhos de texto.",
    );
  const config = {
    schema: 3,
    id: env.SHEET_ID || DEFAULT_SHEET_ID,
    tab: env.SHEET_TAB || "",
    columns,
  };
  return {
    ...config,
    key: `data-${createHash("sha256").update(JSON.stringify(config)).digest("hex").slice(0, 20)}`,
  };
}

export async function synchronize(
  store,
  { env = process.env, now = new Date(), download = downloadSheet } = {},
) {
  const config = sourceConfig(env);
  const file = await download(env);
  const parsed = await parseWorkbook(file, {
    tab: config.tab,
    columns: config.columns,
  });
  const snapshot = {
    ...parsed,
    updatedAt: now.toISOString(),
    source: {
      kind: "google",
      sheetId: config.id,
      tab: parsed.tab,
      format: file?.format || "xlsx",
    },
    stale: false,
  };
  // Só substituir o último resultado após download e parsing completos.
  await store.setJSON(config.key, snapshot);
  return snapshot;
}

export function createDashboardService(
  store,
  {
    env = process.env,
    download = downloadSheet,
    clock = () => new Date(),
  } = {},
) {
  let pending;
  return async function getDashboard() {
    const now = clock();
    const { key } = sourceConfig(env);
    const existing = await store.get(key, { type: "json" });
    if (
      existing?.updatedAt &&
      todayInBrazil(new Date(existing.updatedAt)) === todayInBrazil(now)
    )
      return { ...existing, stale: false };
    if (!pending) {
      pending = synchronize(store, { env, now, download }).finally(() => {
        pending = undefined;
      });
    }
    try {
      return await pending;
    } catch (error) {
      if (existing)
        return {
          ...existing,
          stale: true,
          message: "A atualização falhou. Exibindo a última leitura válida.",
          syncError: error.message,
        };
      throw error;
    }
  };
}

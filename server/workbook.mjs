import ExcelJS from "exceljs";
import { load } from "cheerio";
import { normalize, parseDateValue, parseMoney } from "../shared/domain.js";

const aliases = {
  process: ["processo", "número do processo", "nº processo"],
  installments: ["parcelas", "período das parcelas", "competência"],
  unit: [
    "unidade",
    "unidades",
    "nome da unidade",
    "unidade de saúde",
    "unidade hospitalar",
    "hospital",
  ],
  municipality: [
    "município",
    "municípios",
    "cidade",
    "localidade",
    "município da unidade",
  ],
  monthly: [
    "valor mensal",
    "valor mensal do contrato",
    "mensal",
    "valor mês",
    "valor mensal contratado",
  ],
  committed: [
    "valor empenhado",
    "empenhado",
    "total empenhado",
    "empenho",
    "valor total empenhado",
  ],
  remaining: [
    "a empenhar",
    "valor a empenhar",
    "saldo a empenhar",
    "falta empenhar",
    "quanto falta empenhar",
  ],
  deduction: [
    "glosa",
    "glosas",
    "valor da glosa",
    "valor glosado",
    "valor glosa",
    "total glosas",
  ],
  start: [
    "início da vigência",
    "início vigência",
    "início de vigência",
    "início",
    "data início",
    "vigência inicial",
    "vigência início",
    "data de início",
  ],
  end: [
    "fim da vigência",
    "fim vigência",
    "fim de vigência",
    "fim",
    "data fim",
    "vigência final",
    "vigência fim",
    "término da vigência",
    "data de término",
  ],
};

export function cellValue(cell) {
  const value = cell.value;
  if (value && typeof value === "object" && !(value instanceof Date)) {
    if ("formula" in value || "sharedFormula" in value)
      return value.result ?? null;
    if ("richText" in value) return value.richText.map((t) => t.text).join("");
    if ("text" in value) return value.text;
    if ("error" in value) return null;
  }
  return value;
}

function findHeader(worksheet, columns) {
  const accepted = Object.fromEntries(
    Object.entries(aliases).map(([field, names]) => [
      field,
      (columns[field] ? [columns[field]] : names).map(normalize),
    ]),
  );
  for (
    let rowIndex = 1;
    rowIndex <= Math.min(worksheet.rowCount, 40);
    rowIndex++
  ) {
    const found = {};
    worksheet.getRow(rowIndex).eachCell((cell, index) => {
      const text = normalize(cellValue(cell));
      for (const [field, names] of Object.entries(accepted)) {
        if (text && names.includes(text)) {
          if (found[field])
            throw new Error(
              `Cabeçalho duplicado para ${field} na aba “${worksheet.name}”. Configure SHEET_COLUMNS_JSON com nomes exclusivos.`,
            );
          found[field] = index;
        }
      }
    });
    if (found.unit && (found.monthly || found.committed || found.remaining))
      return { index: rowIndex, fields: found };
  }
  return null;
}

export async function parseWorkbook(buffer, { tab = "", columns = {} } = {}) {
  const workbook = new ExcelJS.Workbook();
  try {
    if (buffer?.format === "html") {
      const $ = load(buffer.buffer.toString("utf8"));
      const tables = $("table.waffle").toArray();
      const names = $(".docs-sheet-tab-caption")
        .toArray()
        .map((element) => $(element).text().trim());
      if (!tables.length || names.length !== tables.length)
        throw new Error(
          "A página pública não identificou todas as abas. Use exportação XLSX ou conta de serviço.",
        );
      tables.forEach((table, index) => {
        const sheet = workbook.addWorksheet(names[index]);
        $(table)
          .find("tbody tr")
          .each((rowIndex, tr) => {
            let column = 1;
            $(tr)
              .children("td")
              .each((_, td) => {
                while (sheet.getCell(rowIndex + 1, column).value != null)
                  column++;
                const cell = $(td);
                const rowspan = Number(cell.attr("rowspan")) || 1;
                const colspan = Number(cell.attr("colspan")) || 1;
                const value = cell.text().trim();
                if (rowspan > 1 || colspan > 1)
                  sheet.mergeCells(
                    rowIndex + 1,
                    column,
                    rowIndex + rowspan,
                    column + colspan - 1,
                  );
                sheet.getCell(rowIndex + 1, column).value = value;
                column += colspan;
              });
          });
      });
    } else await workbook.xlsx.load(buffer);
  } catch (error) {
    if (buffer?.format === "html") throw error;
    throw new Error(
      "O Google não retornou um arquivo XLSX válido. Verifique o acesso ao arquivo e o SHEET_ID.",
    );
  }
  const worksheets = tab
    ? workbook.worksheets.filter((w) => w.name === tab)
    : workbook.worksheets.filter((w) => w.state === "visible");
  if (!worksheets.length)
    throw new Error(`Aba “${tab}” não encontrada na planilha.`);
  const candidates = worksheets
    .map((worksheet) => ({ worksheet, header: findHeader(worksheet, columns) }))
    .filter((c) => c.header);
  if (!candidates.length)
    throw new Error(
      "Não encontrei cabeçalhos de unidade e valores. Configure SHEET_TAB e SHEET_COLUMNS_JSON conforme os nomes da planilha.",
    );
  if (candidates.length > 1)
    throw new Error(
      "Há mais de uma aba com dados de unidades. Defina SHEET_TAB para evitar somar abas ou períodos diferentes.",
    );
  const { worksheet, header } = candidates[0];
  const warnings = [];
  const records = [];
  let previousIdentity = null;
  for (const field of Object.keys(aliases)) {
    if (["process", "installments"].includes(field)) continue;
    if (!header.fields[field])
      warnings.push(
        `Coluna de ${field} não encontrada; o indicador ficará sem informação.`,
      );
  }
  for (let line = header.index + 1; line <= worksheet.rowCount; line++) {
    const row = worksheet.getRow(line);
    const get = (field) =>
      header.fields[field]
        ? cellValue(row.getCell(header.fields[field]))
        : null;
    let unit = String(get("unit") ?? "").trim();
    const financialPresent = [
      "monthly",
      "committed",
      "remaining",
      "deduction",
    ].some((field) => get(field) != null && String(get(field)).trim());
    if (!unit && !financialPresent) {
      previousIdentity = null;
      continue;
    }
    if (/^(total|subtotal|resumo|somat[oó]rio)(?:\s|$|:)/i.test(unit)) {
      previousIdentity = null;
      continue;
    }
    if (
      normalize(unit) ===
      normalize(
        cellValue(worksheet.getRow(header.index).getCell(header.fields.unit)),
      )
    )
      continue;
    const municipality = String(get("municipality") ?? "").trim();
    const process = String(get("process") ?? "").trim();
    if (!unit) {
      if (
        !previousIdentity ||
        (process && process !== previousIdentity.process) ||
        (municipality &&
          normalize(municipality) !== normalize(previousIdentity.municipality))
      ) {
        warnings.push(
          `Linha ${line}: valores sem unidade identificável; linha não incluída.`,
        );
        continue;
      }
      unit = previousIdentity.unit;
    } else previousIdentity = { unit, municipality, process };
    const record = {
      id: `${worksheet.id}-${line}`,
      unit,
      municipality: municipality || previousIdentity.municipality,
      process: process || previousIdentity.process,
      installments: String(get("installments") ?? "").trim(),
      moneyKeys: {},
      sharedFields: [],
      sourceRow: line,
    };
    for (const field of ["monthly", "committed", "remaining", "deduction"]) {
      const raw = get(field);
      if (header.fields[field]) {
        const cell = row.getCell(header.fields[field]);
        record.moneyKeys[field] = `${worksheet.id}:${cell.master.address}`;
        if (cell.isMerged) record.sharedFields.push(field);
      }
      record[field] = parseMoney(raw, { dashIsZero: field === "remaining" });
      if (
        raw != null &&
        String(raw).trim() &&
        record[field] == null &&
        !/^[-–—]$/.test(String(raw).trim())
      )
        warnings.push(`Linha ${line}: valor de ${field} não reconhecido.`);
    }
    for (const field of ["start", "end"]) {
      const raw = get(field);
      const format = header.fields[field]
        ? row.getCell(header.fields[field]).numFmt || ""
        : "";
      const parsed = parseDateValue(raw, {
        endOfMonth: field === "end",
        monthFormat:
          /m/i.test(format) && /y/i.test(format) && !/d/i.test(format),
      });
      record[field] = parsed.date;
      record[`${field}Precision`] = parsed.precision;
      record[`${field}Raw`] =
        raw == null
          ? ""
          : raw instanceof Date
            ? raw.toISOString().slice(0, 10)
            : String(raw).trim();
      if (raw != null && String(raw).trim() && record[field] == null)
        warnings.push(`Linha ${line}: data de ${field} não reconhecida.`);
    }
    if (record.start && record.end && record.start > record.end) {
      warnings.push(
        `Linha ${line}: início posterior ao fim da vigência; datas não utilizadas.`,
      );
      record.start = record.end = null;
    }
    if (
      ["monthly", "committed", "remaining", "deduction"].every(
        (field) => record[field] == null,
      )
    ) {
      warnings.push(
        `Linha ${line}: unidade ainda sem valores financeiros; mantida no painel e no mapa.`,
      );
    }
    records.push(record);
  }
  if (!records.length)
    throw new Error(
      "A aba selecionada não contém unidades com valores reconhecidos.",
    );
  return {
    records,
    warnings,
    tab: worksheet.name,
    columns: Object.fromEntries(
      Object.entries(header.fields).map(([field, index]) => [
        field,
        String(cellValue(worksheet.getRow(header.index).getCell(index))),
      ]),
    ),
  };
}

export const money = (value) =>
  value == null
    ? "Não informado"
    : new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
        maximumFractionDigits: 2,
      }).format(value);
export const compactMoney = (value) =>
  value == null
    ? "—"
    : new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(value);
export const dateLabel = (value, precision) =>
  value
    ? new Intl.DateTimeFormat("pt-BR", {
        timeZone: "UTC",
        ...(precision === "month" ? { month: "short", year: "numeric" } : {}),
      }).format(new Date(`${value}T12:00:00Z`))
    : "Não informado";
export const timestampLabel = (value) =>
  value
    ? new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(value))
    : "Sem leitura da planilha";

export const recordDateLabel = (row, field) =>
  row[field]
    ? dateLabel(row[field], row[`${field}Precision`])
    : row[`${field}Raw`]
      ? `${row[`${field}Raw`]} · conferir`
      : "Não informado";

export function createCSV(records) {
  const quote = (value) => {
    let text =
      typeof value === "number"
        ? value.toFixed(2).replace(".", ",")
        : String(value ?? "");
    // Evita execução de fórmulas quando uma célula textual é aberta no Excel.
    if (typeof value === "string" && /^[=+@\-\t\r]/.test(text))
      text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  const headers = [
    "Unidade",
    "Município",
    "Processo",
    "Parcelas",
    "Valor Mensal",
    "Valor Empenhado",
    "A Empenhar",
    "Glosa",
    "Início da Vigência",
    "Fim da Vigência",
  ];
  const seen = Object.fromEntries(
    ["monthly", "committed", "remaining", "deduction"].map((field) => [
      field,
      new Set(),
    ]),
  );
  const amount = (row, field) => {
    const key = row.moneyKeys?.[field];
    if (key && seen[field].has(key)) return "";
    if (key) seen[field].add(key);
    return row[field];
  };
  const rows = records.map((r) =>
    [
      r.unit,
      r.municipality,
      r.process,
      r.installments,
      amount(r, "monthly"),
      amount(r, "committed"),
      amount(r, "remaining"),
      amount(r, "deduction"),
      r.startPrecision === "month" && r.start
        ? dateLabel(r.start, "month")
        : r.startRaw || r.start,
      r.endPrecision === "month" && r.end
        ? dateLabel(r.end, "month")
        : r.endRaw || r.end,
    ]
      .map(quote)
      .join(";"),
  );
  return `\ufeff${headers.map(quote).join(";")}\r\n${rows.join("\r\n")}`;
}

export function downloadCSV(records) {
  const blob = new Blob([createCSV(records)], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "unidades-goias.csv";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

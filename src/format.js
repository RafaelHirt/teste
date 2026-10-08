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
export const dateLabel = (value) =>
  value
    ? new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(
        new Date(`${value}T12:00:00Z`),
      )
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

export function downloadCSV(records) {
  const quote = (value) => {
    let text = String(value ?? "");
    // Evita execução de fórmulas quando uma célula textual é aberta no Excel.
    if (typeof value === "string" && /^[=+@\-\t\r]/.test(text))
      text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
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
  const rows = records.map((r) =>
    [
      r.unit,
      r.municipality,
      r.monthly,
      r.committed,
      r.remaining,
      r.deduction,
      r.start,
      r.end,
    ]
      .map((value) =>
        quote(
          typeof value === "number"
            ? value.toFixed(2).replace(".", ",")
            : value,
        ),
      )
      .join(";"),
  );
  const blob = new Blob(
    ["\ufeff", headers.map(quote).join(";"), "\r\n", rows.join("\r\n")],
    { type: "text/csv;charset=utf-8" },
  );
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "unidades-goias.csv";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

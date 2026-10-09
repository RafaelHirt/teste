import { normalize, todayInBrazil } from "./domain.js";

export const unitKey = (row) =>
  `${normalize(row.unit)}:${normalize(row.municipality)}`;

export function monthRange(today = todayInBrazil()) {
  const month = today.slice(0, 7);
  const [year, number] = month.split("-").map(Number);
  return {
    month,
    start: `${month}-01`,
    end: new Date(Date.UTC(year, number, 0)).toISOString().slice(0, 10),
  };
}

export const MONTHLY_LABELS = {
  ready: "Mensal confirmado",
  inactive: "Sem vigência neste mês",
  missing: "Vigência ausente · conferir",
  invalid: "Vigência inválida · conferir",
  overlap: "Vigências sobrepostas · conferir",
  changes: "Mais de uma vigência no mês · conferir",
  amount: "Valor mensal ausente · conferir",
};

export function assessMonthly(rows, today = todayInBrazil()) {
  const range = monthRange(today);
  const issues = [];
  const candidates = [];
  const validRows = [];
  let uncertain = false;
  for (const row of rows) {
    const invalid =
      row.periodIssue === "inverted" ||
      (row.start && row.end && row.start > row.end);
    if (invalid || !row.start || !row.end) {
      const kind = invalid ? "invalid" : "missing";
      issues.push({ kind, ids: [row.id] });
      // Um único limite pode provar que a linha está fora deste mês.
      if (
        invalid ||
        !(
          (row.end && row.end < range.start) ||
          (row.start && row.start > range.end)
        )
      )
        uncertain = true;
      continue;
    }
    validRows.push(row);
    if (row.start <= range.end && row.end >= range.start) candidates.push(row);
  }

  let overlapping = false;
  for (let first = 0; first < validRows.length; first++) {
    for (let second = first + 1; second < validRows.length; second++) {
      const a = validRows[first],
        b = validRows[second];
      if (a.start <= b.end && b.start <= a.end) {
        if (
          a.start <= range.end &&
          a.end >= range.start &&
          b.start <= range.end &&
          b.end >= range.start
        )
          overlapping = true;
        issues.push({ kind: "overlap", ids: [a.id, b.id] });
      }
    }
  }

  // Cópias de uma mesma célula mensal mesclada representam um valor único.
  // Linhas independentes com o mesmo preço continuam distintas e são sinalizadas.
  const values = new Map();
  for (const [index, row] of candidates.entries()) {
    const key = row.moneyKeys?.monthly || `row-${index}`;
    if (!values.has(key)) values.set(key, row);
  }
  let status,
    value = null;
  if (uncertain)
    status = issues.some((issue) => issue.kind === "invalid")
      ? "invalid"
      : "missing";
  else if (values.size > 1) {
    status = overlapping ? "overlap" : "changes";
    if (!overlapping)
      issues.push({ kind: "changes", ids: candidates.map((row) => row.id) });
  } else if (!values.size) {
    status = "inactive";
    value = 0;
  } else {
    const row = [...values.values()][0];
    if (row.monthly == null) {
      status = "amount";
      issues.push({ kind: "amount", ids: [row.id] });
    } else {
      status = "ready";
      value = row.monthly;
    }
  }
  return {
    value,
    status,
    issues,
    candidateIds: candidates.map((row) => row.id),
    month: range.month,
  };
}

export function monthlyOverview(
  selected,
  { source = selected, today = todayInBrazil() } = {},
) {
  const sourceGroups = new Map();
  for (const row of source) {
    const key = unitKey(row);
    if (!sourceGroups.has(key)) sourceGroups.set(key, []);
    sourceGroups.get(key).push(row);
  }
  const selectedKeys = new Set(selected.map(unitKey));
  const assessments = new Map();
  for (const key of selectedKeys)
    assessments.set(key, assessMonthly(sourceGroups.get(key) || [], today));
  const resolved = [...assessments.values()].filter(
    (item) => item.value != null,
  );
  return {
    value:
      selectedKeys.size && !resolved.length
        ? null
        : Math.round(
            resolved.reduce((sum, item) => sum + item.value, 0) * 100,
          ) / 100,
    unresolved: assessments.size - resolved.length,
    confirmed: resolved.filter((item) => item.status === "ready").length,
    assessments,
    month: monthRange(today).month,
  };
}

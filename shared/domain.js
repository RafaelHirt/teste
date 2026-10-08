export const normalize = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

export function parseMoney(value, { dashIsZero = false } = {}) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value == null || String(value).trim() === "") return null;
  let text = String(value).trim();
  if (/^[-–—]$/.test(text)) return dashIsZero ? 0 : null;
  const negative = /^\(.*\)$/.test(text);
  text = text.replace(/R\$|BRL|\s|[()]/gi, "");
  if (/^[-–—]$/.test(text))
    return dashIsZero || /R\$|BRL/i.test(String(value)) ? 0 : null;
  if (text.includes(",")) text = text.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(text)) text = text.replace(/\./g, "");
  if (!/^-?\d+(\.\d+)?$/.test(text)) return null;
  const result = Number(text) * (negative ? -1 : 1);
  return Number.isFinite(result) ? result : null;
}

function validISO(year, month, day) {
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() + 1 !== Number(month) ||
    date.getUTCDate() !== Number(day)
  )
    return null;
  return date.toISOString().slice(0, 10);
}

export function parseDate(value) {
  if (value instanceof Date)
    return Number.isNaN(value.getTime())
      ? null
      : value.toISOString().slice(0, 10);
  if (typeof value === "number" && value > 0 && value < 150000)
    return new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000)
      .toISOString()
      .slice(0, 10);
  const text = String(value ?? "").trim();
  let match = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
  if (match) return validISO(match[1], match[2], match[3]);
  match = text.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);
  return match ? validISO(match[3], match[2], match[1]) : null;
}

export function parseDateValue(
  value,
  { endOfMonth = false, monthFormat = false } = {},
) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\./g, "");
  const months = {
    jan: 1,
    fev: 2,
    mar: 3,
    abr: 4,
    mai: 5,
    jun: 6,
    jul: 7,
    ag: 8,
    ago: 8,
    set: 9,
    out: 10,
    nov: 11,
    dez: 12,
  };
  const match = normalized.match(
    /^(jan|fev|mar|abr|mai|jun|jul|ag|ago|set|out|nov|dez)[/\-\s]+(\d{2}|\d{4})$/,
  );
  let date = parseDate(value);
  let precision = date ? "day" : null;
  if (match) {
    const year =
      match[2].length === 2 ? 2000 + Number(match[2]) : Number(match[2]);
    date = validISO(year, months[match[1]], 1);
    precision = "month";
  } else if (date && monthFormat) precision = "month";
  if (date && precision === "month" && endOfMonth) {
    const [year, month] = date.split("-").map(Number);
    date = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  }
  return { date, precision };
}

export function todayInBrazil(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function contractStatus(record, today = todayInBrazil()) {
  if (record.start && record.start > today) return "future";
  if (record.end && record.end < today) return "expired";
  if (!record.start || !record.end) return "unknown";
  const days = Math.round(
    (Date.parse(`${record.end}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) /
      86400000,
  );
  return days <= 60 ? "expiring" : "active";
}

export const STATUS_LABELS = {
  active: "Em vigência",
  expiring: "Vence em até 60 dias",
  expired: "Encerrada",
  future: "A iniciar",
  unknown: "Vigência incompleta",
};

export function aggregate(records) {
  const result = {
    units: new Set(records.map((r) => normalize(r.unit))).size,
    municipalities: new Set(
      records.map((r) => normalize(r.municipality)).filter(Boolean),
    ).size,
    records: records.length,
    missing: {},
  };
  for (const field of ["monthly", "committed", "remaining", "deduction"]) {
    const seen = new Set();
    const values = records
      .filter((record) => {
        const key = record.moneyKeys?.[field];
        if (key && seen.has(key)) return false;
        if (key) seen.add(key);
        return record[field] != null;
      })
      .map((record) => record[field]);
    result[field] =
      records.length && !values.length
        ? null
        : Math.round(values.reduce((sum, value) => sum + value, 0) * 100) / 100;
    result.missing[field] = records.filter(
      (record) => record[field] == null,
    ).length;
  }
  const starts = records
    .map((r) => r.start)
    .filter(Boolean)
    .sort();
  const ends = records
    .map((r) => r.end)
    .filter(Boolean)
    .sort();
  result.start = starts[0] ?? null;
  result.end = ends.at(-1) ?? null;
  result.startPrecision = records.find(
    (r) => r.start === result.start,
  )?.startPrecision;
  result.endPrecision = records.find((r) => r.end === result.end)?.endPrecision;
  return result;
}

export function groupUnits(records) {
  const groups = new Map();
  for (const row of records) {
    const key = `${normalize(row.unit)}:${normalize(row.municipality)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.values()].map((rows) => ({
    ...aggregate(rows),
    unit: rows[0].unit,
    municipality: rows[0].municipality,
    rows,
  }));
}

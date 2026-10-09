import test from "node:test";
import assert from "node:assert/strict";
import {
  assessMonthly,
  monthRange,
  monthlyOverview,
  unitKey,
} from "../shared/monthly.js";
import { todayInBrazil } from "../shared/domain.js";

const today = "2026-10-08";
const row = (id, monthly, start, end, extra = {}) => ({
  id,
  unit: "Hospital A",
  municipality: "Goiânia",
  monthly,
  start,
  end,
  ...extra,
});

test("mensal exclui vigências anteriores e posteriores ao mês", () => {
  const rows = [
    row("old", 100, "2026-01-01", "2026-06-30"),
    row("current", 200, "2026-07-01", "2026-12-31"),
    row("future", 300, "2027-01-01", "2027-12-31"),
  ];
  const result = assessMonthly(rows, today);
  assert.equal(result.value, 200);
  assert.equal(result.status, "ready");
});

test("mês tem limites inclusivos e considera alterações durante o mês", () => {
  assert.deepEqual(monthRange("2024-02-29"), {
    month: "2024-02",
    start: "2024-02-01",
    end: "2024-02-29",
  });
  assert.equal(
    assessMonthly([row("1", 100, "2026-10-31", "2026-12-31")], today).value,
    100,
  );
  const changes = assessMonthly(
    [
      row("1", 100, "2026-10-01", "2026-10-15"),
      row("2", 200, "2026-10-16", "2026-10-31"),
    ],
    today,
  );
  assert.equal(changes.value, null);
  assert.equal(changes.status, "changes");
});

test("vigências sobrepostas não somam mensais nem escolhem uma linha arbitrária", () => {
  const result = assessMonthly(
    [
      row("1", 100, "2026-01-01", "2026-12-31"),
      row("2", 200, "2026-07-01", "2027-06-30"),
    ],
    today,
  );
  assert.equal(result.value, null);
  assert.equal(result.status, "overlap");
  assert.deepEqual(result.issues[0].ids, ["1", "2"]);
  assert.equal(
    assessMonthly(
      [
        row("1", 100, "2026-01-01", "2026-12-31"),
        row("2", 100, "2026-01-01", "2026-12-31"),
      ],
      today,
    ).value,
    null,
  );
});

test("sobreposição histórica é sinalizada sem invalidar o mensal atual independente", () => {
  const result = assessMonthly(
    [
      row("1", 100, "2025-01-01", "2025-12-31"),
      row("2", 200, "2025-07-01", "2025-12-31"),
      row("3", 300, "2026-01-01", "2026-12-31"),
    ],
    today,
  );
  assert.equal(result.value, 300);
  assert.equal(result.status, "ready");
  assert.deepEqual(result.issues, [{ kind: "overlap", ids: ["1", "2"] }]);
});

test("mesma célula mensal mesclada é contada uma vez e sobreposição é sinalizada", () => {
  const key = { moneyKeys: { monthly: "1:E2" } };
  const result = assessMonthly(
    [
      row("1", 100, "2026-01-01", "2026-12-31", key),
      row("2", 100, "2026-01-01", "2026-12-31", key),
    ],
    today,
  );
  assert.equal(result.value, 100);
  assert.equal(result.status, "ready");
  assert.equal(result.issues[0].kind, "overlap");
});

test("vigência ausente que pode estar ativa impede confirmar o mensal", () => {
  const result = assessMonthly(
    [
      row("1", 100, "2026-01-01", "2026-12-31"),
      row("2", 200, null, "2026-12-31"),
    ],
    today,
  );
  assert.equal(result.value, null);
  assert.equal(result.status, "missing");
  const old = assessMonthly(
    [
      row("1", 100, "2026-01-01", "2026-12-31"),
      row("2", 200, null, "2025-12-31"),
    ],
    today,
  );
  assert.equal(old.value, 100);
  assert.equal(old.issues[0].kind, "missing");
});

test("datas invertidas e valor ausente não produzem um mensal zero", () => {
  assert.equal(
    assessMonthly([row("1", 100, "2026-10-01", "2026-09-30")], today).status,
    "invalid",
  );
  assert.equal(
    assessMonthly(
      [row("1", 100, null, null, { periodIssue: "inverted" })],
      today,
    ).status,
    "invalid",
  );
  const missing = assessMonthly(
    [row("1", null, "2026-01-01", "2026-12-31")],
    today,
  );
  assert.equal(missing.value, null);
  assert.equal(missing.status, "amount");
});

test("unidade com vigências completas fora do mês tem mensal zero", () => {
  const result = assessMonthly(
    [row("1", 100, "2025-01-01", "2025-12-31")],
    today,
  );
  assert.equal(result.value, 0);
  assert.equal(result.status, "inactive");
});

test("subtotal global distingue unidades sem confirmação de uma seleção vazia", () => {
  const rows = [
    row("1", 100, "2026-01-01", "2026-12-31"),
    row("2", 200, null, null, { unit: "Hospital B" }),
  ];
  const overview = monthlyOverview(rows, { today });
  assert.equal(overview.value, 100);
  assert.equal(overview.unresolved, 1);
  assert.equal(overview.confirmed, 1);
  assert.equal(monthlyOverview([rows[1]], { today }).value, null);
  assert.equal(monthlyOverview([], { today }).value, 0);
});

test("filtro de parcelas não oculta conflitos da mesma unidade", () => {
  const source = [
    row("1", 100, "2026-01-01", "2026-12-31"),
    row("2", 200, "2026-07-01", "2027-06-30"),
  ];
  const result = monthlyOverview([source[0]], { source, today });
  assert.equal(result.value, null);
  assert.equal(result.assessments.get(unitKey(source[0])).status, "overlap");
});

test("competência muda em Brasília e não à meia-noite UTC", () => {
  const rows = [
    row("1", 100, "2026-10-01", "2026-10-31"),
    row("2", 200, "2026-11-01", "2026-11-30"),
  ];
  assert.equal(
    assessMonthly(rows, todayInBrazil(new Date("2026-11-01T02:30:00Z"))).value,
    100,
  );
  assert.equal(
    assessMonthly(rows, todayInBrazil(new Date("2026-11-01T03:30:00Z"))).value,
    200,
  );
});

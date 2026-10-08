import test from "node:test";
import assert from "node:assert/strict";
import {
  aggregate,
  contractStatus,
  parseDate,
  parseMoney,
  todayInBrazil,
  parseDateValue,
} from "../shared/domain.js";

test("valores BRL, decimais, negativos e ausentes não se confundem", () => {
  assert.equal(parseMoney("R$ 1.234.567,89"), 1234567.89);
  assert.equal(parseMoney("1.234"), 1234);
  assert.equal(parseMoney("1234.56"), 1234.56);
  assert.equal(parseMoney("(2.500,00)"), -2500);
  assert.equal(parseMoney("-120,35"), -120.35);
  assert.equal(parseMoney("0"), 0);
  assert.equal(parseMoney(""), null);
  assert.equal(parseMoney("pendente"), null);
  assert.equal(parseMoney("-"), null);
  assert.equal(parseMoney("-", { dashIsZero: true }), 0);
  assert.equal(parseMoney(" R$  -   ", { dashIsZero: true }), 0);
  assert.equal(parseMoney(" R$  -   "), 0);
});

test("vigências informadas por mês preservam precisão e cobrem o mês inteiro", () => {
  assert.deepEqual(parseDateValue("jul.-25"), {
    date: "2025-07-01",
    precision: "month",
  });
  assert.deepEqual(parseDateValue("mai/26", { endOfMonth: true }), {
    date: "2026-05-31",
    precision: "month",
  });
  assert.deepEqual(parseDateValue("ag/25"), {
    date: "2025-08-01",
    precision: "month",
  });
  assert.deepEqual(parseDateValue("fev.-24", { endOfMonth: true }), {
    date: "2024-02-29",
    precision: "month",
  });
});

test("datas brasileiras, datas do Excel e datas inválidas", () => {
  assert.equal(parseDate("31/12/2026"), "2026-12-31");
  assert.equal(parseDate("2026-10-08"), "2026-10-08");
  assert.equal(parseDate(45292), "2024-01-01");
  assert.equal(parseDate("31/02/2026"), null);
  assert.equal(parseDate("2026-13-01"), null);
  assert.equal(parseDate(""), null);
});

test("dias são determinados no horário de Brasília", () => {
  assert.equal(todayInBrazil(new Date("2026-10-09T02:30:00Z")), "2026-10-08");
  assert.equal(todayInBrazil(new Date("2026-10-09T03:30:00Z")), "2026-10-09");
});

test("vigência considera limites inclusivos e datas incompletas", () => {
  assert.equal(
    contractStatus({ start: "2026-01-01", end: "2026-12-31" }, "2026-10-08"),
    "active",
  );
  assert.equal(
    contractStatus({ start: "2026-01-01", end: "2026-10-08" }, "2026-10-08"),
    "expiring",
  );
  assert.equal(
    contractStatus({ start: "2026-01-01", end: "2026-10-07" }, "2026-10-08"),
    "expired",
  );
  assert.equal(
    contractStatus({ start: "2026-11-01", end: "2026-12-31" }, "2026-10-08"),
    "future",
  );
  assert.equal(
    contractStatus({ start: null, end: "2026-12-31" }, "2026-10-08"),
    "unknown",
  );
});

test("agregações somam A Empenhar sem derivar saldo de outros valores", () => {
  const totals = aggregate([
    {
      unit: "A",
      municipality: "Goiânia",
      monthly: 100,
      committed: 50,
      remaining: 7,
      deduction: 0,
    },
    {
      unit: "A",
      municipality: "Goiânia",
      monthly: 200,
      committed: null,
      remaining: 0,
      deduction: null,
    },
    {
      unit: "B",
      municipality: "Anápolis",
      monthly: null,
      committed: 30,
      remaining: null,
      deduction: null,
    },
  ]);
  assert.equal(totals.units, 2);
  assert.equal(totals.monthly, 300);
  assert.equal(totals.remaining, 7);
  assert.equal(totals.missing.remaining, 1);
  assert.equal(totals.deduction, 0);
  assert.equal(aggregate([{ unit: "A", remaining: null }]).remaining, null);
});

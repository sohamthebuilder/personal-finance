import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { before, describe, it } from "node:test";
import { dayBefore } from "../src/lib/dates.ts";
import type { ImportRow } from "../src/lib/import/parse-export.ts";
import { InvalidPeriod, netWorth, netWorthBreakdown, periodMetrics } from "../src/lib/metrics/metrics.ts";
import { ACCOUNTS, makeSample, type Sample, type SampleRow } from "../src/lib/sample/sample-export.ts";
import { findMissingSetupCases, SETUP_CASE_COUNT } from "../src/lib/sample/traps.ts";
import { EMPTY_SETUP, type Setup } from "../src/lib/setup/setup.ts";
import { loadSample, rowsFrom, setupWith } from "./support/metrics-helpers.ts";

const ALL = { from: "2000-01-01", to: "2099-12-31" };
const at = (day: string) => `${day}/01/2024, 10:00:00`;
const TODAY = "2024-12-31";
const JANUARY = { from: "2024-01-01", to: "2024-01-31" };

function assertAddsUp(rows: readonly ImportRow[], setup: Setup, period: { from: string; to: string }, today: string): void {
  const b = netWorthBreakdown(rows, setup, period, today);
  const lines = b.earned - b.spent + b.otherCorrections + b.unmatchedTransfers;
  assert.equal(lines, b.change, JSON.stringify(period));
  assert.equal(b.change, b.closing - b.opening);
}

describe("metrics on the sample", () => {
  let sample: Sample;
  let rows: ImportRow[];
  let setup: Setup;

  before(async () => {
    ({ sample, rows, setup } = await loadSample());
  });

  function assertMatchesRecord(from: string, to: string, today = sample.today): void {
    const expected = sample.expectedTotals(from, to, today);
    const actual = periodMetrics(rows, setup, { from, to }, today);
    for (const [line, value] of Object.entries(expected)) {
      assert.equal(actual[line as keyof typeof actual], value, `${line} for ${from} to ${to}`);
    }
    assert.equal(actual.saved, expected.earned - expected.spent);
    assert.equal(actual.unmatchedTransfers, 0);
  }

  it("AC-24: every line matches the generator's record, for the whole history, a financial year and a month", () => {
    assertMatchesRecord(ALL.from, ALL.to);
    assertMatchesRecord("2024-04-01", "2025-03-31");
    assertMatchesRecord("2025-06-01", "2025-06-30");
    assertMatchesRecord("2025-07-20", "2025-07-20");
  });

  it("AC-24: the record isn't all zeros, so the match above proves something", () => {
    const totals = sample.expectedTotals(ALL.from, ALL.to);
    for (const [line, value] of Object.entries(totals)) assert.notEqual(value, 0, line);
    // Money paid back is a correction like any other now (AC-29).
    assert.equal(sample.expectedTotals("2025-06-01", "2025-07-31").otherCorrections, 8_000_00 - 3_250_75);
  });

  it("AC-19 and AC-24: net worth equals the generator's balances, today and on a past date", () => {
    for (const date of [sample.today, "2025-03-31", "2024-01-05"]) {
      const expected = [...sample.balancesAsOf(date).values()].reduce((sum, balance) => sum + balance, 0);
      assert.equal(netWorth(rows, date, sample.today), expected, date);
    }
  });

  it("AC-19: a card's negative balance lowers net worth, with no sign flipped", () => {
    const card = sample.balancesAsOf("2024-01-24").get(ACCOUNTS.card) ?? 0;
    assert.ok(card < 0);
  });

  it("AC-18: future rows stay out until their date arrives, in every metric", () => {
    assertMatchesRecord(ALL.from, ALL.to, "2026-06-29");
    assertMatchesRecord(ALL.from, ALL.to, "2026-06-30");
    assertMatchesRecord(ALL.from, ALL.to, "2026-07-01");
    const before = periodMetrics(rows, setup, ALL, sample.today);
    const after = periodMetrics(rows, setup, ALL, "2026-07-01");
    assert.equal(after.spent - before.spent, 12_345_67);
    assert.equal(after.earned - before.earned, 150_000_00);
    assert.equal(netWorth(rows, "2099-01-01", sample.today), netWorth(rows, sample.today, sample.today));
    assert.equal(netWorth(rows, "2026-07-01", "2026-07-01") - netWorth(rows, sample.today, sample.today), 150_000_00 - 12_345_67);
  });

  it("AC-29: income groups change no number, and the breakdown has no Returns, Loans or Recovered line", () => {
    const ungrouped = { ...setup, income: EMPTY_SETUP.income, expense: EMPTY_SETUP.expense };
    assert.deepEqual(periodMetrics(rows, ungrouped, ALL, sample.today), periodMetrics(rows, setup, ALL, sample.today));
    assert.deepEqual(netWorthBreakdown(rows, ungrouped, ALL, sample.today), netWorthBreakdown(rows, setup, ALL, sample.today));
    const lines = Object.keys(netWorthBreakdown(rows, setup, ALL, sample.today)).sort();
    assert.deepEqual(lines, ["change", "closing", "earned", "opening", "otherCorrections", "spent", "unmatchedTransfers"]);
    // The loan and the market moves logged as income are in Earned (the accepted gap).
    const all = rows.filter((row) => row.type === "Income").reduce((sum, row) => sum + row.amountPaise, 0);
    assert.equal(periodMetrics(rows, setup, ALL, "2099-01-01").earned, all);
  });

  it("AC-21: the breakdown adds up for every month, every year and the whole history", () => {
    for (let year = 2023; year <= 2026; year += 1) {
      assertAddsUp(rows, setup, { from: `${year}-01-01`, to: `${year}-12-31` }, sample.today);
      for (let month = 1; month <= 12; month += 1) {
        const from = `${year}-${String(month).padStart(2, "0")}-01`;
        const to = month === 12 ? `${year}-12-31` : dayBefore(`${year}-${String(month + 1).padStart(2, "0")}-01`);
        assertAddsUp(rows, setup, { from, to }, sample.today);
      }
    }
    assertAddsUp(rows, setup, ALL, sample.today);
  });

  it("AC-21: it adds up for a single day, an empty period and a period wholly after today", () => {
    assertAddsUp(rows, setup, { from: "2025-05-06", to: "2025-05-06" }, sample.today);
    assertAddsUp(rows, setup, { from: "1999-01-01", to: "1999-12-31" }, sample.today);
    assertAddsUp(rows, setup, { from: "2026-06-20", to: "2026-07-31" }, sample.today);
    const future = netWorthBreakdown(rows, setup, { from: "2026-06-20", to: "2026-07-31" }, sample.today);
    assert.equal(future.change, 0);
  });

  it("AC-21: it adds up for 200 made-up date ranges, with setup answers or without", () => {
    let state = 12345;
    const next = (limit: number): number => {
      state = (state * 1103515245 + 12345) % 2147483648;
      return state % limit;
    };
    const dayFrom = (offset: number): string => new Date(Date.UTC(2023, 0, 1 + offset)).toISOString().slice(0, 10);
    for (let index = 0; index < 200; index += 1) {
      const start = next(1300);
      const period = { from: dayFrom(start), to: dayFrom(start + next(400)) };
      assertAddsUp(rows, setup, period, sample.today);
      assertAddsUp(rows, EMPTY_SETUP, period, sample.today);
    }
  });

  it("AC-22: with one side of a transfer gone, the amount shows on its own line and the sum still holds", () => {
    for (const [type, account] of [["Transfer-Out", ACCOUNTS.bank], ["Transfer-In", ACCOUNTS.business]]) {
      const index = rows.findIndex((row) => row.type === type && row.account === account && [row.account, row.secondAccount].includes(ACCOUNTS.business));
      const removed = rows[index];
      assert.ok(removed);
      const left = rows.filter((_, position) => position !== index);
      const line = periodMetrics(left, setup, ALL, sample.today).unmatchedTransfers;
      assert.equal(line, removed.type === "Transfer-In" ? -removed.amountPaise : removed.amountPaise);
      assertAddsUp(left, setup, ALL, sample.today);
      assertAddsUp(left, setup, { from: "2025-07-01", to: "2025-07-01" }, sample.today);
      assert.equal(periodMetrics(left, setup, { from: "2025-08-01", to: "2025-08-31" }, sample.today).unmatchedTransfers, 0);
    }
  });

  it("AC-23: the sample has every Phase 2 case, and the check fails if one is taken out", () => {
    assert.deepEqual(findMissingSetupCases(sample.rows), []);
    const without = (drop: (row: SampleRow) => boolean) => findMissingSetupCases(sample.rows.filter((row) => !drop(row)));
    const cases: Array<[string, (row: SampleRow) => boolean]> = [
      ["Reimbursement correction up", (row) => row.account === ACCOUNTS.reimbursement && row.type === "Income Balance"],
      ["Reimbursement correction down", (row) => row.account === ACCOUNTS.reimbursement && row.type === "Expense Balance"],
      ["Business account", (row) => row.account === ACCOUNTS.business],
      ["Dividend income", (row) => row.category === "Made-up Dividends"],
      ["Transfer between investment accounts", (row) => row.account === ACCOUNTS.broker && row.secondAccount === ACCOUNTS.fund],
      ["Transfer out of investments", (row) => row.account === ACCOUNTS.broker && row.secondAccount === ACCOUNTS.bank],
    ];
    assert.equal(cases.length, SETUP_CASE_COUNT);
    for (const [name, drop] of cases) assert.deepEqual(without(drop), [name]);
  });

  it("AC-23: every transfer in the sample keeps its partner", () => {
    assert.equal(makeSample().rows.filter((row) => row.type === "Transfer-In").length, sample.transferPairs);
    assert.equal(periodMetrics(rows, setup, ALL, "2099-01-01").unmatchedTransfers, 0);
  });
});

describe("metrics on hand-worked rows", () => {
  const incomeGroups = setupWith({
    income: { names: ["Work", "Savings", "Borrowed"], placed: new Map([["Salary", 0], ["Market", 1], ["Loan", 2]]) },
  });

  it("AC-9: dates are inclusive at both ends, and use the date as written", async () => {
    const rows = await rowsFrom([
      { period: "31/12/2023, 23:59:59", inr: 1, type: "Exp." },
      { period: "01/01/2024, 00:00:00", inr: 2, type: "Exp." },
      { period: "31/01/2024, 23:59:59", inr: 4, type: "Exp." },
      { period: "01/02/2024, 00:00:00", inr: 8, type: "Exp." },
    ]);
    assert.equal(periodMetrics(rows, EMPTY_SETUP, JANUARY, TODAY).spent, 6_00);
  });

  it("AC-9: a bad range is refused with fixed text, and an empty one gives zeros", async () => {
    const rows = await rowsFrom([{ period: at("05"), inr: 1, type: "Exp." }]);
    for (const period of [{ from: "2024-02-01", to: "2024-01-01" }, { from: "2024-02-30", to: "2024-03-01" }, { from: "<script>", to: "2024-03-01" }]) {
      assert.throws(() => periodMetrics(rows, EMPTY_SETUP, period, TODAY), InvalidPeriod);
      assert.throws(() => netWorthBreakdown(rows, EMPTY_SETUP, period, TODAY), InvalidPeriod);
    }
    assert.throws(() => periodMetrics(rows, EMPTY_SETUP, JANUARY, "today"), InvalidPeriod);
    assert.throws(() => netWorth(rows, "soon", TODAY), InvalidPeriod);
    assert.deepEqual(periodMetrics([], EMPTY_SETUP, JANUARY, TODAY), {
      earned: 0, spent: 0, otherCorrections: 0, invested: 0, unmatchedTransfers: 0, saved: 0, savingsRate: null,
    });
  });

  it("AC-29: income in several groups, and in none, all counts as Earned, losses included", async () => {
    const rows = await rowsFrom([
      { period: at("01"), inr: 1000, type: "Income", category: "Salary", subcategory: "Pay" },
      { period: at("02"), inr: -300.5, type: "Income", category: "Market", subcategory: "Shares" },
      { period: at("03"), inr: 100, type: "Income", category: "Market", subcategory: "Funds" },
      { period: at("04"), inr: 5000, type: "Income", category: "Loan" },
      { period: at("05"), inr: 40, type: "Income", category: "Not Placed" },
      { period: at("06"), inr: 10, type: "Exp.", category: "Market" },
      { period: at("07"), inr: 20, type: "Income Balance", category: "Market" },
    ]);
    const metrics = periodMetrics(rows, incomeGroups, JANUARY, TODAY);
    assert.equal(metrics.earned, 1000_00 - 300_50 + 100_00 + 5000_00 + 40_00);
    assert.equal(metrics.spent, 10_00);
    assert.equal(metrics.otherCorrections, 20_00);
    assert.deepEqual(metrics, periodMetrics(rows, EMPTY_SETUP, JANUARY, TODAY));
    assertAddsUp(rows, incomeGroups, JANUARY, TODAY);
  });

  it("AC-11: identical repeats all count, and a large one-off stays in", async () => {
    const repeat = { period: at("05"), inr: 180, type: "Exp." };
    const rows = await rowsFrom([repeat, repeat, repeat, { period: at("06"), inr: 900000, type: "Exp." }]);
    assert.equal(periodMetrics(rows, EMPTY_SETUP, JANUARY, TODAY).spent, 900540_00);
  });

  it("AC-12: Saved and the rate, including a negative rate and no Earned", async () => {
    const rows = await rowsFrom([
      { period: at("01"), inr: 1000, type: "Income" },
      { period: at("02"), inr: 250, type: "Exp." },
    ]);
    const metrics = periodMetrics(rows, EMPTY_SETUP, JANUARY, TODAY);
    assert.equal(metrics.saved, 750_00);
    assert.equal(metrics.savingsRate, 0.75);

    const over = await rowsFrom([{ period: at("01"), inr: 100, type: "Income" }, { period: at("02"), inr: 150, type: "Exp." }]);
    assert.equal(periodMetrics(over, EMPTY_SETUP, JANUARY, TODAY).savingsRate, -0.5);

    const none = await rowsFrom([{ period: at("02"), inr: 150, type: "Exp." }]);
    const noEarned = periodMetrics(none, EMPTY_SETUP, JANUARY, TODAY);
    assert.equal(noEarned.savingsRate, null);
    assert.equal(noEarned.saved, -150_00);
  });

  it("AC-15 and AC-29: every correction, on any account, is in Other corrections, and never touches Earned, Spent or Saved", async () => {
    const rows = await rowsFrom([
      { period: at("01"), account: "Reimb", inr: 500, type: "Income Balance" },
      { period: at("02"), account: "Reimb", inr: 120.25, type: "Expense Balance" },
      { period: at("03"), account: "Bank", inr: 900, type: "Income Balance" },
      { period: at("04"), account: "Bank", inr: 1000, type: "Expense Balance" },
    ]);
    const metrics = periodMetrics(rows, EMPTY_SETUP, JANUARY, TODAY);
    assert.equal(metrics.otherCorrections, 500_00 - 120_25 + 900_00 - 1000_00);
    assert.deepEqual([metrics.earned, metrics.spent, metrics.saved], [0, 0, 0]);
    assertAddsUp(rows, EMPTY_SETUP, JANUARY, TODAY);
  });

  it("AC-16 and AC-17: Invested counts money crossing the group, once, and a move inside it is zero", async () => {
    const pair = (day: string, from: string, to: string, inr: number) => [
      { period: at(day), account: from, secondAccount: to, inr, type: "Transfer-Out" },
      { period: at(day), account: to, secondAccount: from, inr, type: "Transfer-In" },
    ];
    const rows = await rowsFrom([
      ...pair("01", "Bank", "Broker", 1000),
      ...pair("02", "Broker", "Fund", 400),
      ...pair("03", "Fund", "Bank", 150),
      ...pair("04", "Bank", "Wallet", 75),
    ]);
    const setup = setupWith({ groups: new Map([["Broker", "Investments"], ["Fund", "Investments"], ["Bank", "Bank"]]) });
    const metrics = periodMetrics(rows, setup, JANUARY, TODAY);
    assert.equal(metrics.invested, 850_00);
    assert.deepEqual([metrics.earned, metrics.spent, metrics.unmatchedTransfers], [0, 0, 0]);
    assert.equal(periodMetrics(rows, EMPTY_SETUP, JANUARY, TODAY).invested, 0);
  });

  it("AC-17: a foreign-currency row counts once, at its INR amount", async () => {
    const rows = await rowsFrom([{ period: at("05"), inr: 8345, amount: 100, currency: "USD", type: "Exp." }]);
    assert.equal(periodMetrics(rows, EMPTY_SETUP, JANUARY, TODAY).spent, 8345_00);
  });

  it("AC-19: Ungrouped, Money with others and Business all count, and a card is negative", async () => {
    const rows = await rowsFrom([
      { period: at("01"), account: "Nobody Grouped This", inr: 100, type: "Income" },
      { period: at("01"), account: "Friends", inr: 20, type: "Income Balance" },
      { period: at("01"), account: "Shop", inr: 3, type: "Income" },
      { period: at("01"), account: "Card", inr: 50, type: "Exp." },
    ]);
    assert.equal(netWorth(rows, TODAY, TODAY), 73_00);
  });

  it("AC-22: a transfer with the same account on both sides is unmatched, and the sum holds", async () => {
    const rows = await rowsFrom([{ period: at("05"), account: "A", secondAccount: "A", inr: 10, type: "Transfer-Out" }]);
    assert.equal(periodMetrics(rows, EMPTY_SETUP, JANUARY, TODAY).unmatchedTransfers, -10_00);
    assertAddsUp(rows, EMPTY_SETUP, JANUARY, TODAY);
  });

  it("names that look like object internals are plain data", async () => {
    const rows = await rowsFrom([{ period: at("01"), account: "__proto__", category: "constructor", inr: 10, type: "Income" }]);
    const setup = setupWith({ groups: new Map([["__proto__", "Bank"]]), income: { names: ["__proto__"], placed: new Map([["constructor", 0]]) } });
    assert.equal(periodMetrics(rows, setup, JANUARY, TODAY).earned, 10_00);
    assert.equal(netWorth(rows, TODAY, TODAY), 10_00);
  });

  it("the row order doesn't matter", async () => {
    const { rows, setup, sample } = await loadSample();
    assert.deepEqual(periodMetrics([...rows].reverse(), setup, ALL, sample.today), periodMetrics(rows, setup, ALL, sample.today));
  });

  it("full size: every metric finishes on 100,000 rows", async () => {
    const rows = await rowsFrom(Array.from({ length: 100_000 }, (_, index) => ({ period: at("05"), inr: 1.5, type: index % 2 ? "Exp." : "Income" })));
    assert.equal(periodMetrics(rows, EMPTY_SETUP, JANUARY, TODAY).earned, 75_000_00);
    assertAddsUp(rows, EMPTY_SETUP, JANUARY, TODAY);
  });
});

it("AC-25: the calculations are plain functions with no screen, file or database code", () => {
  for (const file of readdirSync("src/lib/metrics")) {
    const source = readFileSync(`src/lib/metrics/${file}`, "utf8");
    assert.doesNotMatch(source, /from "(react|next|node:|fs|better-sqlite)/, file);
  }
  // Phase 6 adds the Spending breakdowns here, so both screens share one calculation (Phase 6 AC-18).
  assert.deepEqual(readdirSync("src/lib/metrics").sort(), ["metrics.ts", "spending.ts"]);
});

import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { dateOf } from "../src/lib/import/balances.ts";
import type { ImportRow } from "../src/lib/import/parse-export.ts";
import { periodMetrics } from "../src/lib/metrics/metrics.ts";
import { monthlySpending, monthsFrom, spendingLines, spendingTotal, spendingTransactions } from "../src/lib/metrics/spending.ts";
import { buildOverview } from "../src/lib/overview/overview.ts";
import { comparisonDates, comparisonLabel, periodDates } from "../src/lib/period.ts";
import type { Sample } from "../src/lib/sample/sample-export.ts";
import type { Setup } from "../src/lib/setup/setup.ts";
import { buildSpending, readPath, type SpendingPath, TOP, UnknownGroup } from "../src/lib/spending/spending.ts";
import { loadSample, ownerGroups, rowsFrom, setupWith } from "./support/metrics-helpers.ts";

const PERIODS = [
  { kind: "this-month" },
  { kind: "last-12" },
  { kind: "financial-year" },
  { kind: "all" },
  { kind: "custom", from: "2025-04-01", to: "2025-06-30" },
] as const;

const EVERYTHING = 100_000;
const sum = (values: ReadonlyArray<{ spent: number }>) => values.reduce((total, line) => total + line.spent, 0);

describe("Spending adds up on the sample (AC-1, AC-2, AC-5, AC-6, AC-8, AC-18)", () => {
  let sample: Sample;
  let rows: ImportRow[];
  let setup: Setup;

  before(async () => {
    ({ sample, rows, setup } = await loadSample());
  });

  it("the sample has expense groups to test with", () => {
    assert.ok(setup.expense.names.length > 0);
  });

  for (const period of PERIODS) {
    it(`${period.kind}: Total Spent equals the Overview's Spent, and every level adds up to the paisa`, () => {
      const top = buildSpending(rows, setup, period, TOP, sample.today);
      assert.equal(top.spent, buildOverview(rows, setup, period, sample.today).spent, "AC-1");
      assert.equal(sum(top.rows), top.spent, "categories add up to Total Spent");
      assert.deepEqual([...top.rows].sort((a, b) => b.spent - a.spent), top.rows, "biggest first");

      const groups = buildSpending(rows, setup, period, { ...TOP, view: "groups" }, sample.today);
      assert.equal(groups.view, "groups");
      assert.equal(sum(groups.rows), top.spent, "groups add up to Total Spent");
      for (const group of groups.rows) {
        const inside = buildSpending(rows, setup, period, { ...TOP, view: "groups", group: group.key }, sample.today);
        assert.equal(inside.spent, group.spent, `group ${group.name}`);
        assert.equal(sum(inside.rows), group.spent, `categories in ${group.name}`);
      }

      for (const category of top.rows) {
        const path: SpendingPath = { ...TOP, category: category.key };
        const level2 = buildSpending(rows, setup, period, path, sample.today);
        assert.equal(level2.level, "category");
        assert.equal(level2.spent, category.spent);
        assert.equal(level2.earlier, category.earlier);
        assert.equal(sum(level2.rows), category.spent, `subcategories of ${category.key}`);
        for (const sub of level2.rows) {
          const level3 = buildSpending(rows, setup, period, { ...path, subcategory: sub.key }, sample.today, EVERYTHING);
          assert.equal(level3.spent, sub.spent);
          assert.equal(level3.transactions?.count, level3.count);
          assert.equal(sum(level3.transactions?.list.map((row) => ({ spent: row.amount })) ?? []), sub.spent, `transactions of ${sub.key}`);
        }
      }
    });
  }

  it("AC-7: the trend runs from the file's first month to this month, whatever the period, and its months add up", () => {
    const first = rows.map(dateOf).sort()[0] ?? sample.today;
    const top = buildSpending(rows, setup, { kind: "this-month" }, TOP, sample.today);
    assert.equal(top.trend.months[0], first.slice(0, 7));
    assert.equal(top.trend.months.at(-1), sample.today.slice(0, 7));
    assert.equal(top.trend.values.at(-1), top.spent, "this month's bar is this month's Spent");
    const all = buildSpending(rows, setup, { kind: "all" }, TOP, sample.today);
    assert.equal(top.trend.values.reduce((a, b) => a + b, 0), all.spent, "every month together is All");
    const custom = buildSpending(rows, setup, { kind: "custom", from: "2025-04-01", to: "2025-06-30" }, TOP, sample.today);
    assert.deepEqual(custom.trend, top.trend);
  });

  it("AC-7: level 2's trend is the category's, and level 3 keeps the category's trend", () => {
    const top = buildSpending(rows, setup, { kind: "last-12" }, TOP, sample.today);
    const category = top.rows[0]?.key ?? "";
    const level2 = buildSpending(rows, setup, { kind: "last-12" }, { ...TOP, category }, sample.today);
    const level3 = buildSpending(rows, setup, { kind: "last-12" }, { ...TOP, category, subcategory: level2.rows[0]?.key ?? "" }, sample.today);
    assert.deepEqual(level3.trend, level2.trend);
    const months = level2.trend.months;
    assert.deepEqual(level2.trend.values, monthlySpending(rows, months, sample.today, (row) => row.category === category));
  });

  it("AC-8: transactions come newest first, 50 at a time, with the full count", () => {
    let busiest: { path: SpendingPath; count: number } | null = null;
    const top = buildSpending(rows, setup, { kind: "all" }, TOP, sample.today);
    for (const category of top.rows) {
      const level2 = buildSpending(rows, setup, { kind: "all" }, { ...TOP, category: category.key }, sample.today);
      for (const sub of level2.rows) {
        const path = { ...TOP, category: category.key, subcategory: sub.key };
        const count = buildSpending(rows, setup, { kind: "all" }, path, sample.today).count;
        if (busiest === null || count > busiest.count) busiest = { path, count };
      }
    }
    assert.ok(busiest !== null && busiest.count > 50, "the sample has a subcategory with more than 50 rows");
    const page = buildSpending(rows, setup, { kind: "all" }, busiest.path, sample.today);
    assert.equal(page.transactions?.list.length, 50);
    assert.equal(page.transactions?.count, busiest.count);
    const dates = page.transactions?.list.map((row) => row.date) ?? [];
    assert.deepEqual([...dates].sort().reverse(), dates);
    assert.equal(buildSpending(rows, setup, { kind: "all" }, busiest.path, sample.today, 100).transactions?.list.length, Math.min(100, busiest.count));
  });
});

describe("Spending and the sample's traps (AC-18)", () => {
  const TODAY = "2024-01-20";
  const JAN = { from: "2024-01-01", to: "2024-01-31" };

  it("future-dated rows aren't counted until their date", async () => {
    const rows = await rowsFrom([
      { period: "10/01/2024, 10:00:00", inr: 100, amount: 100, category: "Food" },
      { period: "25/01/2024, 10:00:00", inr: 900, amount: 900, category: "Food" },
    ]);
    assert.equal(spendingTotal(rows, JAN, null, TODAY).spent, 100_00);
    assert.equal(spendingTransactions(rows, JAN, TODAY).length, 1);
    assert.deepEqual(monthlySpending(rows, ["2024-01"], TODAY), [100_00]);
    assert.equal(spendingTotal(rows, JAN, null, "2024-01-25").spent, 1000_00);
  });

  it("identical repeated rows are all counted and all listed", async () => {
    const same = { period: "10/01/2024, 10:00:00", inr: 250, amount: 250, category: "Food", subcategory: "Tea", note: "Same" };
    const rows = await rowsFrom([same, same, same]);
    assert.equal(spendingTotal(rows, JAN, null, TODAY).spent, 750_00);
    assert.equal(spendingLines(rows, JAN, null, TODAY, (row) => row.subcategory)[0]?.count, 3);
    assert.equal(spendingTransactions(rows, JAN, TODAY).length, 3);
  });

  it("transfers, income and balance corrections never appear", async () => {
    const rows = await rowsFrom([
      { period: "10/01/2024, 10:00:00", inr: 100, amount: 100, category: "Food", type: "Exp." },
      { period: "10/01/2024, 10:00:00", inr: 5000, amount: 5000, category: "Salary", type: "Income" },
      { period: "10/01/2024, 10:00:00", inr: 700, amount: 700, category: "Food", type: "Expense Balance" },
      { period: "10/01/2024, 10:00:00", inr: 700, amount: 700, category: "Food", type: "Income Balance" },
      { period: "10/01/2024, 10:00:00", inr: 300, amount: 300, category: "Moves", type: "Transfer-Out", secondAccount: "Other" },
      { period: "10/01/2024, 10:00:00", inr: 300, amount: 300, category: "Moves", type: "Transfer-In", account: "Other", secondAccount: "Made-up Account" },
    ]);
    const view = buildSpending(rows, setupWith({}), { kind: "custom", from: JAN.from, to: TODAY }, TOP, TODAY);
    assert.deepEqual(view.rows.map((row) => [row.key, row.spent]), [["Food", 100_00]]);
    assert.equal(view.spent, periodMetrics(rows, setupWith({}), { from: JAN.from, to: TODAY }, TODAY).spent);
    assert.equal(spendingTransactions(rows, JAN, TODAY).length, 1);
  });

  it("AC-4, AC-10: blank names stay blank for the screen to label, and another currency keeps its original amount for reference", async () => {
    const rows = await rowsFrom([
      { period: "10/01/2024, 10:00:00", inr: 410.25, amount: 420, currency: "THB", category: "", subcategory: "" },
    ]);
    const view = buildSpending(rows, setupWith({}), { kind: "custom", from: JAN.from, to: TODAY }, { ...TOP, category: "", subcategory: "" }, TODAY);
    assert.equal(view.level, "subcategory");
    assert.equal(view.spent, 410_25);
    assert.equal(view.transactions?.list[0]?.amount, 410_25);
    assert.equal(view.transactions?.list[0]?.original, "420.00 THB");
  });

  it("Q6-2: the original amount shows two decimals and grouping, and keeps its currency code", async () => {
    const rows = await rowsFrom([
      { period: "10/01/2024, 10:00:00", inr: 83000, amount: 1000, currency: "USD", category: "Travel" },
      { period: "11/01/2024, 10:00:00", inr: 10, amount: 1234567.5, currency: "IDR", category: "Travel" },
      { period: "12/01/2024, 10:00:00", inr: 5, amount: 0.1, currency: "EUR", category: "Travel" },
    ]);
    const list = spendingTransactions(rows, { from: JAN.from, to: TODAY }, TODAY);
    assert.deepEqual(list.map((row) => row.original), ["0.10 EUR", "1,234,567.50 IDR", "1,000.00 USD"]);
  });

  it("a refund logged as a negative expense lowers its category (accepted gap)", async () => {
    const rows = await rowsFrom([
      { period: "10/01/2024, 10:00:00", inr: 100, amount: 100, category: "Food" },
      { period: "11/01/2024, 10:00:00", inr: -300, amount: -300, category: "Shop" },
    ]);
    const view = buildSpending(rows, setupWith({}), { kind: "custom", from: JAN.from, to: TODAY }, TOP, TODAY);
    assert.deepEqual(view.rows.map((row) => [row.key, row.spent]), [["Food", 100_00], ["Shop", -300_00]]);
    assert.equal(view.spent, -200_00);
  });
});

describe("Compared with (AC-3)", () => {
  it("This month compares with the same days of last month", () => {
    assert.deepEqual(comparisonDates({ kind: "this-month" }, "2026-11-07", "2021-04-03"), { from: "2026-10-01", to: "2026-10-07" });
    assert.deepEqual(comparisonDates({ kind: "this-month" }, "2026-03-31", null), { from: "2026-02-01", to: "2026-02-28" });
    assert.deepEqual(comparisonDates({ kind: "this-month" }, "2026-01-15", null), { from: "2025-12-01", to: "2025-12-15" });
  });

  it("Last 12 months and Custom use the same number of days just before", () => {
    assert.deepEqual(comparisonDates({ kind: "last-12" }, "2026-11-07", null), { from: "2024-11-08", to: "2025-11-07" });
    assert.deepEqual(comparisonDates({ kind: "custom", from: "2026-04-01", to: "2026-04-10" }, "2026-11-07", null), { from: "2026-03-22", to: "2026-03-31" });
  });

  it("Financial year compares with the same dates a year earlier, and All with nothing", () => {
    assert.deepEqual(comparisonDates({ kind: "financial-year" }, "2026-11-07", null), { from: "2025-04-01", to: "2025-11-07" });
    assert.deepEqual(comparisonDates({ kind: "financial-year" }, "2028-02-29", null), { from: "2026-04-01", to: "2027-02-28" });
    assert.equal(comparisonDates({ kind: "all" }, "2026-11-07", "2021-04-03"), null);
  });

  it("labels drop this year only", () => {
    assert.equal(comparisonLabel("2026-10-01", "2026-10-07", "2026-11-07"), "1 to 7 Oct");
    assert.equal(comparisonLabel("2025-04-01", "2025-11-07", "2026-11-07"), "1 Apr to 7 Nov 2025");
    assert.equal(comparisonLabel("2024-11-08", "2025-11-07", "2026-11-07"), "8 Nov 2024 to 7 Nov 2025");
    assert.equal(comparisonLabel("2026-10-01", "2026-10-01", "2026-11-07"), "1 Oct");
  });

  it("each line carries its earlier amount, or null when it had nothing earlier or the earlier period starts before the file", async () => {
    const rows = await rowsFrom([
      { period: "01/12/2023, 10:00:00", inr: 50, amount: 50, category: "Food" },
      { period: "05/01/2024, 10:00:00", inr: 80, amount: 80, category: "Food" },
      { period: "06/01/2024, 10:00:00", inr: 40, amount: 40, category: "Gifts" },
    ]);
    const view = buildSpending(rows, setupWith({}), { kind: "this-month" }, TOP, "2024-01-20");
    assert.equal(view.vs, "1 to 20 Dec 2023");
    assert.deepEqual(view.rows.map((row) => [row.key, row.earlier]), [["Food", 50_00], ["Gifts", null]]);
    assert.equal(view.earlier, 50_00);
    const all = buildSpending(rows, setupWith({}), { kind: "all" }, TOP, "2024-01-20");
    assert.equal(all.vs, null);
    assert.ok(all.rows.every((row) => row.earlier === null));
    // Last 12 months compares with a year that starts before the file's first row.
    const year = buildSpending(rows, setupWith({}), { kind: "last-12" }, TOP, "2024-01-20");
    assert.ok(year.vs !== null && year.rows.every((row) => row.earlier === null) && year.earlier === null);
  });
});

describe("Your groups (AC-5)", () => {
  it("one row per group with spending, plus Not grouped; no groups means no switch", async () => {
    const rows = await rowsFrom([
      { period: "05/01/2024, 10:00:00", inr: 80, amount: 80, category: "Food" },
      { period: "06/01/2024, 10:00:00", inr: 40, amount: 40, category: "Fun" },
      { period: "07/01/2024, 10:00:00", inr: 10, amount: 10, category: "Odd" },
    ]);
    const expense = ownerGroups({ names: ["Needs", "Wants"], placed: [{ category: "Food", group: "Needs" }, { category: "Fun", group: "Wants" }] });
    const setup = setupWith({ expense });
    const period = { kind: "custom", from: "2024-01-01", to: "2024-01-20" } as const;
    const view = buildSpending(rows, setup, period, { ...TOP, view: "groups" }, "2024-01-20");
    assert.equal(view.hasGroups, true);
    assert.deepEqual(view.rows.map((row) => [row.key, row.name, row.spent]), [["0", "Needs", 80_00], ["1", "Wants", 40_00], ["none", "Not grouped", 10_00]]);
    const wants = buildSpending(rows, setup, period, { ...TOP, view: "groups", group: "1" }, "2024-01-20");
    assert.equal(wants.level, "group");
    assert.equal(wants.groupName, "Wants");
    assert.deepEqual(wants.rows.map((row) => row.key), ["Fun"]);
    const throughGroup = buildSpending(rows, setup, period, { view: "groups", group: "1", category: "Fun", subcategory: null }, "2024-01-20");
    assert.equal(throughGroup.level, "category");
    assert.equal(throughGroup.spent, 40_00);

    const none = buildSpending(rows, setupWith({}), period, { ...TOP, view: "groups" }, "2024-01-20");
    assert.equal(none.hasGroups, false);
    assert.equal(none.view, "categories");
    assert.throws(() => buildSpending(rows, setup, period, { ...TOP, view: "groups", group: "2" }, "2024-01-20"), UnknownGroup);
    assert.throws(() => buildSpending(rows, setup, period, { ...TOP, view: "groups", group: "01" }, "2024-01-20"), UnknownGroup);
  });

  it("AC-12: a level with nothing in the period is empty, not an error", async () => {
    const rows = await rowsFrom([{ period: "05/01/2024, 10:00:00", inr: 80, amount: 80, category: "Food", subcategory: "Tea" }]);
    const view = buildSpending(rows, setupWith({}), { kind: "custom", from: "2024-01-10", to: "2024-01-20" }, { ...TOP, category: "Food" }, "2024-01-20");
    assert.equal(view.spent, 0);
    assert.deepEqual(view.rows, []);
  });
});

describe("Reading a path from a page", () => {
  const form = (fields: Record<string, string>) => new URLSearchParams(fields);
  it("takes the fields it knows, and refuses a broken path", () => {
    assert.deepEqual(readPath(form({})), TOP);
    assert.deepEqual(readPath(form({ view: "groups", group: "none", category: "" })), { view: "groups", group: "none", category: "", subcategory: null });
    assert.equal(readPath(form({ view: "other" })), null);
    assert.equal(readPath(form({ group: "0" })), null, "a group needs the groups view");
    assert.equal(readPath(form({ subcategory: "Tea" })), null, "a subcategory needs its category");
    assert.equal(readPath(form({ category: "x".repeat(501) })), null);
  });

  it("monthsFrom counts every month, across years", () => {
    assert.deepEqual(monthsFrom("2025-11", "2026-02"), ["2025-11", "2025-12", "2026-01", "2026-02"]);
    assert.deepEqual(monthsFrom("2026-02", "2026-02"), ["2026-02"]);
  });

  it("periodDates and Spending agree on This month", async () => {
    const { rows, setup, sample } = await loadSample();
    const dates = periodDates({ kind: "this-month" }, sample.today, null);
    assert.equal(buildSpending(rows, setup, { kind: "this-month" }, TOP, sample.today).spent, spendingTotal(rows, dates, null, sample.today).spent);
  });
});

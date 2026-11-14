import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { dateOf } from "../src/lib/import/balances.ts";
import type { ImportRow } from "../src/lib/import/parse-export.ts";
import { netWorth, netWorthBreakdown, periodMetrics, spendingByCategory } from "../src/lib/metrics/metrics.ts";
import { barBuckets, buildOverview, isOldUpload, rateState } from "../src/lib/overview/overview.ts";
import { periodDates, rangeLine } from "../src/lib/period.ts";
import type { Sample } from "../src/lib/sample/sample-export.ts";
import type { Setup } from "../src/lib/setup/setup.ts";
import { loadSample, rowsFrom, setupWith } from "./support/metrics-helpers.ts";

type Kind = "this-month" | "last-12" | "financial-year" | "all";
const PERIODS = [
  { kind: "this-month" },
  { kind: "last-12" },
  { kind: "financial-year" },
  { kind: "all" },
  { kind: "custom", from: "2025-04-01", to: "2025-06-30" },
] as const satisfies ReadonlyArray<{ kind: Kind } | { kind: "custom"; from: string; to: string }>;

describe("Overview on the sample (AC-1, AC-2, AC-5, AC-7)", () => {
  let sample: Sample;
  let rows: ImportRow[];
  let setup: Setup;
  let first: string;

  before(async () => {
    ({ sample, rows, setup } = await loadSample());
    first = rows.map(dateOf).sort()[0] ?? sample.today;
  });

  it("AC-1: net worth is today's in every period, and the change comes from the breakdown", () => {
    for (const period of PERIODS) {
      const view = buildOverview(rows, setup, period, sample.today);
      const dates = periodDates(period, sample.today, first);
      assert.equal(view.netWorth, netWorth(rows, sample.today, sample.today), period.kind);
      assert.equal(view.change, netWorthBreakdown(rows, setup, dates, sample.today).change, period.kind);
      assert.equal(view.range, rangeLine(period, sample.today, first));
    }
    assert.notEqual(buildOverview(rows, setup, { kind: "last-12" }, sample.today).change, 0);
  });

  it("AC-1: the small line is 12 month-ends, oldest first, ending on today's net worth", () => {
    const view = buildOverview(rows, setup, { kind: "this-month" }, sample.today);
    assert.equal(view.spark.length, 12);
    assert.equal(view.spark[0], netWorth(rows, "2025-07-31", sample.today));
    assert.equal(view.spark[10], netWorth(rows, "2026-05-31", sample.today));
    assert.equal(view.spark[11], view.netWorth);
    assert.equal(view.sparkFrom, "Jul 2025");
    assert.equal(view.sparkTo, "Jun 2026");
  });

  it("AC-2: Earned, Spent, Saved and Invested match periodMetrics for every period", () => {
    for (const period of PERIODS) {
      const view = buildOverview(rows, setup, period, sample.today);
      const expected = periodMetrics(rows, setup, periodDates(period, sample.today, first), sample.today);
      assert.deepEqual(
        { earned: view.earned, spent: view.spent, saved: view.saved, invested: view.invested },
        { earned: expected.earned, spent: expected.spent, saved: expected.saved, invested: expected.invested },
        period.kind,
      );
      assert.equal(view.rate, expected.earned > 0 ? expected.savingsRate : null);
    }
    const all = buildOverview(rows, setup, { kind: "all" }, sample.today);
    assert.ok(all.earned > 0 && all.spent > 0 && all.invested !== 0, "the sample isn't all zeros");
  });

  it("AC-5: This month and Last 12 months show the last 12 months, each matching the calculation code", () => {
    for (const kind of ["this-month", "last-12"] as const) {
      const { bars } = buildOverview(rows, setup, { kind }, sample.today);
      assert.equal(bars.by, "month");
      assert.deepEqual(bars.points.map((bar) => bar.label), ["Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun"]);
      const june = bars.points[11];
      assert.equal(june?.name, "Jun 2026");
      assert.equal(june?.soFar, true);
      assert.equal(bars.points[0]?.soFar, false);
      const july = periodMetrics(rows, setup, { from: "2025-07-01", to: "2025-07-31" }, sample.today);
      assert.equal(bars.points[0]?.earned, july.earned);
      assert.equal(bars.points[0]?.spent, july.spent);
    }
  });

  it("AC-5: Financial year and Custom show the period's months, and the bars add up to the stats", () => {
    for (const period of [{ kind: "financial-year" }, { kind: "custom", from: "2025-04-15", to: "2025-06-30" }] as const) {
      const view = buildOverview(rows, setup, period, sample.today);
      assert.equal(view.bars.by, "month");
      assert.deepEqual(view.bars.points.map((bar) => bar.label), period.kind === "custom" ? ["Apr", "May", "Jun"] : ["Apr", "May", "Jun"]);
      assert.equal(view.bars.points.reduce((sum, bar) => sum + bar.earned, 0), view.earned, period.kind);
      assert.equal(view.bars.points.reduce((sum, bar) => sum + bar.spent, 0), view.spent, period.kind);
    }
  });

  it("AC-5: All shows financial years when it covers more than 24 months, adding up to the stats", () => {
    const view = buildOverview(rows, setup, { kind: "all" }, sample.today);
    const months = (Number(sample.today.slice(0, 4)) - Number(first.slice(0, 4))) * 12 + Number(sample.today.slice(5, 7)) - Number(first.slice(5, 7)) + 1;
    assert.ok(months > 24, "the sample covers more than 24 months");
    assert.equal(view.bars.by, "year");
    assert.equal(view.bars.points.at(-1)?.label, "FY27");
    assert.equal(view.bars.points.at(-1)?.soFar, true);
    assert.equal(view.bars.points.reduce((sum, bar) => sum + bar.earned, 0), view.earned);
    assert.equal(view.bars.points.reduce((sum, bar) => sum + bar.spent, 0), view.spent);
  });

  it("AC-7: top categories are the 5 biggest, biggest first, adding up within Spent", () => {
    for (const period of PERIODS) {
      const view = buildOverview(rows, setup, period, sample.today);
      const all = spendingByCategory(rows, periodDates(period, sample.today, first), sample.today);
      assert.deepEqual(view.top, all.filter((line) => line.spent > 0).slice(0, 5), period.kind);
      assert.ok(view.top.length <= 5);
      for (let index = 1; index < view.top.length; index += 1) assert.ok((view.top[index - 1]?.spent ?? 0) >= (view.top[index]?.spent ?? 0));
      assert.equal(all.reduce((sum, line) => sum + line.spent, 0), view.spent, `categories add up to Spent for ${period.kind}`);
    }
  });
});

const at = (day: string, month = "11", year = "2026") => `${day}/${month}/${year}, 10:00:00`;
const TODAY = "2026-11-07";

describe("Overview states on hand-built rows (AC-3, AC-5, AC-7, AC-9, AC-10, AC-12)", () => {
  const setup = setupWith({});

  it("AC-3: the rate shows above zero and below zero, and is null when Earned is zero or below", async () => {
    const good = await rowsFrom([
      { period: at("02"), type: "Income", inr: 1000, category: "Made-up Pay" },
      { period: at("03"), type: "Exp.", inr: 560, category: "Made-up Food" },
    ]);
    const view = buildOverview(good, setup, { kind: "this-month" }, TODAY);
    assert.equal(view.rateState, "shown");
    assert.equal(view.rate, 0.44);

    const negative = await rowsFrom([
      { period: at("02"), type: "Income", inr: 1000, category: "Made-up Pay" },
      { period: at("03"), type: "Exp.", inr: 1120, category: "Made-up Food" },
    ]);
    assert.ok(Math.abs((buildOverview(negative, setup, { kind: "this-month" }, TODAY).rate ?? 0) + 0.12) < 1e-9);

    const zero = await rowsFrom([{ period: at("03"), type: "Exp.", inr: 50, category: "Made-up Food" }]);
    const zeroView = buildOverview(zero, setup, { kind: "this-month" }, TODAY);
    assert.equal(zeroView.rate, null);
    assert.equal(zeroView.rateState, "zero");

    const below = await rowsFrom([
      { period: at("02"), type: "Income", inr: -200, category: "Made-up Market Moves" },
      { period: at("03"), type: "Exp.", inr: 50, category: "Made-up Food" },
    ]);
    const belowView = buildOverview(below, setup, { kind: "this-month" }, TODAY);
    assert.equal(belowView.earned, -20_000);
    assert.equal(belowView.rate, null, "the code's negative rate is never shown when Earned is below zero (F-2)");
    assert.equal(belowView.rateState, "below");
    assert.equal(rateState(1), "shown");
  });

  it("AC-9: fewer than 10 rows in This month gives the month's name; 10 rows or other periods don't", async () => {
    const few = await rowsFrom([{ period: at("02"), type: "Exp.", inr: 50, category: "Made-up Food" }]);
    assert.equal(buildOverview(few, setup, { kind: "this-month" }, TODAY).fewRows, "November");
    assert.equal(buildOverview(few, setup, { kind: "last-12" }, TODAY).fewRows, null);
    const ten = await rowsFrom(Array.from({ length: 10 }, () => ({ period: at("02"), type: "Exp.", inr: 5, category: "Made-up Food" })));
    assert.equal(buildOverview(ten, setup, { kind: "this-month" }, TODAY).fewRows, null);
    // A future-dated row doesn't count yet.
    const future = await rowsFrom([
      { period: at("02"), type: "Exp.", inr: 5, category: "Made-up Food" },
      { period: at("20"), type: "Exp.", inr: 5, category: "Made-up Food" },
    ]);
    assert.equal(buildOverview(future, setup, { kind: "this-month" }, TODAY).rows, 1);
  });

  it("AC-10: no rows this month gives zeros, no rate, no categories, and earlier bars still show", async () => {
    const earlier = await rowsFrom([
      { period: at("10", "10"), type: "Income", inr: 900, category: "Made-up Pay" },
      { period: at("11", "10"), type: "Exp.", inr: 300, category: "Made-up Food" },
    ]);
    const view = buildOverview(earlier, setup, { kind: "this-month" }, TODAY);
    assert.deepEqual([view.earned, view.spent, view.saved, view.invested, view.rows], [0, 0, 0, 0, 0]);
    assert.equal(view.rate, null);
    assert.equal(view.fewRows, null);
    assert.deepEqual(view.top, []);
    assert.equal(view.bars.points[10]?.earned, 90_000);
    assert.equal(view.bars.points[11]?.earned, 0);
  });

  it("AC-10: an empty file gives a whole screen of zeros without failing", () => {
    for (const period of PERIODS) {
      const view = buildOverview([], setup, period, TODAY);
      assert.equal(view.netWorth, 0);
      assert.equal(view.change, 0);
      assert.equal(view.rateState, "zero");
      assert.ok(view.bars.points.length >= 1);
    }
  });

  it("AC-5: a month where Earned is below zero keeps its place on the axis", async () => {
    const rows = await rowsFrom([{ period: at("02"), type: "Income", inr: -120, category: "Made-up Market Moves" }]);
    const view = buildOverview(rows, setup, { kind: "this-month" }, TODAY);
    assert.equal(view.bars.points.length, 12);
    assert.equal(view.bars.points[11]?.label, "Nov");
    assert.equal(view.bars.points[11]?.earned, -12_000);
  });

  it("AC-7: a blank category stays blank for the screen to label, refunds can't make a negative row, fewer than 5 show fewer", async () => {
    const rows = await rowsFrom([
      { period: at("02"), type: "Exp.", inr: 50, category: "" },
      { period: at("02"), type: "Exp.", inr: 80, category: "Made-up Food" },
      { period: at("03"), type: "Exp.", inr: -30, category: "Made-up Refund" },
    ]);
    const view = buildOverview(rows, setup, { kind: "this-month" }, TODAY);
    assert.deepEqual(view.top, [{ category: "Made-up Food", spent: 8_000 }, { category: "", spent: 5_000 }]);
  });

  it("AC-5: bucket rules, including financial-year names and long Custom ranges", () => {
    assert.equal(barBuckets("financial-year", "2026-04-01", TODAY, TODAY).buckets.length, 8);
    assert.equal(barBuckets("custom", "2026-01-01", "2026-03-31", TODAY).buckets.length, 3);
    assert.equal(barBuckets("all", "2024-12-01", TODAY, TODAY).by, "month");
    const years = barBuckets("all", "2021-04-03", TODAY, TODAY);
    assert.equal(years.by, "year");
    assert.deepEqual(years.buckets.map((bucket) => bucket.label), ["FY22", "FY23", "FY24", "FY25", "FY26", "FY27"]);
    assert.equal(years.buckets[0]?.from, "2021-04-03");
    const longCustom = barBuckets("custom", "2020-01-01", "2023-12-31", TODAY);
    assert.equal(longCustom.by, "month", "Custom always shows months, however long");
    assert.equal(longCustom.buckets.length, 48);
  });

  it("Q5-1: a Custom range over more than one calendar year puts the short year on each January", () => {
    const long = barBuckets("custom", "2023-01-01", "2026-11-13", TODAY).buckets;
    assert.equal(long.length, 47);
    assert.deepEqual(long.filter((bucket) => bucket.label.startsWith("Jan")).map((bucket) => bucket.label), ["Jan 23", "Jan 24", "Jan 25", "Jan 26"]);
    assert.equal(long[1]?.label, "Feb", "other months stay short");
    assert.equal(long[0]?.name, "Jan 2023", "the tooltip keeps the full month and year");
    assert.deepEqual(barBuckets("custom", "2025-11-01", "2026-02-28", TODAY).buckets.map((bucket) => bucket.label), ["Nov", "Dec", "Jan 26", "Feb"]);
    assert.deepEqual(barBuckets("custom", "2026-01-01", "2026-03-31", TODAY).buckets.map((bucket) => bucket.label), ["Jan", "Feb", "Mar"], "one calendar year: no year");
    assert.ok(barBuckets("last-12", TODAY, TODAY, TODAY).buckets.some((bucket) => bucket.label === "Jan"), "Last 12 months keeps plain labels");
  });

  it("AC-12: the old-upload note needs more than 30 days", () => {
    assert.equal(isOldUpload(null, TODAY), false);
    assert.equal(isOldUpload("2026-10-08", TODAY), false);
    assert.equal(isOldUpload("2026-10-07", TODAY), true, "31 days");
    assert.equal(isOldUpload("2026-10-08T09:00:00", TODAY), false, "30 days");
  });
});

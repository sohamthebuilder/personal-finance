import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { periodDates, rangeLine, readPeriod } from "../src/lib/period.ts";

const TODAY = "2026-11-07";

describe("range line (design 'Rules shared by screens 7 to 16', Q4-4)", () => {
  it("matches the design's table", () => {
    assert.equal(rangeLine({ kind: "this-month" }, TODAY, null), "1 to 7 Nov 2026");
    assert.equal(rangeLine({ kind: "last-12" }, TODAY, null), "8 Nov 2025 to 7 Nov 2026");
    assert.equal(rangeLine({ kind: "financial-year" }, TODAY, null), "1 Apr to 7 Nov 2026");
    assert.equal(rangeLine({ kind: "all" }, TODAY, "2021-04-03"), "Apr 2021 to Nov 2026");
    assert.equal(rangeLine({ kind: "custom", from: "2026-04-01", to: "2026-06-30" }, TODAY, null), "1 Apr to 30 Jun 2026");
  });

  it("shows a chosen custom period across years, and a single day once", () => {
    assert.equal(rangeLine({ kind: "custom", from: "2025-12-15", to: "2026-01-10" }, TODAY, null), "15 Dec 2025 to 10 Jan 2026");
    assert.equal(rangeLine({ kind: "custom", from: "2026-11-01", to: "2026-11-01" }, TODAY, null), "1 Nov 2026");
  });

  it("handles the edges of each choice", () => {
    assert.deepEqual(periodDates({ kind: "last-12" }, "2028-02-29", null), { from: "2027-03-01", to: "2028-02-29" });
    assert.deepEqual(periodDates({ kind: "last-12" }, "2026-12-31", null), { from: "2026-01-01", to: "2026-12-31" });
    assert.deepEqual(periodDates({ kind: "financial-year" }, "2027-02-10", null), { from: "2026-04-01", to: "2027-02-10" });
    assert.deepEqual(periodDates({ kind: "financial-year" }, "2026-04-01", null), { from: "2026-04-01", to: "2026-04-01" });
    assert.equal(rangeLine({ kind: "all" }, TODAY, null), "Nov 2026");
    assert.equal(rangeLine({ kind: "this-month" }, "2026-11-01", null), "1 Nov 2026");
  });

  it("still refuses bad custom dates", () => {
    assert.deepEqual(readPeriod({ period: "custom", from: "2026-06-31", to: "2026-07-01" }, TODAY), { ok: false, error: "NOT_A_DATE" });
    assert.deepEqual(readPeriod({ period: "custom", from: "2026-07-02", to: "2026-07-01" }, TODAY), { ok: false, error: "TO_BEFORE_FROM" });
  });
});

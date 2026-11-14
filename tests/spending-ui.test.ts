import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  barWidth, categoryName, changeText, emptyText, moreLabel, rowLabel, shareText, showingLine, subcategoryName,
  transactionCount, trendLabel, trendMonth, trendSummary, trendTop,
} from "../src/app/ui/spending-words.ts";

describe("Spending wording (AC-3, AC-4, AC-8, AC-14, AC-16)", () => {
  it("AC-3: change reads +, −, Same as, or Nothing earlier; nothing on All", () => {
    assert.equal(changeText(5_000_00, 3_760_00, "1 to 7 Oct"), "+₹1,240 vs 1 to 7 Oct");
    assert.equal(changeText(1_000_00, 2_180_00, "1 to 7 Oct"), "−₹1,180 vs 1 to 7 Oct");
    assert.equal(changeText(1_000_40, 1_000_00, "1 to 7 Oct"), "Same as 1 to 7 Oct");
    assert.equal(changeText(1_000_00, null, "1 to 7 Oct"), "Nothing earlier to compare");
    assert.equal(changeText(1_000_00, 500_00, null), "");
  });

  it("AC-2: shares round, tiny ones read Under 1%, and a line at or below zero has no share or bar", () => {
    assert.equal(shareText(36_00, 100_00), "36%");
    assert.equal(shareText(40, 100_00), "Under 1%");
    assert.equal(shareText(-5_00, 100_00), "");
    assert.equal(shareText(5_00, 0), "");
    assert.equal(barWidth(50, 100), 0.5);
    assert.equal(barWidth(-50, 100), 0);
  });

  it("AC-4: blank names read No category and No subcategory", () => {
    assert.equal(categoryName(""), "No category");
    assert.equal(subcategoryName(""), "No subcategory");
    assert.equal(subcategoryName("Tea"), "Tea");
  });

  it("AC-16: a row's label has its name, amount, share and change", () => {
    assert.equal(rowLabel("Groceries", 8_640_00, ["36% of spent", "+₹1,240 vs 1 to 7 Oct"]), "Groceries, ₹8,640, 36% of spent, +₹1,240 vs 1 to 7 Oct");
  });

  it("AC-8, AC-12, AC-14: counts, more, and the empty wording", () => {
    assert.equal(transactionCount(1), "1 transaction");
    assert.equal(transactionCount(9), "9 transactions");
    assert.equal(showingLine(50, 160), "Showing 50 of 160");
    assert.equal(moreLabel(50, 160, 50), "Show 50 more");
    assert.equal(moreLabel(150, 160, 50), "Show 10 more");
    assert.equal(emptyText("top", "", true), "Nothing spent yet this month.");
    assert.equal(emptyText("top", "", false), "Nothing spent in this period.");
    assert.equal(emptyText("category", "Groceries", false), "Nothing in Groceries for this period.");
  });

  it("AC-7, AC-16: the trend names its real months and labels Januaries and the last month", () => {
    assert.equal(trendSummary("Spent by month", ["2026-09", "2026-10", "2026-11"], [5_00, 9_00, 2_00]), "Spent by month, Sep 2026 to Nov 2026. Highest month Oct 2026, ₹9. Nov 2026 so far, ₹2.");
    assert.equal(trendMonth("2026-11", 0, true), "Nov 2026 so far: nothing spent");
    assert.equal(trendMonth("2026-10", 8_640_00, false), "Oct 2026: ₹8,640");
    assert.equal(trendLabel("2025-01", false), "2025");
    assert.equal(trendLabel("2025-02", false), "");
    assert.equal(trendLabel("2026-11", true), "Nov");
    assert.equal(trendTop(0), 1_000_00);
    assert.equal(trendTop(5_100_00), 6_000_00);
    assert.equal(trendTop(10_00_000_00), 10_00_000_00);
  });
});

describe("Spending screen source (AC-9, AC-11, AC-15, AC-17)", () => {
  const source = readFileSync("src/app/ui/spending.tsx", "utf8");

  it("AC-9: file text is only ever React text, never HTML", () => {
    assert.doesNotMatch(source, /dangerouslySetInnerHTML|innerHTML/);
  });

  it("AC-11: history entries never change the web address", () => {
    for (const call of source.match(/history\.(push|replace)State\([^)]*\)/g) ?? []) assert.match(call, /State\(state, ""\)$/, call);
  });

  it("AC-15, AC-17: design system parts, sizes from script, 200ms skeleton, 500ms roll, reduced motion", () => {
    assert.doesNotMatch(source, /\bstyle=\{|style="/);
    for (const part of ["path", "ranks", "rank__meta", "txns", "txn__orig", "chart--scroll", "chart-split", "seg--2", "grid__side", "enter--back", "skel--row"]) assert.ok(source.includes(part), part);
    assert.match(source, /SKELETON_AFTER = 200\b/);
    assert.match(source, /const ROLL = 500;/);
    assert.match(source, /prefers-reduced-motion: reduce/);
  });
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { rupees, rupeesChange } from "../src/app/ui/format.ts";
import { axisTop, barLayout, chartLabel, helpLine, labelStep, labelsShown, OVERVIEW_WORDS, oldUploadLine, rateText, shortRupees } from "../src/app/ui/overview-words.ts";

describe("Overview wording (AC-3, AC-4, AC-9, AC-10, AC-11, AC-12)", () => {
  it("AC-3: the savings rate reads 44%, −12% or no rate, with the right help line", () => {
    assert.equal(rateText(0.44, "shown"), "44%");
    assert.equal(rateText(-0.12, "shown"), "−12%");
    assert.equal(rateText(null, "zero"), "no rate");
    assert.equal(rateText(-3.5, "below"), "no rate", "a negative rate from a negative Earned never shows");
    assert.equal(helpLine(null, "shown"), "");
    assert.equal(helpLine(null, "zero"), "There's no savings rate because nothing was earned in this period.");
    assert.equal(helpLine(null, "below"), "There's no savings rate because Earned is below zero in this period.");
  });

  it("AC-9: the few-rows line names the month, and comes before a no-rate reason", () => {
    assert.equal(helpLine("November", "shown"), "It's early in November, so these figures are small so far.");
    assert.equal(
      helpLine("November", "zero"),
      "It's early in November, so these figures are small so far. There's no savings rate because nothing was earned in this period.",
    );
  });

  it("AC-4: money has Indian grouping, no paise and a real minus; axes use the short form", () => {
    assert.equal(rupees(1_842_350_00), "₹18,42,350");
    assert.equal(rupees(-3_200_49), "−₹3,200");
    assert.equal(rupeesChange(48_250_00), "+₹48,250");
    assert.equal(shortRupees(0), "₹0");
    assert.equal(shortRupees(1_00_000_00), "₹1L");
    assert.equal(shortRupees(1_50_000_00), "₹1.5L");
    assert.equal(shortRupees(50_000_00), "₹50K");
    assert.equal(shortRupees(2_00_00_000_00), "₹2Cr");
    assert.equal(shortRupees(500_00), "₹500");
  });

  it("AC-5: the axis top is round, at or above the biggest bar, and so is its half", () => {
    assert.equal(axisTop(1_85_000_00), 2_00_000_00);
    assert.equal(axisTop(1_00_000_00), 1_00_000_00);
    assert.equal(axisTop(3_10_000_00), 4_00_000_00);
    assert.equal(axisTop(1), 1_00);
    for (const value of [9_99_00, 12_345_67, 98_76_543_21]) assert.ok(axisTop(value) >= value);
  });

  it("AC-10, AC-11, AC-12: the fixed lines", () => {
    assert.equal(OVERVIEW_WORDS.noSpendThisMonth, "Nothing spent yet this month.");
    assert.equal(OVERVIEW_WORDS.noSpendPeriod, "Nothing in this period.");
    assert.equal(OVERVIEW_WORDS.showThisMonth, "Show this month");
    assert.equal(OVERVIEW_WORDS.failed, "This screen couldn't load. Your data is safe.");
    assert.equal(oldUploadLine("2026-10-12"), "Your last upload was 12 Oct 2026, so recent months may be missing.");
  });
});

describe("Overview screen source (AC-6, AC-8, AC-14, AC-16)", () => {
  const source = readFileSync("src/app/ui/overview.tsx", "utf8");

  it("AC-8: the skeleton waits 200ms, is marked busy, and has no shimmer", () => {
    assert.match(source, /SKELETON_AFTER = 200\b/);
    assert.match(source, /aria-busy="true" aria-label="Loading"/);
    assert.doesNotMatch(readFileSync("src/app/system.css", "utf8").split("Loading skeleton")[1]?.split("/* ----------")[0] ?? "", /@keyframes|gradient|infinite/);
  });

  it("AC-14: numbers roll 500ms, bars move 400ms, reduced motion shows at once, the small line never animates", () => {
    assert.match(source, /const ROLL = 500;/);
    assert.match(source, /const BAR_MOVE = 400;/);
    assert.match(source, /prefers-reduced-motion: reduce/);
    const spark = source.slice(source.indexOf("function Spark"), source.indexOf("function Bars"));
    assert.doesNotMatch(spark, /requestAnimationFrame|roll\.|transition/);
  });

  it("AC-6: the chart is one Tab stop with a label, moved by the arrow keys", () => {
    const bars = source.slice(source.indexOf("function Bars"), source.indexOf("export function OverviewSkeleton"));
    assert.equal(bars.match(/tabIndex=\{0\}/g)?.length, 1);
    assert.match(bars, /aria-label=\{chartLabel\(props\.by, bars\)\}/);
    assert.match(bars, /ArrowRight/);
    assert.match(bars, /ArrowLeft/);
  });

  it("AC-16: uses the design system's parts and sets sizes from script, never with inline styles", () => {
    assert.doesNotMatch(source, /\bstyle=\{|style="/);
    for (const part of ["card--hero", "figure--display", "stats", "chart__tip", "chart__bar", "legend", "skel--chart", "meter"]) assert.ok(source.includes(part), part);
  });
});

/** Bars named the way the server names them: "Jan 2023" onwards. */
function monthBars(firstYear: number, firstMonth: number, count: number) {
  const short = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return Array.from({ length: count }, (_, index) => {
    const at = firstYear * 12 + firstMonth - 1 + index;
    const month = short[at % 12] ?? "";
    const year = Math.floor(at / 12);
    return { name: `${month} ${year}`, label: month === "Jan" ? `Jan ${String(year % 100).padStart(2, "0")}` : month };
  });
}

describe("Overview chart fit (QA Q5-1, Q5-4)", () => {
  // The bars chart's box at each width, less the 40px axis, measured in the browser (2026-11-14): 505, 311 and 256 wide.
  // Real 12px label widths there: "Jan 25" 38.9px, "May" 22.8px, so 7.5px a character plus an 8px gap is safe.
  const plots = { 1280: 465, 375: 271, 320: 216 };

  it("Q5-1: labels never overlap at 1280, 375 or 320, even on a 47-month Custom range", () => {
    for (const count of [3, 12, 24, 47, 120]) {
      const bars = monthBars(2023, count === 12 ? 12 : 1, count);
      for (const [screen, plot] of Object.entries(plots)) {
        const slot = plot / count;
        const step = labelStep(slot, bars.map((bar) => bar.label));
        const shown = labelsShown(bars, "month", step);
        const at = shown.flatMap((on, index) => (on ? [index] : []));
        assert.ok(at.length > 0, `${count} months at ${screen}: some labels show`);
        for (let index = 1; index < at.length; index += 1) {
          const apart = ((at[index] ?? 0) - (at[index - 1] ?? 0)) * slot;
          const widest = Math.max(...bars.map((bar) => bar.label.length)) * 7.5;
          assert.ok(apart >= widest, `${count} months at ${screen}: labels ${apart}px apart, need ${widest}`);
        }
      }
    }
  });

  it("Q5-1: steps divide a year, so labels land on January and every January shows its year", () => {
    const bars = monthBars(2023, 1, 47);
    assert.equal(labelStep(40, ["Jan"]), 1);
    assert.equal(labelStep(16, ["Nov"]), 2);
    assert.equal(labelStep(15, ["Nov"]), 3);
    const step = labelStep(216 / 47, bars.map((bar) => bar.label));
    assert.equal(step, 12, "at 320, a 47-month range labels only the Januaries");
    const shown = bars.filter((_, index) => labelsShown(bars, "month", step)[index]).map((bar) => bar.label);
    assert.deepEqual(shown, ["Jan 23", "Jan 24", "Jan 25", "Jan 26"]);
    const wide = labelStep(465 / 47, bars.map((bar) => bar.label));
    assert.ok([3, 4, 6].includes(wide), `at 1280, every ${wide} months`);
    assert.ok(bars.every((bar, index) => !bar.label.startsWith("Jan") || labelsShown(bars, "month", wide)[index]), "every January shows at 1280");
    const years = [{ name: "FY25" }, { name: "FY26" }, { name: "FY27" }];
    assert.deepEqual(labelsShown(years, "year", 2), [true, false, true], "years line up on the last bar");
  });

  it("Q5-1: Earned and Spent sit side by side and never cover each other or the next month", () => {
    for (const count of [3, 12, 47, 120]) {
      for (const plot of Object.values(plots)) {
        const slot = plot / count;
        const { width, gap } = barLayout(slot, count);
        assert.ok(width > 0 && gap > 0, "both bars show");
        assert.ok(2 * width + gap < slot, `${count} bars in ${plot}px: the pair fits its slot with room to spare`);
      }
    }
    assert.equal(barLayout(60, 3).width, 18, "short ranges keep the usual width");
    assert.equal(barLayout(53, 12).width, 12);
  });

  it("Q5-4: the chart's label names the months it really shows, not the period", () => {
    assert.equal(
      chartLabel("month", [{ name: "Dec 2025" }, { name: "Nov 2026" }]),
      "Earned and spent by month, Dec 2025 to Nov 2026. Use the left and right arrow keys to hear each month.",
    );
    assert.equal(chartLabel("year", [{ name: "FY23" }, { name: "FY27" }]), "Earned and spent by year, FY23 to FY27. Use the left and right arrow keys to hear each year.");
    assert.equal(chartLabel("month", [{ name: "Nov 2026" }]), "Earned and spent by month, Nov 2026. Use the left and right arrow keys to hear each month.");
  });
});

describe("Overview QA fixes in the design system and shell (Q5-2, Q5-3, Q5-5)", () => {
  const css = readFileSync("src/app/system.css", "utf8");

  it("Q5-2: the hero's flat or falling change uses the hero's own light ink; gains keep rail-gain", () => {
    assert.match(css, /\.card--hero \.delta \{ color: var\(--rail-ink-2\); \}/);
    assert.match(css, /\.card--hero \.delta--up \{ color: var\(--rail-gain\); \}/);
    assert.ok(css.indexOf(".card--hero .delta {") < css.indexOf(".card--hero .delta--up {"), "the gain colour wins");
  });

  it("Q5-3: a stat figure shrinks with its tile and stays on one line", () => {
    assert.match(css, /\.stat \{ container-type: inline-size; \}/);
    assert.match(css, /\.stat \.figure \{ font-size: min\(var\(--t-figure\), 15cqi\); white-space: nowrap; \}/);
  });

  it("Q5-5: Reload also refreshes the server-drawn notes, and the data note starts over when the data changes", () => {
    const source = readFileSync("src/app/ui/overview.tsx", "utf8");
    const reload = source.slice(source.indexOf("function reload()"), source.indexOf("async function dismissOld"));
    assert.match(reload, /router\.refresh\(\)/);
    assert.match(reload, /load\(true\)/);
    assert.match(source, /onClick=\{reload\}/);
    assert.match(readFileSync("src/app/page.tsx", "utf8"), /<DataNote key=\{`\$\{state\.note\}\|\$\{state\.version\}`\}/);
  });
});

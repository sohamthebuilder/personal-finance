/** Screen 9's fixed wording and chart numbers (design, "Screen 9" and "Savings rate"). */
import type { Bar, RateState } from "../../lib/overview/overview.ts";
import { longDate } from "./format.ts";

export const OVERVIEW_WORDS = {
  rateZero: "There's no savings rate because nothing was earned in this period.",
  rateBelow: "There's no savings rate because Earned is below zero in this period.",
  noSpendThisMonth: "Nothing spent yet this month.",
  noSpendPeriod: "Nothing in this period.",
  showThisMonth: "Show this month",
  failed: "This screen couldn't load. Your data is safe.",
  tryAgain: "Try again",
} as const;

/** "44%", "−12%" or "no rate". A real minus sign, never a hyphen. */
export function rateText(rate: number | null, state: RateState): string {
  if (state !== "shown" || rate === null) return "no rate";
  const whole = Math.round(rate * 100);
  return whole < 0 ? `−${Math.abs(whole)}%` : `${whole}%`;
}

/** The stats card's help line: the few-rows line, then the no-rate reason. Empty when neither applies. */
export function helpLine(fewRows: string | null, state: RateState): string {
  const lines: string[] = [];
  if (fewRows !== null) lines.push(`It's early in ${fewRows}, so these figures are small so far.`);
  if (state === "zero") lines.push(OVERVIEW_WORDS.rateZero);
  if (state === "below") lines.push(OVERVIEW_WORDS.rateBelow);
  return lines.join(" ");
}

export function oldUploadLine(date: string): string {
  return `Your last upload was ${longDate(date)}, so recent months may be missing.`;
}

/** The chart axis's short form: "₹0", "₹500", "₹50K", "₹1L", "₹1.5L", "₹2Cr". Whole rupees from paise. */
export function shortRupees(paise: number): string {
  const rupees = Math.round(Math.abs(paise) / 100);
  const sign = paise < 0 && rupees !== 0 ? "−" : "";
  const trim = (value: number) => String(Number(value.toFixed(1)));
  if (rupees >= 1_00_00_000) return `${sign}₹${trim(rupees / 1_00_00_000)}Cr`;
  if (rupees >= 1_00_000) return `${sign}₹${trim(rupees / 1_00_000)}L`;
  if (rupees >= 1_000) return `${sign}₹${trim(rupees / 1_000)}K`;
  return `${sign}₹${rupees}`;
}

/** A round top for the chart's axis, at or above the biggest bar, whose half is round too. In paise. */
export function axisTop(largest: number): number {
  const rupees = Math.max(1, Math.ceil(largest / 100));
  const size = 10 ** Math.floor(Math.log10(rupees));
  for (const step of [1, 2, 4, 5, 10]) if (step * size >= rupees) return step * size * 100;
  return 10 * size * 100;
}

/** The chart's screen-reader label, naming the months or years it really shows (QA Q5-4). */
export function chartLabel(by: "month" | "year", bars: readonly Pick<Bar, "name">[]): string {
  const first = bars[0]?.name ?? "";
  const last = bars.at(-1)?.name ?? "";
  const span = bars.length > 1 ? `${first} to ${last}` : first;
  return `Earned and spent by ${by}, ${span}. Use the left and right arrow keys to hear each ${by}.`;
}

/** Chart axis text is 12px (design system `.chart text`); a generous width per character, plus a gap between labels. */
const LABEL_CHAR_PX = 7.5;
const LABEL_GAP_PX = 8;
const MONTH_STEPS = [1, 2, 3, 4, 6, 12];
const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * How many bars apart the axis labels go, from the measured width of one bar's slot,
 * so no two labels ever touch (QA Q5-1). Steps divide a year (then whole years), so labels land on the same months.
 */
export function labelStep(slot: number, labels: readonly string[]): number {
  const widest = Math.max(0, ...labels.map((label) => label.length)) * LABEL_CHAR_PX + LABEL_GAP_PX;
  if (slot <= 0) return Math.max(1, labels.length);
  for (const step of MONTH_STEPS) if (step * slot >= widest) return step;
  return 12 * Math.ceil(widest / (12 * slot));
}

/**
 * Which bars carry a label. Months line up on January ("Jan 25" then shows its year);
 * years, or bars whose month can't be read, line up on the last bar.
 */
export function labelsShown(bars: readonly Pick<Bar, "name">[], by: "month" | "year", step: number): boolean[] {
  const count = bars.length;
  return bars.map((bar, index) => {
    if (step <= 1) return true;
    const month = SHORT.indexOf(bar.name.slice(0, 3));
    const year = Number(bar.name.slice(-4));
    if (by === "year" || month < 0 || !Number.isInteger(year)) return index % step === (count - 1) % step;
    const monthsIn = year * 12 + month;
    return monthsIn % step === 0;
  });
}

/** Earned and Spent sit side by side in each slot with a gap, never over each other or the next month (QA Q5-1). */
export function barLayout(slot: number, count: number): { width: number; gap: number } {
  const gap = Math.min(1, slot * 0.1);
  const most = Math.max(0, (slot - 3 * gap) / 2);
  return { width: Math.min(count < 8 ? 20 : 12, Math.max(4, slot * 0.3), most), gap };
}

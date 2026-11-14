/** Screen 10's fixed wording (design "Screen 10: Spending", Phase 6 preview notes). */
import { categoryName, monthYear, rupees, rupeesChange } from "./format.ts";

export const SPENDING_WORDS = {
  nothingEarlier: "Nothing earlier to compare",
  noSpendThisMonth: "Nothing spent yet this month.",
  noSpendPeriod: "Nothing spent in this period.",
  showThisMonth: "Show this month",
  noNote: "No note",
  failed: "This screen couldn't load. Your data is safe.",
  tryAgain: "Try again",
} as const;

/** The app's own label for a blank subcategory (design, "Blank names"). */
export function subcategoryName(name: string): string {
  return name === "" ? "No subcategory" : name;
}

export { categoryName };

/**
 * A line's change against the earlier period: "+₹1,240 vs 1 to 7 Oct", "−₹1,180 vs …",
 * "Same as …", or "Nothing earlier to compare". Empty on All, where nothing is compared.
 * Whole rupees, as shown, so a change of a few paise reads "Same as".
 */
export function changeText(spent: number, earlier: number | null, vs: string | null): string {
  if (vs === null) return "";
  if (earlier === null) return SPENDING_WORDS.nothingEarlier;
  const change = spent - earlier;
  return Math.round(change / 100) === 0 ? `Same as ${vs}` : `${rupeesChange(change)} vs ${vs}`;
}

/** "36%", "Under 1%", or empty for a line at or below zero, or a total at or below zero. */
export function shareText(spent: number, total: number): string {
  if (total <= 0 || spent <= 0) return "";
  const share = (spent / total) * 100;
  return share < 1 ? "Under 1%" : `${Math.round(share)}%`;
}

/** A row's bar: amount ÷ the level's largest amount. None at or below zero. */
export function barWidth(spent: number, largest: number): number {
  return spent <= 0 || largest <= 0 ? 0 : Math.min(1, spent / largest);
}

/** What a row says to a screen reader: name, amount, share and change. */
export function rowLabel(name: string, spent: number, meta: readonly string[]): string {
  return [name, rupees(spent), ...meta].join(", ");
}

/** The empty level's wording. */
export function emptyText(level: "top" | "group" | "category" | "subcategory", name: string, thisMonth: boolean): string {
  if (level !== "top") return `Nothing in ${name} for this period.`;
  return thisMonth ? SPENDING_WORDS.noSpendThisMonth : SPENDING_WORDS.noSpendPeriod;
}

/** "9 transactions", "1 transaction". */
export function transactionCount(count: number): string {
  return `${count} transaction${count === 1 ? "" : "s"}`;
}

/** "Showing 50 of 160". */
export function showingLine(shown: number, count: number): string {
  return `Showing ${shown} of ${count}`;
}

/** "Show 50 more", or fewer when fewer are left. */
export function moreLabel(shown: number, count: number, page: number): string {
  return `Show ${Math.min(page, count - shown)} more`;
}

/** The trend's text for screen readers: first and last months, the highest month, and this month so far. */
export function trendSummary(title: string, months: readonly string[], values: readonly number[]): string {
  const first = months[0];
  const last = months.at(-1);
  if (first === undefined || last === undefined) return title;
  let high = 0;
  values.forEach((value, index) => {
    if (value > (values[high] ?? 0)) high = index;
  });
  return `${title}, ${monthYear(first)} to ${monthYear(last)}. Highest month ${monthYear(months[high] ?? first)}, ${rupees(values[high] ?? 0)}. ${monthYear(last)} so far, ${rupees(values.at(-1) ?? 0)}.`;
}

/** One trend month, as the live region reads it: "Oct 2026: ₹8,640", or "Nov 2026 so far: nothing spent". */
export function trendMonth(month: string, value: number, isLast: boolean): string {
  return `${monthYear(month)}${isLast ? " so far" : ""}: ${value === 0 ? "nothing spent" : rupees(value)}`;
}

/** A trend bar's axis label: the year on each January, the month on the last bar, nothing elsewhere. */
export function trendLabel(month: string, isLast: boolean): string {
  if (isLast) return monthYear(month).slice(0, 3);
  return month.slice(5, 7) === "01" ? month.slice(0, 4) : "";
}

/** A round axis top at or above the largest month, in paise (the preview's steps: 1, 2, 4, 6, 8, 10). */
export function trendTop(largest: number): number {
  const rupeesUp = Math.ceil(largest / 100);
  if (rupeesUp <= 0) return 1_000_00;
  const size = 10 ** Math.floor(Math.log10(rupeesUp));
  for (const step of [1, 2, 4, 6, 8, 10]) if (step * size >= rupeesUp) return step * size * 100;
  return 10 * size * 100;
}

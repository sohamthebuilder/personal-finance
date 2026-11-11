/**
 * Money, counts and dates as the screens write them. Done by hand, not with
 * the browser's own formatter, so the server and the page always agree.
 */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Indian grouping: 18,42,350. */
export function grouped(whole: number): string {
  const digits = String(Math.abs(Math.trunc(whole)));
  const last = digits.slice(-3);
  const rest = digits.slice(0, -3);
  return (rest === "" ? "" : `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},`) + last;
}

/** Whole rupees from paise, such as "₹18,42,350" or "−₹3,200". */
export function rupees(paise: number): string {
  const whole = Math.round(Math.abs(paise) / 100);
  return `${paise < 0 && whole !== 0 ? "−" : ""}₹${grouped(whole)}`;
}

/** Rupees with paise, such as "₹1,200.00". */
export function rupeesExact(paise: number): string {
  const size = Math.abs(paise);
  return `${paise < 0 ? "−" : ""}₹${grouped(Math.floor(size / 100))}.${String(size % 100).padStart(2, "0")}`;
}

/** A change with its sign, such as "+₹48,250". */
export function rupeesChange(paise: number): string {
  return paise < 0 ? rupees(paise) : `+${rupees(paise)}`;
}

/** "28 Nov 2026" from "2026-11-28". */
export function longDate(iso: string): string {
  return `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1] ?? ""} ${iso.slice(0, 4)}`;
}

/** "Jan 2024" from "2024-01". */
export function monthYear(month: string): string {
  return `${MONTHS[Number(month.slice(5, 7)) - 1] ?? ""} ${month.slice(0, 4)}`;
}

export const MONTH_CHOICES = MONTHS.map((label, index) => ({ value: String(index + 1).padStart(2, "0"), label }));

/** "1 account" or "2 accounts". */
export function countOf(count: number, one: string, many: string): string {
  return `${grouped(count)} ${count === 1 ? one : many}`;
}

/** The app's own label for a blank category (design, "Blank names"). */
export function categoryName(name: string): string {
  return name === "" ? "No category" : name;
}

export const GROUP_ICONS = {
  Bank: "bank",
  Cards: "card",
  Wallets: "wallet",
  Investments: "trend",
  "Money with others": "people",
  Business: "case",
} as const;

export function groupIcon(group: string): "bank" | "card" | "wallet" | "trend" | "people" | "case" | "q" {
  return Object.hasOwn(GROUP_ICONS, group) ? GROUP_ICONS[group as keyof typeof GROUP_ICONS] : "q";
}

/**
 * The search count (QA Q4B-3): every row shown, plus every group shown because its
 * own name matched. So the count is never 0 while something shows.
 */
export function matchCount(shown: ReadonlyArray<{ rows: readonly unknown[]; groupHit: boolean }>): number {
  return shown.reduce((total, item) => total + item.rows.length + (item.groupHit ? 1 : 0), 0);
}

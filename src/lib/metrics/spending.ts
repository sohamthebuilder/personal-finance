/**
 * Spending broken down: by category, subcategory and the owner's expense
 * groups, against an earlier period, by month, and row by row. Every figure is
 * built from `spentRows`, the same rows as Spent in `periodMetrics`, so the
 * Spending screen and the Overview can't disagree. All amounts are whole paise.
 */
import { dateOf } from "../import/balances.ts";
import type { ImportRow } from "../import/parse-export.ts";
import { NOT_GROUPED, type Setup } from "../setup/setup.ts";
import { type Period, spentRows } from "./metrics.ts";

/** Which rows a figure covers, such as one category's. */
export type RowFilter = (row: ImportRow) => boolean;

export interface SpendLine {
  /** What the line is keyed by: a category or subcategory as written (blank stays blank), or a group key. */
  key: string;
  spent: number;
  /** Spent on the same key in the earlier period, or null when there's no earlier period or no earlier rows for it. */
  earlier: number | null;
  /** Rows behind `spent`. */
  count: number;
}

export interface SpendTotal {
  spent: number;
  earlier: number | null;
  count: number;
}

/** The key for "Not grouped" among the owner's expense groups. */
export const NOT_GROUPED_KEY = "none";

/** A category's expense group, as its place in the owner's list ("0", "1"…), or "none" for Not grouped. */
export function expenseGroupKey(setup: Setup, category: string): string {
  const index = setup.expense.placed.get(category);
  return index === undefined || index < 0 || index >= setup.expense.names.length ? NOT_GROUPED_KEY : String(index);
}

/** A group key's name: the owner's group name, or Not grouped. */
export function expenseGroupName(setup: Setup, key: string): string {
  return key === NOT_GROUPED_KEY ? NOT_GROUPED : (setup.expense.names[Number(key)] ?? NOT_GROUPED);
}

const everyRow: RowFilter = () => true;

function totals(rows: readonly ImportRow[], keyOf: (row: ImportRow) => string): Map<string, { spent: number; count: number }> {
  const out = new Map<string, { spent: number; count: number }>();
  for (const row of rows) {
    const key = keyOf(row);
    const line = out.get(key) ?? { spent: 0, count: 0 };
    line.spent += row.amountPaise;
    line.count += 1;
    out.set(key, line);
  }
  return out;
}

/**
 * Spending lines for a period, one per key with at least one row in it, biggest
 * first (ties by key). They add up exactly to `spendingTotal` with the same filter.
 * `compare` is the earlier period, or null when nothing is compared.
 */
export function spendingLines(
  rows: readonly ImportRow[],
  period: Period,
  compare: Period | null,
  today: string,
  keyOf: (row: ImportRow) => string,
  filter: RowFilter = everyRow,
): SpendLine[] {
  const now = totals(spentRows(rows, period, today).filter(filter), keyOf);
  const before = compare === null ? null : totals(spentRows(rows, compare, today).filter(filter), keyOf);
  return [...now]
    .map(([key, line]) => ({ key, spent: line.spent, count: line.count, earlier: before?.get(key)?.spent ?? null }))
    .sort((a, b) => b.spent - a.spent || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/** Spent on the rows a filter covers, now and in the earlier period. Earlier is null when that period has none of them. */
export function spendingTotal(rows: readonly ImportRow[], period: Period, compare: Period | null, today: string, filter: RowFilter = everyRow): SpendTotal {
  const now = spentRows(rows, period, today).filter(filter);
  const before = compare === null ? [] : spentRows(rows, compare, today).filter(filter);
  return {
    spent: now.reduce((sum, row) => sum + row.amountPaise, 0),
    earlier: before.length === 0 ? null : before.reduce((sum, row) => sum + row.amountPaise, 0),
    count: now.length,
  };
}

const pad = (value: number) => String(value).padStart(2, "0");

/** Every month from `firstMonth` to `lastMonth`, both "YYYY-MM". */
export function monthsFrom(firstMonth: string, lastMonth: string): string[] {
  const start = Number(firstMonth.slice(0, 4)) * 12 + Number(firstMonth.slice(5, 7)) - 1;
  const end = Number(lastMonth.slice(0, 4)) * 12 + Number(lastMonth.slice(5, 7)) - 1;
  const out: string[] = [];
  for (let at = start; at <= Math.max(start, end); at += 1) out.push(`${Math.floor(at / 12)}-${pad((at % 12) + 1)}`);
  return out;
}

function monthEnd(month: string): string {
  return `${month}-${pad(new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate())}`;
}

/**
 * Spent by month on the rows a filter covers, one value per month in `months`,
 * up to today. A month with nothing in it is zero.
 */
export function monthlySpending(rows: readonly ImportRow[], months: readonly string[], today: string, filter: RowFilter = everyRow): number[] {
  if (months.length === 0) return [];
  const first = months[0] ?? today.slice(0, 7);
  const last = months.at(-1) ?? first;
  const index = new Map(months.map((month, at) => [month, at]));
  const values = months.map(() => 0);
  const span = { from: `${first}-01`, to: monthEnd(last) };
  for (const row of spentRows(rows, { from: span.from, to: span.to < today ? span.to : today }, today).filter(filter)) {
    const at = index.get(dateOf(row).slice(0, 7));
    if (at !== undefined) values[at] = (values[at] ?? 0) + row.amountPaise;
  }
  return values;
}

export interface SpendRow {
  /** "YYYY-MM-DD" */
  date: string;
  account: string;
  /** INR, in paise. The only amount used in totals. */
  amount: number;
  note: string;
  /** The amount and currency as written, such as "420.00 THB", when it wasn't INR. Reference only. */
  original: string | null;
}

/** An amount as written in another currency, with two decimals and grouping, such as "1,000.00". Left as written when it isn't a number. */
function originalAmount(written: string): string {
  const value = Number(written.replace(/,/g, "").trim());
  if (written.trim() === "" || !Number.isFinite(value)) return written;
  const [whole = "0", cents = "00"] = Math.abs(value).toFixed(2).split(".");
  return `${value < 0 && Math.abs(value) >= 0.005 ? "−" : ""}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${cents}`;
}

/** The rows behind a figure, newest first (the later row in the file first on the same time). */
export function spendingTransactions(rows: readonly ImportRow[], period: Period, today: string, filter: RowFilter = everyRow): SpendRow[] {
  return spentRows(rows, period, today)
    .filter(filter)
    .sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : a.occurredAt > b.occurredAt ? -1 : b.rowNumber - a.rowNumber))
    .map((row) => ({
      date: dateOf(row),
      account: row.account,
      amount: row.amountPaise,
      note: row.note,
      original: row.currency !== "" && row.currency !== "INR" ? `${originalAmount(row.originalAmount)} ${row.currency}` : null,
    }));
}

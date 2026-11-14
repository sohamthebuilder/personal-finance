/**
 * Screen 10, Spending, worked out on the server one level at a time. Every
 * figure comes from `metrics/spending.ts`; this file only picks which rows a
 * level covers and which periods to ask for.
 */
import type Database from "better-sqlite3-multiple-ciphers";
import type { Period as SessionPeriod } from "../auth/session.ts";
import { dataState } from "../data/state.ts";
import { dateOf } from "../import/balances.ts";
import type { ImportRow } from "../import/parse-export.ts";
import { readRows } from "../import/store.ts";
import {
  expenseGroupKey, expenseGroupName, monthlySpending, monthsFrom, NOT_GROUPED_KEY, type RowFilter,
  type SpendRow, spendingLines, spendingTotal, spendingTransactions,
} from "../metrics/spending.ts";
import { isOldUpload } from "../overview/overview.ts";
import { comparisonDates, comparisonLabel, periodDates, rangeLine } from "../period.ts";
import { loadSetup } from "../setup/store.ts";
import type { Setup } from "../setup/setup.ts";

/** Transactions come 50 at a time (design, screen 10). */
export const PAGE_SIZE = 50;
/** The most a page can ask for, so a request can't ask for everything at once by mistake. */
export const MOST_SHOWN = 100_000;

export type SpendingView = "categories" | "groups";

/** Where the owner is. Names come back from the page as plain text and only ever pick rows. */
export interface SpendingPath {
  view: SpendingView;
  /** A group key ("0", "1"… or "none"), when the path goes through a group. */
  group: string | null;
  /** A category as written, blank included. Null above level 2. */
  category: string | null;
  /** A subcategory as written, blank included. Null above level 3. */
  subcategory: string | null;
}

export const TOP: SpendingPath = { view: "categories", group: null, category: null, subcategory: null };

export interface LevelRow {
  key: string;
  /** As written. Blank category and subcategory names are labelled by the screen. */
  name: string;
  spent: number;
  earlier: number | null;
}

export interface SpendingLevel {
  level: "top" | "group" | "category" | "subcategory";
  view: SpendingView;
  /** The owner has expense groups, so the switch can show. */
  hasGroups: boolean;
  /** The group's name on a path through a group. */
  groupName: string | null;
  range: string;
  /** "1 to 7 Oct", or null on All, where nothing is compared. */
  vs: string | null;
  spent: number;
  earlier: number | null;
  count: number;
  /** Ranked rows, biggest first. Empty on level 3. */
  rows: LevelRow[];
  /** Level 3 only: the newest `shown` rows, and how many there are in all. */
  transactions: { list: SpendRow[]; count: number } | null;
  trend: { months: string[]; values: number[] };
  /** This month is chosen, for the empty wording. */
  thisMonth: boolean;
}

export class UnknownGroup extends Error {
  constructor() {
    super("That group isn't in Setup.");
    this.name = "UnknownGroup";
  }
}

function firstDate(rows: readonly ImportRow[]): string | null {
  let first: string | null = null;
  for (const row of rows) {
    const date = dateOf(row);
    if (first === null || date < first) first = date;
  }
  return first;
}

/** One level of the Spending screen. `today` comes from the server. */
export function buildSpending(rows: readonly ImportRow[], setup: Setup, period: SessionPeriod, path: SpendingPath, today: string, shown = PAGE_SIZE): SpendingLevel {
  const hasGroups = setup.expense.names.length > 0;
  const view: SpendingView = hasGroups ? path.view : "categories";
  const group = view === "groups" ? path.group : null;
  const knownGroup = group === null || group === NOT_GROUPED_KEY || (/^(0|[1-9][0-9]?)$/.test(group) && Number(group) < setup.expense.names.length);
  if (!knownGroup) throw new UnknownGroup();

  const first = firstDate(rows);
  const dates = periodDates(period, today, first);
  const earlierDates = comparisonDates(period, today, first);
  // A comparison that starts before the file has nothing to compare with (design "Compared with").
  const compare = earlierDates !== null && first !== null && earlierDates.from >= first ? earlierDates : null;
  const vs = earlierDates === null ? null : comparisonLabel(earlierDates.from, earlierDates.to, today);

  const inGroup: RowFilter = (row) => group === null || expenseGroupKey(setup, row.category) === group;
  const inCategory: RowFilter = (row) => inGroup(row) && (path.category === null || row.category === path.category);
  const inSubcategory: RowFilter = (row) => inCategory(row) && (path.subcategory === null || row.subcategory === path.subcategory);

  const level: SpendingLevel["level"] =
    path.subcategory !== null && path.category !== null ? "subcategory" : path.category !== null ? "category" : group !== null ? "group" : "top";

  const total = spendingTotal(rows, dates, compare, today, inSubcategory);
  let lines: LevelRow[] = [];
  if (level === "top" && view === "groups") {
    lines = spendingLines(rows, dates, compare, today, (row) => expenseGroupKey(setup, row.category)).map((line) => ({ ...line, name: expenseGroupName(setup, line.key) }));
  } else if (level === "top" || level === "group") {
    lines = spendingLines(rows, dates, compare, today, (row) => row.category, inGroup).map((line) => ({ ...line, name: line.key }));
  } else if (level === "category") {
    lines = spendingLines(rows, dates, compare, today, (row) => row.subcategory, inCategory).map((line) => ({ ...line, name: line.key }));
  }
  lines = lines.map(({ key, name, spent, earlier }) => ({ key, name, spent, earlier }));

  // The trend covers the whole file whatever the period. Level 3 keeps its category's trend.
  const months = monthsFrom((first ?? today).slice(0, 7), today.slice(0, 7));
  const trendFilter = level === "subcategory" ? inCategory : inSubcategory;
  const size = Math.min(MOST_SHOWN, Math.max(PAGE_SIZE, Math.trunc(shown)));
  const list = level === "subcategory" ? spendingTransactions(rows, dates, today, inSubcategory) : null;

  return {
    level,
    view,
    hasGroups,
    groupName: group === null ? null : expenseGroupName(setup, group),
    range: rangeLine(period, today, first),
    vs,
    spent: total.spent,
    earlier: total.earlier,
    count: total.count,
    rows: lines,
    transactions: list === null ? null : { list: list.slice(0, size), count: list.length },
    trend: { months, values: monthlySpending(rows, months, today, trendFilter) },
    thisMonth: period.kind === "this-month",
  };
}

/** Reads the form a page sends. Anything out of shape gives null. */
export function readPath(form: URLSearchParams): SpendingPath | null {
  const view = form.get("view") ?? "categories";
  if (view !== "categories" && view !== "groups") return null;
  const group = form.get("group");
  const category = form.get("category");
  const subcategory = form.get("subcategory");
  if (group !== null && view !== "groups") return null;
  if (subcategory !== null && category === null) return null;
  for (const text of [group, category, subcategory]) if (text !== null && text.length > 500) return null;
  return { view, group, category, subcategory };
}

export interface SpendingAnswer {
  spending: SpendingLevel;
  path: SpendingPath;
  version: number;
  oldUpload: string | null;
}

/** Reads the saved data and builds one level. */
export function spendingFor(db: Database.Database, period: SessionPeriod, path: SpendingPath, today: string, shown: number): SpendingAnswer {
  const state = dataState(db);
  return {
    spending: buildSpending(readRows(db), loadSetup(db), period, path, today, shown),
    path,
    version: state.version,
    oldUpload: isOldUpload(state.lastUploadDate, today) ? (state.lastUploadDate ?? "").slice(0, 10) : null,
  };
}

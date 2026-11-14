/**
 * Screen 9, the Overview, worked out on the server. Every figure comes from
 * the Phase 2 calculation code in `metrics.ts`; nothing here does its own sums
 * beyond picking which periods to ask for.
 */
import type Database from "better-sqlite3-multiple-ciphers";
import type { Period as SessionPeriod } from "../auth/session.ts";
import { dataState } from "../data/state.ts";
import { dateOf } from "../import/balances.ts";
import type { ImportRow } from "../import/parse-export.ts";
import { readRows } from "../import/store.ts";
import { type CategorySpend, netWorth, netWorthBreakdown, periodMetrics, spendingByCategory } from "../metrics/metrics.ts";
import { periodDates, rangeLine } from "../period.ts";
import { loadSetup } from "../setup/store.ts";
import type { Setup } from "../setup/setup.ts";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Fewer rows than this in This month shows the "It's early in…" line (design, AC-7b). */
export const FEW_ROWS = 10;
/** Over this many months, "All" shows years (design, screen 9). */
export const MONTHS_BEFORE_YEARS = 24;
/** The old-upload note shows after more than this many days (design, "Stale data"). */
export const OLD_UPLOAD_DAYS = 30;

export interface Bar {
  /** The axis label: "Nov", "Jan 25" on a Custom range over more than one year, or "FY27" for a financial year. */
  label: string;
  /** The tooltip's heading: "Nov 2026" or "FY27". */
  name: string;
  earned: number;
  spent: number;
  /** True when the bar's month or year runs past today. */
  soFar: boolean;
}

export type RateState = "shown" | "zero" | "below";

export interface Overview {
  /** Today's net worth, whatever the period. */
  netWorth: number;
  /** The change in net worth over the period, from the net worth breakdown. */
  change: number;
  range: string;
  /** Month-end net worth for the last 12 months, oldest first. The last is today's. */
  spark: number[];
  sparkFrom: string;
  sparkTo: string;
  earned: number;
  spent: number;
  saved: number;
  invested: number;
  /** Saved ÷ Earned, only when Earned is above zero (F-2). */
  rate: number | null;
  rateState: RateState;
  /** Rows in the period, up to today. */
  rows: number;
  /** The month's full name, when This month has 1 to 9 rows. */
  fewRows: string | null;
  bars: { by: "month" | "year"; points: Bar[] };
  /** Up to 5 spending categories, biggest first. Only categories with spending above zero. */
  top: CategorySpend[];
}

function parts(iso: string): { year: number; month: number } {
  return { year: Number(iso.slice(0, 4)), month: Number(iso.slice(5, 7)) };
}

const pad = (value: number) => String(value).padStart(2, "0");

/** The month `offset` months after `year`-`month` (1-based), as "YYYY-MM". */
function shiftMonth(year: number, month: number, offset: number): string {
  const index = year * 12 + (month - 1) + offset;
  return `${Math.floor(index / 12)}-${pad((index % 12) + 1)}`;
}

function monthEnd(month: string): string {
  const { year, month: m } = parts(month);
  return `${month}-${pad(new Date(Date.UTC(year, m, 0)).getUTCDate())}`;
}

const later = (a: string, b: string) => (a > b ? a : b);
const earlier = (a: string, b: string) => (a < b ? a : b);

function monthsBetween(from: string, to: string): string[] {
  const a = parts(from);
  const b = parts(to);
  const count = (b.year - a.year) * 12 + (b.month - a.month) + 1;
  return Array.from({ length: Math.max(1, count) }, (_, index) => shiftMonth(a.year, a.month, index));
}

/** Financial year that holds a date, named by its end year: 2026-11-07 is FY27. */
function financialYear(iso: string): number {
  const { year, month } = parts(iso);
  return month >= 4 ? year + 1 : year;
}

interface Bucket {
  from: string;
  to: string;
  label: string;
  name: string;
  /** The bucket's natural last day, before clipping to the period. */
  naturalEnd: string;
}

/** Which months or years the chart shows for a period (design, screen 9 "Months shown"). */
export function barBuckets(kind: SessionPeriod["kind"], from: string, to: string, today: string): { by: "month" | "year"; buckets: Bucket[] } {
  const month = (key: string, clip: boolean): Bucket => {
    const { year, month: m } = parts(key);
    const start = `${key}-01`;
    const end = monthEnd(key);
    return {
      from: clip ? later(start, from) : start,
      to: clip ? earlier(end, to) : end,
      label: MONTHS[m - 1] ?? "",
      name: `${MONTHS[m - 1] ?? ""} ${year}`,
      naturalEnd: end,
    };
  };

  if (kind === "this-month" || kind === "last-12") {
    const { year, month: m } = parts(today);
    return { by: "month", buckets: Array.from({ length: 12 }, (_, index) => month(shiftMonth(year, m, index - 11), false)) };
  }

  const months = monthsBetween(from, to);
  // Only "All" switches to years. Custom always shows months (owner, 2026-11-13: "Months, as approved").
  if (kind === "all" && months.length > MONTHS_BEFORE_YEARS) {
    const buckets: Bucket[] = [];
    for (let fy = financialYear(from); fy <= financialYear(to); fy += 1) {
      const start = `${fy - 1}-04-01`;
      const end = `${fy}-03-31`;
      buckets.push({ from: later(start, from), to: earlier(end, to), label: `FY${pad(fy % 100)}`, name: `FY${pad(fy % 100)}`, naturalEnd: end });
    }
    return { by: "year", buckets };
  }
  const buckets = months.map((key) => month(key, true));
  // A Custom range over more than one calendar year puts the short year on each January: "Jan 25" (QA Q5-1).
  if (kind === "custom" && parts(from).year !== parts(to).year) {
    for (const bucket of buckets) {
      const { year, month: m } = parts(bucket.from);
      if (m === 1) bucket.label = `Jan ${pad(year % 100)}`;
    }
  }
  return { by: "month", buckets };
}

export function rateState(earned: number): RateState {
  if (earned > 0) return "shown";
  return earned === 0 ? "zero" : "below";
}

/** The whole Overview for one period. `today` comes from the server. */
export function buildOverview(rows: readonly ImportRow[], setup: Setup, period: SessionPeriod, today: string): Overview {
  let first: string | null = null;
  for (const row of rows) {
    const date = dateOf(row);
    if (first === null || date < first) first = date;
  }
  const dates = periodDates(period, today, first);
  const metrics = periodMetrics(rows, setup, dates, today);
  const breakdown = netWorthBreakdown(rows, setup, dates, today);
  const end = earlier(dates.to, today);
  const inPeriod = rows.filter((row) => {
    const date = dateOf(row);
    return date >= dates.from && date <= end;
  }).length;

  const now = parts(today);
  const sparkMonths = Array.from({ length: 12 }, (_, index) => shiftMonth(now.year, now.month, index - 11));
  const spark = sparkMonths.map((key) => netWorth(rows, earlier(monthEnd(key), today), today));

  const { by, buckets } = barBuckets(period.kind, dates.from, dates.to, today);
  const points = buckets.map((bucket): Bar => {
    const totals = bucket.from > bucket.to ? null : periodMetrics(rows, setup, { from: bucket.from, to: bucket.to }, today);
    return {
      label: bucket.label,
      name: bucket.name,
      earned: totals?.earned ?? 0,
      spent: totals?.spent ?? 0,
      soFar: bucket.from <= today && today < bucket.naturalEnd,
    };
  });

  const state = rateState(metrics.earned);
  const monthName = MONTHS_FULL[now.month - 1] ?? "";
  const monthLabel = (key: string) => `${MONTHS[parts(key).month - 1] ?? ""} ${parts(key).year}`;
  return {
    netWorth: netWorth(rows, today, today),
    change: breakdown.change,
    range: rangeLine(period, today, first),
    spark,
    sparkFrom: monthLabel(sparkMonths[0] ?? today),
    sparkTo: monthLabel(sparkMonths[11] ?? today),
    earned: metrics.earned,
    spent: metrics.spent,
    saved: metrics.saved,
    invested: metrics.invested,
    rate: state === "shown" ? metrics.savingsRate : null,
    rateState: state,
    rows: inPeriod,
    fewRows: period.kind === "this-month" && inPeriod > 0 && inPeriod < FEW_ROWS ? monthName : null,
    bars: { by, points },
    top: spendingByCategory(rows, dates, today).filter((line) => line.spent > 0).slice(0, 5),
  };
}

function daysFrom(earlierDate: string, laterDate: string): number {
  return Math.round((Date.parse(`${laterDate}T00:00:00Z`) - Date.parse(`${earlierDate}T00:00:00Z`)) / 86_400_000);
}

/** True when the last upload was more than 30 days before today. */
export function isOldUpload(lastUpload: string | null, today: string): boolean {
  return lastUpload !== null && daysFrom(lastUpload.slice(0, 10), today) > OLD_UPLOAD_DAYS;
}

export interface OverviewAnswer {
  overview: Overview;
  version: number;
  /** The last upload's date, when it's old enough for the note. */
  oldUpload: string | null;
  /** The first import's note is still waiting, so this may be the first visit (AC-13). */
  justImported: boolean;
}

/** Reads the saved data and builds the Overview. */
export function overviewFor(db: Database.Database, period: SessionPeriod, today: string): OverviewAnswer {
  const state = dataState(db);
  return {
    overview: buildOverview(readRows(db), loadSetup(db), period, today),
    version: state.version,
    oldUpload: isOldUpload(state.lastUploadDate, today) ? (state.lastUploadDate ?? "").slice(0, 10) : null,
    justImported: state.note === "imported",
  };
}

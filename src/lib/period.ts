/**
 * The one period for the whole app (design "Rules shared by screens 7 to 16").
 * Kept in the server's session only, sent in a request body, never in a web
 * address or on disk. `today` always comes from the server (Phase 2 condition 26).
 */
import { isRealDate } from "./dates.ts";
import type { Period } from "./auth/session.ts";

export const PERIOD_LABELS = {
  "this-month": "This month",
  "last-12": "Last 12 months",
  "financial-year": "Financial year",
  all: "All",
  custom: "Custom",
} as const;

export type PeriodKind = keyof typeof PERIOD_LABELS;
export type PeriodError = "BAD_CHOICE" | "NOT_A_DATE" | "TO_BEFORE_FROM" | "AFTER_TODAY";

/** The server's own date, in its local time zone, as YYYY-MM-DD. */
export function serverToday(now: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function isKind(value: string): value is PeriodKind {
  return Object.hasOwn(PERIOD_LABELS, value);
}

/** Reads a period choice. Custom dates must exist, be in order, and not pass today. */
export function readPeriod(
  input: { period: string; from: string; to: string },
  today: string,
): { ok: true; period: Period } | { ok: false; error: PeriodError } {
  if (!isKind(input.period)) return { ok: false, error: "BAD_CHOICE" };
  if (input.period !== "custom") return { ok: true, period: { kind: input.period } };
  if (!isRealDate(input.from) || !isRealDate(input.to)) return { ok: false, error: "NOT_A_DATE" };
  if (input.to < input.from) return { ok: false, error: "TO_BEFORE_FROM" };
  if (input.to > today) return { ok: false, error: "AFTER_TODAY" };
  return { ok: true, period: { kind: "custom", from: input.from, to: input.to } };
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parts(iso: string): { year: number; month: number; day: number } {
  return { year: Number(iso.slice(0, 4)), month: Number(iso.slice(5, 7)), day: Number(iso.slice(8, 10)) };
}

function isoOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** "1 to 7 Nov 2026", "1 Apr to 7 Nov 2026", "8 Nov 2025 to 7 Nov 2026" or "1 Nov 2026". */
export function dayRange(from: string, to: string): string {
  const a = parts(from);
  const b = parts(to);
  const end = `${b.day} ${MONTH_NAMES[b.month - 1]} ${b.year}`;
  if (from === to) return end;
  if (a.year !== b.year) return `${a.day} ${MONTH_NAMES[a.month - 1]} ${a.year} to ${end}`;
  if (a.month !== b.month) return `${a.day} ${MONTH_NAMES[a.month - 1]} to ${end}`;
  return `${a.day} to ${end}`;
}

/** The dates a period covers, from the design's table. `first` is the first row's date, if any. */
export function periodDates(period: Period, today: string, first: string | null): { from: string; to: string } {
  const t = parts(today);
  switch (period.kind) {
    case "this-month":
      return { from: `${today.slice(0, 7)}-01`, to: today };
    case "last-12": {
      // Same day last year (29 Feb becomes 28 Feb), plus one.
      const lastYear = new Date(Date.UTC(t.year - 1, t.month - 1, 1));
      const daysInMonth = new Date(Date.UTC(t.year - 1, t.month, 0)).getUTCDate();
      lastYear.setUTCDate(Math.min(t.day, daysInMonth) + 1);
      return { from: isoOf(lastYear), to: today };
    }
    case "financial-year":
      return { from: `${t.month >= 4 ? t.year : t.year - 1}-04-01`, to: today };
    case "all":
      return { from: first !== null && first <= today ? first : today, to: today };
    case "custom":
      return { from: period.from, to: period.to };
  }
}

/** The range line for a period (design "Rules shared by screens 7 to 16"). "All" gives months only. */
export function rangeLine(period: Period, today: string, first: string | null): string {
  const { from, to } = periodDates(period, today, first);
  if (period.kind !== "all") return dayRange(from, to);
  const month = (iso: string) => `${MONTH_NAMES[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
  return from.slice(0, 7) === to.slice(0, 7) ? month(to) : `${month(from)} to ${month(to)}`;
}

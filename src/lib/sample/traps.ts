import type { SampleRow } from "./sample-export.ts";

/**
 * Looks at the rows actually written and says which traps from
 * docs/export-format.md are missing. Each check inspects rows, not a list of
 * claims, so taking a trap out of the sample makes it fail.
 */

function hasIdenticalRepeat(rows: readonly SampleRow[], type: string): boolean {
  const seen = new Set<string>();
  for (const row of rows.filter((candidate) => candidate.type === type)) {
    const key = JSON.stringify(row);
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

function monthsWithRows(rows: readonly SampleRow[], year: string): number {
  return new Set(rows.filter((row) => row.at.startsWith(year)).map((row) => row.at.slice(0, 7))).size;
}

const LARGE_CORRECTION = 50_000_00;
const LARGE_ONE_OFF = 500_000_00;
const SAMPLE_TODAY_FOR_TRAPS = "2026-06-15";

const TRAPS: ReadonlyArray<readonly [string, (rows: readonly SampleRow[]) => boolean]> = [
  ["1. Market gains and losses logged as income", (rows) =>
    rows.some((row) => row.type === "Income" && row.paise < 0) &&
    rows.some((row) => row.type === "Income" && row.category.includes("Market") && row.paise > 0)],
  ["2. A loan logged as income", (rows) => rows.some((row) => row.type === "Income" && row.category.includes("Loan"))],
  ["3. Large balance corrections, both ways", (rows) =>
    ["Income Balance", "Expense Balance"].every((type) =>
      rows.some((row) => row.type === type && row.paise >= LARGE_CORRECTION))],
  ["4. Incomplete early history", (rows) => monthsWithRows(rows, "2023") < 6 && monthsWithRows(rows, "2024") === 12],
  ["5. Future-dated rows", (rows) => rows.some((row) => row.at.slice(0, 10) > SAMPLE_TODAY_FOR_TRAPS)],
  ["6. Two Accounts columns that differ", (rows) => rows.some((row) => row.account !== row.secondAccount)],
  ["7. Mixed currencies", (rows) => rows.some((row) => row.currency !== "INR" && row.amount !== row.paise / 100)],
  ["8. Identical repeat rows", (rows) =>
    hasIdenticalRepeat(rows, "Exp.") && hasIdenticalRepeat(rows, "Transfer-Out") && hasIdenticalRepeat(rows, "Transfer-In")],
  ["9. A large one-off item", (rows) => rows.some((row) => row.type === "Exp." && row.paise >= LARGE_ONE_OFF)],
];

export const TRAP_COUNT = TRAPS.length;

export function findMissingTraps(rows: readonly SampleRow[]): string[] {
  return TRAPS.filter(([, isPresent]) => !isPresent(rows)).map(([name]) => name);
}

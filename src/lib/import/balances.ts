import type { ImportRow, RowType } from "./parse-export.ts";

/** What each row type does to its account. `INR` is positive for spending and money going out. */
const DIRECTION: ReadonlyMap<RowType, 1 | -1> = new Map<RowType, 1 | -1>([
  ["Income", 1],
  ["Income Balance", 1],
  ["Transfer-In", 1],
  ["Exp.", -1],
  ["Expense Balance", -1],
  ["Transfer-Out", -1],
]);

export function dateOf(row: ImportRow): string {
  return row.occurredAt.slice(0, 10);
}

export function isFutureDated(row: ImportRow, today: string): boolean {
  return dateOf(row) > today;
}

/**
 * True if every amount, added up by size, stays a safe whole number. That one
 * check covers any running balance, any total and any breakdown line, because
 * none of them can be bigger than this sum.
 */
export function amountsAddUpSafely(rows: readonly ImportRow[]): boolean {
  let total = 0;
  for (const row of rows) {
    total += Math.abs(row.amountPaise);
    if (!Number.isSafeInteger(total)) return false;
  }
  return true;
}

/**
 * Each account's balance in paise at the end of `asOf` (YYYY-MM-DD). Names are
 * Map keys, never object keys, because a name could be `__proto__`.
 */
export function rebuildBalances(rows: readonly ImportRow[], asOf: string): Map<string, number> {
  const balances = new Map<string, number>();
  for (const row of rows) {
    const current = balances.get(row.account) ?? 0;
    if (dateOf(row) > asOf) {
      balances.set(row.account, current);
      continue;
    }
    const next = current + row.amountPaise * (DIRECTION.get(row.type) ?? 0);
    if (!Number.isSafeInteger(next)) throw new RangeError("Balance out of range");
    balances.set(row.account, next);
  }
  return balances;
}

export interface TransferCheck {
  pairs: number;
  /** Row numbers of transfers with no partner, in sheet order. */
  unmatchedRows: number[];
}

/**
 * Matches each Transfer-Out with a Transfer-In of the same time and amount,
 * between the same two accounts. The second `Accounts` column holds the other
 * side. There are no row IDs, so identical repeat transfers pair by count.
 */
export function pairTransfers(rows: readonly ImportRow[]): TransferCheck {
  const waiting = new Map<string, { outs: number[]; ins: number[] }>();
  const unmatchedRows: number[] = [];

  for (const row of rows) {
    if (row.type !== "Transfer-In" && row.type !== "Transfer-Out") continue;
    if (row.account === row.secondAccount) {
      unmatchedRows.push(row.rowNumber);
      continue;
    }
    const isOut = row.type === "Transfer-Out";
    const from = isOut ? row.account : row.secondAccount;
    const to = isOut ? row.secondAccount : row.account;
    // JSON keeps the parts apart, whatever characters an account name holds.
    const key = JSON.stringify([row.occurredAt, row.amountPaise, from, to]);
    const group = waiting.get(key) ?? { outs: [], ins: [] };
    (isOut ? group.outs : group.ins).push(row.rowNumber);
    waiting.set(key, group);
  }

  let pairs = 0;
  for (const { outs, ins } of waiting.values()) {
    const matched = Math.min(outs.length, ins.length);
    pairs += matched;
    unmatchedRows.push(...outs.slice(matched), ...ins.slice(matched));
  }
  return { pairs, unmatchedRows: unmatchedRows.sort((a, b) => a - b) };
}

import { dayBefore, isRealDate } from "../dates.ts";
import { dateOf, pairTransfers, rebuildBalances } from "../import/balances.ts";
import type { ImportRow } from "../import/parse-export.ts";
import { groupOf, type Setup } from "../setup/setup.ts";

/**
 * The one place the app's money definitions live. Screens and chat tools call
 * these functions and never do their own sums. All amounts are whole paise.
 */

/** Both dates are included, using the date as written in the row. */
export interface Period {
  from: string;
  to: string;
}

export interface PeriodMetrics {
  earned: number;
  spent: number;
  saved: number;
  /** Saved ÷ Earned as a fraction, or null when Earned is zero. */
  savingsRate: number | null;
  investmentReturns: number;
  loans: number;
  recovered: number;
  otherCorrections: number;
  invested: number;
  /** The signed effect of transfers with no partner. Normally zero. */
  unmatchedTransfers: number;
}

export interface NetWorthBreakdown {
  opening: number;
  closing: number;
  change: number;
  earned: number;
  spent: number;
  investmentReturns: number;
  recovered: number;
  otherCorrections: number;
  loans: number;
  unmatchedTransfers: number;
}

export class InvalidPeriod extends Error {
  constructor() {
    super("That date range isn't valid.");
    this.name = "InvalidPeriod";
  }
}

function checkPeriod({ from, to }: Period, today: string): void {
  if (!isRealDate(from) || !isRealDate(to) || !isRealDate(today) || from > to) throw new InvalidPeriod();
}

const earlierOf = (first: string, second: string): string => (first < second ? first : second);

function signedTransfer(row: ImportRow): number {
  return row.type === "Transfer-In" ? row.amountPaise : -row.amountPaise;
}

/** Money moving between Investments and any other group. A move inside the group is neither. */
function investedBy(row: ImportRow, setup: Setup): number {
  const thisSide = groupOf(setup, row.account) === "Investments";
  const otherSide = groupOf(setup, row.secondAccount) === "Investments";
  return thisSide && !otherSide ? signedTransfer(row) : 0;
}

/** Rows dated after `today` stay out of every total until that date arrives. */
export function periodMetrics(rows: readonly ImportRow[], setup: Setup, period: Period, today: string): PeriodMetrics {
  checkPeriod(period, today);
  const end = earlierOf(period.to, today);
  const unmatched = new Set(pairTransfers(rows).unmatchedRows);
  const totals = {
    earned: 0, spent: 0, investmentReturns: 0, loans: 0, recovered: 0, otherCorrections: 0, invested: 0, unmatchedTransfers: 0,
  };

  for (const row of rows) {
    const date = dateOf(row);
    if (date < period.from || date > end) continue;

    switch (row.type) {
      case "Exp.":
        totals.spent += row.amountPaise;
        break;
      case "Income":
        if (setup.returnCategories.has(row.category)) totals.investmentReturns += row.amountPaise;
        else if (setup.loanCategories.has(row.category)) totals.loans += row.amountPaise;
        else totals.earned += row.amountPaise;
        break;
      case "Income Balance":
      case "Expense Balance": {
        const signed = row.type === "Income Balance" ? row.amountPaise : -row.amountPaise;
        if (row.account === setup.reimbursementAccount) totals.recovered += signed;
        else totals.otherCorrections += signed;
        break;
      }
      case "Transfer-In":
      case "Transfer-Out":
        totals.invested += investedBy(row, setup);
        if (unmatched.has(row.rowNumber)) totals.unmatchedTransfers += signedTransfer(row);
        break;
    }
  }

  const saved = totals.earned - totals.spent;
  return { ...totals, saved, savingsRate: totals.earned === 0 ? null : saved / totals.earned };
}

/** Every account's balance added up. Cards are negative because their rebuilt balances are. */
export function netWorth(rows: readonly ImportRow[], date: string, today: string): number {
  if (!isRealDate(date) || !isRealDate(today)) throw new InvalidPeriod();
  let total = 0;
  for (const balance of rebuildBalances(rows, earlierOf(date, today)).values()) total += balance;
  return total;
}

/** Explains the change in net worth over a period, line by line. */
export function netWorthBreakdown(rows: readonly ImportRow[], setup: Setup, period: Period, today: string): NetWorthBreakdown {
  const { earned, spent, investmentReturns, recovered, otherCorrections, loans, unmatchedTransfers } =
    periodMetrics(rows, setup, period, today);
  const opening = netWorth(rows, dayBefore(period.from), today);
  const closing = netWorth(rows, period.to, today);
  return {
    opening, closing, change: closing - opening,
    earned, spent, investmentReturns, recovered, otherCorrections, loans, unmatchedTransfers,
  };
}

import type { ImportRow } from "../import/parse-export.ts";

export const ACCOUNT_GROUPS = ["Bank", "Cards", "Wallets", "Investments", "Money with others", "Business"] as const;
export type AccountGroup = (typeof ACCOUNT_GROUPS)[number];

/** What an account with no saved group reads as. */
export const UNGROUPED = "Ungrouped";

/**
 * The owner's answers as they arrive. Names sit in lists, never as object keys,
 * because a name could be `__proto__`.
 */
export interface SetupAnswers {
  accountGroups: ReadonlyArray<{ account: string; group: string }>;
  returnCategories: readonly string[];
  loanCategories: readonly string[];
  reimbursementAccount: string | null;
  trendsStartDate: string | null;
}

/** Saved answers, as the metrics read them. */
export interface Setup {
  /** False until the owner has saved setup once. */
  saved: boolean;
  groups: ReadonlyMap<string, AccountGroup>;
  returnCategories: ReadonlySet<string>;
  loanCategories: ReadonlySet<string>;
  /** Every income category the owner has seen in setup, whatever they chose for it. */
  reviewedCategories: ReadonlySet<string>;
  reimbursementAccount: string | null;
  trendsStartDate: string | null;
}

export const EMPTY_SETUP: Setup = {
  saved: false,
  groups: new Map(),
  returnCategories: new Set(),
  loanCategories: new Set(),
  reviewedCategories: new Set(),
  reimbursementAccount: null,
  trendsStartDate: null,
};

export interface SetupOptions {
  accounts: string[];
  incomeCategories: string[];
}

/** The names setup asks about, in a fixed order. */
export function findSetupOptions(rows: readonly ImportRow[]): SetupOptions {
  const accounts = new Set<string>();
  const incomeCategories = new Set<string>();
  for (const row of rows) {
    accounts.add(row.account);
    if ((row.type === "Transfer-In" || row.type === "Transfer-Out") && row.secondAccount !== "") {
      accounts.add(row.secondAccount);
    }
    if (row.type === "Income") incomeCategories.add(row.category);
  }
  return { accounts: [...accounts].sort(), incomeCategories: [...incomeCategories].sort() };
}

export function groupOf(setup: Setup, account: string): AccountGroup | typeof UNGROUPED {
  return setup.groups.get(account) ?? UNGROUPED;
}

export interface SetupStatus {
  done: boolean;
  unreviewedAccounts: string[];
  unreviewedIncomeCategories: string[];
}

export function setupStatus(rows: readonly ImportRow[], setup: Setup): SetupStatus {
  const { accounts, incomeCategories } = findSetupOptions(rows);
  const unreviewedAccounts = accounts.filter((account) => !setup.groups.has(account));
  const unreviewedIncomeCategories = incomeCategories.filter((category) => !setup.reviewedCategories.has(category));
  return {
    done: setup.saved && unreviewedAccounts.length === 0 && unreviewedIncomeCategories.length === 0,
    unreviewedAccounts,
    unreviewedIncomeCategories,
  };
}

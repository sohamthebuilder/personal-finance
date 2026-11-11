import type { ImportRow } from "../import/parse-export.ts";

export const ACCOUNT_GROUPS = ["Bank", "Cards", "Wallets", "Investments", "Money with others", "Business"] as const;
export type AccountGroup = (typeof ACCOUNT_GROUPS)[number];

/** What an account with no saved group reads as. */
export const UNGROUPED = "Ungrouped";
/** What an income or expense category in none of the owner's groups reads as. Kept, so no group can use it. */
export const NOT_GROUPED = "Not grouped";

/** Owner-named income and expense groups (brief, "Second change, income groups"). */
export const GROUP_LIMIT = 12;
export const GROUP_NAME_LIMIT = 40;

export const CATEGORY_KINDS = ["income", "expense"] as const;
export type CategoryKind = (typeof CATEGORY_KINDS)[number];

/** One list of the owner's groups. Categories point at a group by its place in `names`. */
export interface OwnerGroups {
  names: readonly string[];
  /** Category name to its group's index. A category not here is Not grouped. */
  placed: ReadonlyMap<string, number>;
}

/** Saved answers, as the metrics and screens read them. */
export interface Setup {
  /** False until the owner has saved setup once. */
  saved: boolean;
  groups: ReadonlyMap<string, AccountGroup>;
  income: OwnerGroups;
  expense: OwnerGroups;
}

const NO_GROUPS: OwnerGroups = { names: [], placed: new Map() };

export const EMPTY_SETUP: Setup = { saved: false, groups: new Map(), income: NO_GROUPS, expense: NO_GROUPS };

/**
 * The owner's answers as they arrive from a page. They line up, by position,
 * with the lists `findSetupOptions` gives, so names from the file never travel
 * back. The data version check makes sure the lists haven't changed meanwhile.
 */
export interface GroupAnswers {
  names: string[];
  /** One per category, in the options' order: a group's index, or null for Not grouped. */
  categories: Array<number | null>;
}

export interface SetupAnswers {
  /** One per account, in the options' order: a group name, or "" for none. */
  accounts: string[];
  income: GroupAnswers;
  expense: GroupAnswers;
}

export interface CategoryOption {
  name: string;
  /** Its subcategories that have a name, sorted. They always follow their category. */
  subcategories: string[];
}

export interface SetupOptions {
  accounts: string[];
  income: CategoryOption[];
  expense: CategoryOption[];
}

const KIND_OF_ROW: Partial<Record<ImportRow["type"], CategoryKind>> = { Income: "income", "Exp.": "expense" };

/** The names setup asks about, in a fixed order. */
export function findSetupOptions(rows: readonly ImportRow[]): SetupOptions {
  const accounts = new Set<string>();
  const subs: Record<CategoryKind, Map<string, Set<string>>> = { income: new Map(), expense: new Map() };
  for (const row of rows) {
    accounts.add(row.account);
    if ((row.type === "Transfer-In" || row.type === "Transfer-Out") && row.secondAccount !== "") {
      accounts.add(row.secondAccount);
    }
    const kind = KIND_OF_ROW[row.type];
    if (kind === undefined) continue;
    const set = subs[kind].get(row.category) ?? new Set<string>();
    if (row.subcategory !== "") set.add(row.subcategory);
    subs[kind].set(row.category, set);
  }
  const list = (kind: CategoryKind): CategoryOption[] =>
    [...subs[kind].keys()].sort().map((name) => ({ name, subcategories: [...(subs[kind].get(name) ?? [])].sort() }));
  return { accounts: [...accounts].sort(), income: list("income"), expense: list("expense") };
}

export function groupOf(setup: Setup, account: string): AccountGroup | typeof UNGROUPED {
  return setup.groups.get(account) ?? UNGROUPED;
}

/** The name of a category's group, or Not grouped. */
export function categoryGroupOf(setup: Setup, kind: CategoryKind, category: string): string {
  const groups = setup[kind];
  const index = groups.placed.get(category);
  return index === undefined ? NOT_GROUPED : (groups.names[index] ?? NOT_GROUPED);
}

export interface SetupStatus {
  done: boolean;
  ungroupedAccounts: string[];
}

/** Setup is done once it's saved and every account has a group. Income and expense groups are optional. */
export function setupStatus(rows: readonly ImportRow[], setup: Setup): SetupStatus {
  const ungroupedAccounts = findSetupOptions(rows).accounts.filter((account) => !setup.groups.has(account));
  return { done: setup.saved && ungroupedAccounts.length === 0, ungroupedAccounts };
}

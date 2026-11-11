import type Database from "better-sqlite3-multiple-ciphers";
import { dataVersion } from "../../src/lib/data/state.ts";
import { saveSetupAnswers, type SetupSaveResult } from "../../src/lib/data/update.ts";
import { readRows } from "../../src/lib/import/store.ts";
import { type CategoryKind, findSetupOptions, type SetupAnswers } from "../../src/lib/setup/setup.ts";

type Db = Database.Database;

export interface NamedGroups {
  names: readonly string[];
  placed: ReadonlyArray<{ category: string; group: string }>;
}

/**
 * Builds the answers a page would send, by name, lined up with the server's
 * own lists. Accounts not named get `fallback` ("" leaves them Ungrouped).
 */
export function answersFor(
  db: Db,
  given: { accounts?: ReadonlyArray<{ account: string; group: string }>; fallback?: string; income?: NamedGroups; expense?: NamedGroups } = {},
): SetupAnswers {
  const options = findSetupOptions(readRows(db));
  const byAccount = new Map((given.accounts ?? []).map(({ account, group }) => [account, group]));
  const list = (kind: CategoryKind, groups: NamedGroups | undefined) => {
    const names = [...(groups?.names ?? [])];
    const placed = new Map((groups?.placed ?? []).map(({ category, group }) => [category, names.indexOf(group)]));
    return { names, categories: options[kind].map((category) => placed.get(category.name) ?? null) };
  };
  return {
    accounts: options.accounts.map((account) => byAccount.get(account) ?? given.fallback ?? "Bank"),
    income: list("income", given.income),
    expense: list("expense", given.expense),
  };
}

/** Saves as the route does, with the page's data version. */
export function saveAnswers(db: Db, answers: SetupAnswers, version: number | null = dataVersion(db)): SetupSaveResult {
  return saveSetupAnswers(db, answers, version);
}

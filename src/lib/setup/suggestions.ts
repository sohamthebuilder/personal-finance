import { type AccountGroup } from "./setup.ts";

/** Generic words only. No personal or institution names belong here. */
const ACCOUNT_WORDS: ReadonlyMap<string, AccountGroup> = new Map<string, AccountGroup>([
  ["card", "Cards"],
  ["credit", "Cards"],
  ["wallet", "Wallets"],
  ["cash", "Wallets"],
  ["bank", "Bank"],
  ["saving", "Bank"],
  ["current", "Bank"],
  ["broker", "Investments"],
  ["demat", "Investments"],
  ["fund", "Investments"],
  ["stock", "Investments"],
  ["share", "Investments"],
  ["invest", "Investments"],
  ["investment", "Investments"],
  ["friend", "Money with others"],
  ["family", "Money with others"],
  ["lent", "Money with others"],
  ["business", "Business"],
  ["company", "Business"],
]);

export type CategoryRole = "returns" | "loans";

const CATEGORY_WORDS: ReadonlyMap<string, CategoryRole> = new Map<string, CategoryRole>([
  ["market", "returns"],
  ["dividend", "returns"],
  ["interest", "returns"],
  ["gain", "returns"],
  ["loan", "loans"],
  ["borrowed", "loans"],
]);

/** Whole words, so "discard" isn't a card. A word also matches without a trailing "s", so "Cards" is. */
function firstMatch<T>(name: string, words: ReadonlyMap<string, T>): T | undefined {
  for (const word of name.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
    const match = words.get(word) ?? words.get(word.replace(/s$/, ""));
    if (match !== undefined) return match;
  }
  return undefined;
}

/** Suggestions are only ever offered. Nothing here saves an answer or feeds the metrics. */
export function suggestAccountGroup(account: string): AccountGroup | undefined {
  return firstMatch(account, ACCOUNT_WORDS);
}

export function suggestCategoryRole(category: string): CategoryRole | undefined {
  return firstMatch(category, CATEGORY_WORDS);
}

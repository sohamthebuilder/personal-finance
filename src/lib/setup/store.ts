import type Database from "better-sqlite3-multiple-ciphers";
import { isRealDate } from "../dates.ts";
import { ensureSchema as ensureRowsSchema, readRows } from "../import/store.ts";
import { ACCOUNT_GROUPS, type AccountGroup, EMPTY_SETUP, findSetupOptions, type Setup, type SetupAnswers } from "./setup.ts";

type Db = Database.Database;

/** Kept apart from `import_rows`, so replacing the rows later leaves the answers in place. */
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS setup_accounts (
    name TEXT PRIMARY KEY,
    account_group TEXT NOT NULL
  ) STRICT;
  CREATE TABLE IF NOT EXISTS setup_income_categories (
    name TEXT PRIMARY KEY,
    role TEXT NOT NULL CHECK (role IN ('earned', 'returns', 'loans'))
  ) STRICT;
  CREATE TABLE IF NOT EXISTS setup_choices (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    reimbursement_account TEXT,
    trends_start_date TEXT
  ) STRICT;
`;

/** Fixed text, so no name from a file can reach an error, a log or the screen. */
export const SETUP_REFUSALS = {
  NO_DATA: "Import a file before saving setup.",
  BAD_ANSWERS: "These setup answers couldn't be read.",
  UNKNOWN_GROUP: "One of the account groups isn't a group the app knows.",
  UNKNOWN_ACCOUNT: "One of the accounts isn't in your data.",
  UNKNOWN_CATEGORY: "One of the categories isn't an income category in your data.",
  REPEATED_ACCOUNT: "An account has been given more than one group.",
  CATEGORY_IN_BOTH: "A category can't be both investment returns and loans.",
  BAD_DATE: "The trends start date isn't a real date.",
  SAVE_FAILED: "Setup couldn't be saved. Nothing was changed.",
} as const;

export type SetupRefusal = keyof typeof SETUP_REFUSALS;

export type SaveSetupResult = { ok: true } | { ok: false; code: SetupRefusal; message: string };

const isGroup = (value: unknown): value is AccountGroup => (ACCOUNT_GROUPS as readonly unknown[]).includes(value);

const isTextList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

/** Answers will come from a web request in Phase 4, so nothing about their shape is assumed. */
function hasRightShape(answers: SetupAnswers): boolean {
  const { accountGroups, returnCategories, loanCategories, reimbursementAccount } = answers ?? {};
  return (
    Array.isArray(accountGroups) &&
    accountGroups.every((entry) => typeof entry?.account === "string" && typeof entry?.group === "string") &&
    isTextList(returnCategories) &&
    isTextList(loanCategories) &&
    (reimbursementAccount === null || typeof reimbursementAccount === "string")
  );
}

function findProblem(answers: SetupAnswers, accounts: ReadonlySet<string>, categories: ReadonlySet<string>): SetupRefusal | null {
  if (!hasRightShape(answers)) return "BAD_ANSWERS";

  const seen = new Set<string>();
  for (const { account, group } of answers.accountGroups) {
    if (!isGroup(group)) return "UNKNOWN_GROUP";
    if (!accounts.has(account)) return "UNKNOWN_ACCOUNT";
    if (seen.has(account)) return "REPEATED_ACCOUNT";
    seen.add(account);
  }
  if (answers.reimbursementAccount !== null && !accounts.has(answers.reimbursementAccount)) return "UNKNOWN_ACCOUNT";

  const picked = [...answers.returnCategories, ...answers.loanCategories];
  if (picked.some((category) => !categories.has(category))) return "UNKNOWN_CATEGORY";
  const returns = new Set(answers.returnCategories);
  if (answers.loanCategories.some((category) => returns.has(category))) return "CATEGORY_IN_BOTH";

  if (answers.trendsStartDate !== null && !isRealDate(answers.trendsStartDate)) return "BAD_DATE";
  return null;
}

function writeAnswers(db: Db, answers: SetupAnswers, incomeCategories: readonly string[]): void {
  const returns = new Set(answers.returnCategories);
  const loans = new Set(answers.loanCategories);
  db.exec("DELETE FROM setup_accounts; DELETE FROM setup_income_categories; DELETE FROM setup_choices;");

  const addAccount = db.prepare("INSERT INTO setup_accounts (name, account_group) VALUES (?, ?)");
  for (const { account, group } of answers.accountGroups) addAccount.run(account, group);

  // Saving reviews every income category on show, including those left as Earned.
  const addCategory = db.prepare("INSERT INTO setup_income_categories (name, role) VALUES (?, ?)");
  for (const category of incomeCategories) {
    addCategory.run(category, returns.has(category) ? "returns" : loans.has(category) ? "loans" : "earned");
  }

  db.prepare("INSERT INTO setup_choices (id, reimbursement_account, trends_start_date) VALUES (1, ?, ?)")
    .run(answers.reimbursementAccount, answers.trendsStartDate);
}

/** Replaces the saved answers in one transaction. It never throws, and a refusal changes nothing. */
export function saveSetup(db: Db, answers: SetupAnswers): SaveSetupResult {
  const refuse = (code: SetupRefusal): SaveSetupResult => ({ ok: false, code, message: SETUP_REFUSALS[code] });
  try {
    ensureRowsSchema(db);
    db.exec(SCHEMA);
    // The checks run inside the write transaction, so the rows can't change between checking and saving.
    const problem = db.transaction((): SetupRefusal | null => {
      const rows = readRows(db);
      if (rows.length === 0) return "NO_DATA";
      const { accounts, incomeCategories } = findSetupOptions(rows);
      const found = findProblem(answers, new Set(accounts), new Set(incomeCategories));
      if (found === null) writeAnswers(db, answers, incomeCategories);
      return found;
    }).immediate();
    return problem === null ? { ok: true } : refuse(problem);
  } catch {
    return refuse("SAVE_FAILED");
  }
}

interface StoredCategory {
  name: string;
  role: string;
}

interface StoredChoices {
  reimbursement_account: string | null;
  trends_start_date: string | null;
}

export function loadSetup(db: Db): Setup {
  db.exec(SCHEMA);
  const choices = db.prepare("SELECT * FROM setup_choices WHERE id = 1").get() as StoredChoices | undefined;
  if (choices === undefined) return EMPTY_SETUP;

  const accounts = db.prepare("SELECT name, account_group FROM setup_accounts").all() as Array<{ name: string; account_group: AccountGroup }>;
  const categories = db.prepare("SELECT name, role FROM setup_income_categories").all() as StoredCategory[];
  const withRole = (role: string): Set<string> =>
    new Set(categories.filter((category) => category.role === role).map((category) => category.name));

  return {
    saved: true,
    groups: new Map(accounts.map((account) => [account.name, account.account_group])),
    returnCategories: withRole("returns"),
    loanCategories: withRole("loans"),
    reviewedCategories: new Set(categories.map((category) => category.name)),
    reimbursementAccount: choices.reimbursement_account,
    trendsStartDate: choices.trends_start_date,
  };
}

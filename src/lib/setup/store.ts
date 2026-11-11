import type Database from "better-sqlite3-multiple-ciphers";
import { cleanName, groupNameProblem } from "./group-names.ts";
import {
  ACCOUNT_GROUPS,
  type AccountGroup,
  CATEGORY_KINDS,
  type CategoryKind,
  EMPTY_SETUP,
  GROUP_LIMIT,
  type GroupAnswers,
  type OwnerGroups,
  type Setup,
  type SetupAnswers,
  type SetupOptions,
} from "./setup.ts";

type Db = Database.Database;

/**
 * Kept apart from `import_rows`, so replacing the rows later leaves the answers
 * in place. Income and expense groups are owner-named; a category with no row
 * here is Not grouped. The tables of the first setup model (Earned, Returns or
 * Loan, the reimbursement account and the trends start) are dropped: no build
 * that saved them was ever released, and the owner's change removed them.
 */
const SCHEMA = `
  DROP TABLE IF EXISTS setup_income_categories;
  DROP TABLE IF EXISTS setup_choices;
  CREATE TABLE IF NOT EXISTS setup_accounts (
    name TEXT PRIMARY KEY,
    account_group TEXT NOT NULL
  ) STRICT;
  CREATE TABLE IF NOT EXISTS setup_groups (
    kind TEXT NOT NULL CHECK (kind IN ('income', 'expense')),
    position INTEGER NOT NULL CHECK (position >= 0 AND position < ${GROUP_LIMIT}),
    name TEXT NOT NULL,
    PRIMARY KEY (kind, position)
  ) STRICT;
  CREATE TABLE IF NOT EXISTS setup_categories (
    kind TEXT NOT NULL CHECK (kind IN ('income', 'expense')),
    name TEXT NOT NULL,
    position INTEGER NOT NULL,
    PRIMARY KEY (kind, name)
  ) STRICT;
  CREATE TABLE IF NOT EXISTS setup_saved (
    id INTEGER PRIMARY KEY CHECK (id = 1)
  ) STRICT;
`;

/** Every setup table, in the order the undo copy keeps them. */
export const SETUP_TABLES = ["setup_accounts", "setup_groups", "setup_categories", "setup_saved"] as const;

/** Makes the setup tables, so a change can read them before any answer is saved. */
export function ensureSetupSchema(db: Db): void {
  db.exec(SCHEMA);
}

/** Fixed text, so no name from a file or a group can reach an error, a log or the screen. */
export const SETUP_REFUSALS = {
  NO_DATA: "Import a file before saving setup.",
  STALE: "Your data changed in another window.",
  BAD_ANSWERS: "These setup answers couldn't be read.",
  UNKNOWN_GROUP: "One of the account groups isn't a group the app knows.",
  NEEDS_GROUP: "Every account needs a group.",
  TOO_MANY_GROUPS: "A list can have up to 12 groups.",
  NAME_EMPTY: "Give the group a name.",
  NAME_TOO_LONG: "Use 40 characters or fewer.",
  NAME_RESERVED: "“Not grouped” is kept for categories without a group.",
  NAME_TAKEN: "Two groups in the same list have the same name.",
  NAME_NOT_PLAIN: "A group name can only be one line of plain text.",
  SAVE_FAILED: "Setup couldn't be saved. Nothing was changed.",
} as const;

export type SetupRefusal = keyof typeof SETUP_REFUSALS;

const isGroupOrNone = (value: unknown): boolean => value === "" || (ACCOUNT_GROUPS as readonly unknown[]).includes(value);

/** Answers come from a web request, so nothing about their shape is assumed. */
function shapeOk(answers: SetupAnswers, options: SetupOptions): boolean {
  const groupsOk = (groups: GroupAnswers | undefined, count: number): boolean =>
    typeof groups === "object" && groups !== null &&
    Array.isArray(groups.names) && groups.names.every((name) => typeof name === "string") &&
    Array.isArray(groups.categories) && groups.categories.length === count &&
    groups.categories.every((index) => index === null || Number.isSafeInteger(index));
  return (
    typeof answers === "object" && answers !== null &&
    Array.isArray(answers.accounts) && answers.accounts.length === options.accounts.length &&
    answers.accounts.every((group) => typeof group === "string") &&
    groupsOk(answers.income, options.income.length) &&
    groupsOk(answers.expense, options.expense.length)
  );
}

const NAME_REFUSAL = { EMPTY: "NAME_EMPTY", TOO_LONG: "NAME_TOO_LONG", RESERVED: "NAME_RESERVED", TAKEN: "NAME_TAKEN", NOT_PLAIN: "NAME_NOT_PLAIN" } as const;

function groupsProblem(groups: GroupAnswers): SetupRefusal | null {
  if (groups.names.length > GROUP_LIMIT) return "TOO_MANY_GROUPS";
  for (const [index, name] of groups.names.entries()) {
    const found = groupNameProblem(name, groups.names.slice(0, index));
    if (found !== null) return NAME_REFUSAL[found.problem];
  }
  if (groups.categories.some((index) => index !== null && (index < 0 || index >= groups.names.length))) return "BAD_ANSWERS";
  return null;
}

/**
 * Every check the server makes on a save (AC-19, AC-23, AC-28). The first time,
 * every account needs one of the six groups; in Settings, Ungrouped is allowed.
 */
export function findSetupProblem(answers: SetupAnswers, options: SetupOptions, firstTime: boolean): SetupRefusal | null {
  if (!shapeOk(answers, options)) return "BAD_ANSWERS";
  if (!answers.accounts.every(isGroupOrNone)) return "UNKNOWN_GROUP";
  if (firstTime && answers.accounts.some((group) => group === "")) return "NEEDS_GROUP";
  return groupsProblem(answers.income) ?? groupsProblem(answers.expense);
}

/** Replaces the saved answers. The caller runs it inside its write transaction, after `findSetupProblem`. */
export function writeSetup(db: Db, answers: SetupAnswers, options: SetupOptions): void {
  db.exec("DELETE FROM setup_accounts; DELETE FROM setup_groups; DELETE FROM setup_categories; DELETE FROM setup_saved;");
  const addAccount = db.prepare("INSERT INTO setup_accounts (name, account_group) VALUES (?, ?)");
  options.accounts.forEach((account, index) => {
    const group = answers.accounts[index] ?? "";
    if (group !== "") addAccount.run(account, group);
  });
  const addGroup = db.prepare("INSERT INTO setup_groups (kind, position, name) VALUES (?, ?, ?)");
  const addCategory = db.prepare("INSERT INTO setup_categories (kind, name, position) VALUES (?, ?, ?)");
  for (const kind of CATEGORY_KINDS) {
    answers[kind].names.forEach((name, position) => addGroup.run(kind, position, cleanName(name)));
    options[kind].forEach((category, index) => {
      const position = answers[kind].categories[index];
      if (position !== null && position !== undefined) addCategory.run(kind, category.name, position);
    });
  }
  db.prepare("INSERT INTO setup_saved (id) VALUES (1)").run();
}

export function loadSetup(db: Db): Setup {
  db.exec(SCHEMA);
  if (db.prepare("SELECT 1 FROM setup_saved WHERE id = 1").get() === undefined) return EMPTY_SETUP;

  const accounts = db.prepare("SELECT name, account_group FROM setup_accounts").all() as Array<{ name: string; account_group: AccountGroup }>;
  const groups = db.prepare("SELECT kind, position, name FROM setup_groups ORDER BY position").all() as Array<{ kind: CategoryKind; position: number; name: string }>;
  const categories = db.prepare("SELECT kind, name, position FROM setup_categories").all() as Array<{ kind: CategoryKind; name: string; position: number }>;

  const listFor = (kind: CategoryKind): OwnerGroups => {
    const names = groups.filter((group) => group.kind === kind).map((group) => group.name);
    const placed = new Map<string, number>();
    for (const category of categories) {
      if (category.kind === kind && category.position < names.length) placed.set(category.name, category.position);
    }
    return { names, placed };
  };

  return {
    saved: true,
    groups: new Map(accounts.map((account) => [account.name, account.account_group])),
    income: listFor("income"),
    expense: listFor("expense"),
  };
}

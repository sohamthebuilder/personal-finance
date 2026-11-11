/**
 * Every change to the owner's data after log in: the first import, setup
 * answers, the summary, Start over, the update review, replace and undo.
 * Routes call these one at a time (design, "One change at a time"), and each
 * one checks the data version the page was holding before it saves.
 *
 * Results are fixed codes. No name or text from a file is ever put in one.
 */
import type Database from "better-sqlite3-multiple-ciphers";
import { amountsAddUpSafely, dateOf, isFutureDated, pairTransfers, rebuildBalances } from "../import/balances.ts";
import { ImportRejected, type RejectionCode } from "../import/errors.ts";
import type { ImportRow } from "../import/parse-export.ts";
import { hasImportedRows, readRows, writeRows } from "../import/store.ts";
import { netWorth } from "../metrics/metrics.ts";
import { confirmSummary, firstTimeStep } from "../setup/progress.ts";
import {
  ACCOUNT_GROUPS,
  CATEGORY_KINDS,
  type CategoryKind,
  type CategoryOption,
  findSetupOptions,
  groupOf,
  type SetupAnswers,
  type SetupOptions,
  UNGROUPED,
} from "../setup/setup.ts";
import { findSetupProblem, loadSetup, SETUP_TABLES, type SetupRefusal, writeSetup } from "../setup/store.ts";
import { bumpVersion, clearUndo, dataState, ensureDataSchema, UNDO_TABLES } from "./state.ts";

type Db = Database.Database;

const isGroupOrNone = (value: unknown): value is string => value === "" || (ACCOUNT_GROUPS as readonly unknown[]).includes(value);

/* ---------- First import ---------- */

export type FirstSaveResult = { ok: true; rows: number } | { ok: false; code: RejectionCode };

/** Saves the first file's rows. The amounts limit runs here, so no caller can skip it (AC-24). */
export function saveFirstRows(db: Db, rows: readonly ImportRow[], today: string): FirstSaveResult {
  try {
    ensureDataSchema(db);
    if (!amountsAddUpSafely(rows)) return { ok: false, code: "AMOUNTS_TOO_LARGE" };
    db.transaction(() => {
      if (hasImportedRows(db)) throw new ImportRejected("ALREADY_IMPORTED");
      writeRows(db, rows);
      db.prepare("UPDATE app_state SET last_upload_date = ?, last_upload_rows = ?, note = NULL WHERE id = 1").run(today, rows.length);
      bumpVersion(db);
    }).immediate();
    return { ok: true, rows: rows.length };
  } catch (error) {
    return { ok: false, code: error instanceof ImportRejected ? error.code : "SAVE_FAILED" };
  }
}

/* ---------- Setup (screens 5 and 13) ---------- */

/** What the setup screens show: the names in a fixed order, with the saved answers lined up against them. */
export interface SetupPage {
  version: number;
  /** True on screen 5 (and Back to setup from screen 6): every account needs a group. */
  firstTime: boolean;
  accounts: Array<{ name: string; group: string }>;
  income: { names: string[]; categories: Array<CategoryOption & { group: number | null }> };
  expense: { names: string[]; categories: Array<CategoryOption & { group: number | null }> };
}

export function setupPage(db: Db): SetupPage {
  ensureDataSchema(db);
  const options = findSetupOptions(readRows(db));
  const setup = loadSetup(db);
  const list = (kind: CategoryKind) => ({
    names: [...setup[kind].names],
    categories: options[kind].map((category) => ({ ...category, group: setup[kind].placed.get(category.name) ?? null })),
  });
  return {
    version: dataState(db).version,
    firstTime: firstTimeStep(db) !== "shell",
    accounts: options.accounts.map((name) => ({ name, group: setup.groups.get(name) ?? "" })),
    income: list("income"),
    expense: list("expense"),
  };
}

export type SetupSaveResult = { ok: true; version: number } | { ok: false; code: SetupRefusal };

/**
 * Saves screen 5's or screen 13's answers. Whether it's the first time comes
 * from what's saved, never from the request. The checks run again inside the
 * write, so the rows can't change between checking and saving.
 */
export function saveSetupAnswers(db: Db, answers: SetupAnswers, version: number | null): SetupSaveResult {
  try {
    ensureDataSchema(db);
    if (firstTimeStep(db) === "upload") return { ok: false, code: "NO_DATA" };
    if (version === null || version !== dataState(db).version) return { ok: false, code: "STALE" };
    const problem = db.transaction((): SetupRefusal | null => {
      if (dataState(db).version !== version) return "STALE";
      const rows = readRows(db);
      if (rows.length === 0) return "NO_DATA";
      const options: SetupOptions = findSetupOptions(rows);
      const found = findSetupProblem(answers, options, firstTimeStep(db) !== "shell");
      if (found !== null) return found;
      writeSetup(db, answers, options);
      bumpVersion(db);
      return null;
    }).immediate();
    return problem === null ? { ok: true, version: dataState(db).version } : { ok: false, code: problem };
  } catch {
    return { ok: false, code: "SAVE_FAILED" };
  }
}

/* ---------- Summary (screen 6) ---------- */

export interface Summary {
  version: number;
  netWorth: number;
  rows: number;
  from: string;
  to: string;
  groups: Array<{ group: string; accounts: number; total: number }>;
  unmatchedTransfers: number;
  futureRows: number;
}

export function summaryData(db: Db, today: string): Summary {
  const rows = readRows(db);
  const setup = loadSetup(db);
  const balances = rebuildBalances(rows, today);
  const byGroup = new Map<string, { accounts: number; total: number }>();
  for (const account of findSetupOptions(rows).accounts) {
    const group = groupOf(setup, account);
    const entry = byGroup.get(group) ?? { accounts: 0, total: 0 };
    entry.accounts += 1;
    entry.total += balances.get(account) ?? 0;
    byGroup.set(group, entry);
  }
  const dates = rows.map(dateOf).sort();
  return {
    version: dataState(db).version,
    netWorth: netWorth(rows, today, today),
    rows: rows.length,
    from: dates[0] ?? today,
    to: dates.at(-1) ?? today,
    groups: [...ACCOUNT_GROUPS, UNGROUPED].flatMap((group) => {
      const entry = byGroup.get(group);
      return entry === undefined ? [] : [{ group, ...entry }];
    }),
    unmatchedTransfers: pairTransfers(rows).unmatchedRows.length,
    futureRows: rows.filter((row) => isFutureDated(row, today)).length,
  };
}

export type StepResult = { ok: true } | { ok: false; code: "STALE" | "WRONG_STEP" | "CONFIRMED" | "SAVE_FAILED" };

/** "Looks right" on screen 6. The only caller of `confirmSummary` in the app. */
export function acceptSummary(db: Db, version: number | null): StepResult {
  try {
    ensureDataSchema(db);
    if (firstTimeStep(db) !== "summary") return { ok: false, code: "WRONG_STEP" };
    if (version === null || version !== dataState(db).version) return { ok: false, code: "STALE" };
    db.transaction(() => {
      confirmSummary(db);
      db.prepare("UPDATE app_state SET note = 'imported' WHERE id = 1").run();
      bumpVersion(db);
    }).immediate();
    return { ok: true };
  } catch {
    return { ok: false, code: "SAVE_FAILED" };
  }
}

/** Start over on screen 6. It needs no password, so it is refused once the summary is confirmed (S3-14). */
export function startOver(db: Db, version: number | null): StepResult {
  try {
    ensureDataSchema(db);
    const step = firstTimeStep(db);
    if (step === "shell") return { ok: false, code: "CONFIRMED" };
    if (version === null || version !== dataState(db).version) return { ok: false, code: "STALE" };
    db.transaction(() => {
      // Checked again inside the write, so a confirm can't slip in between.
      if (firstTimeStep(db) === "shell") throw new Error("confirmed");
      db.exec("DELETE FROM import_rows");
      for (const table of SETUP_TABLES) db.exec(`DELETE FROM ${table}`);
      clearUndo(db);
      db.prepare("UPDATE app_state SET last_upload_date = NULL, last_upload_rows = NULL, note = NULL WHERE id = 1").run();
      bumpVersion(db);
    }).immediate();
    return { ok: true };
  } catch {
    return { ok: false, code: "SAVE_FAILED" };
  }
}

/* ---------- Update review (screen 8) ---------- */

export interface PreviewRow {
  date: string;
  account: string;
  category: string;
  amountPaise: number;
  /** Changed rows only: the amount before. */
  wasPaise?: number;
}

export interface PartialWarning {
  /** YYYY-MM for each. */
  startsLater: { file: string; data: string } | null;
  endsEarlier: { file: string; data: string } | null;
  fewerRows: { file: number; data: number } | null;
  mostAccountsMissing: boolean;
}

export const REVIEW_LISTS = ["added", "changed", "removed"] as const;
export type ReviewList = (typeof REVIEW_LISTS)[number];

export interface Review {
  same: boolean;
  counts: Record<ReviewList, number> & { total: number };
  fileFrom: string;
  fileTo: string;
  netWorthNew: number;
  netWorthOld: number;
  lists: Record<ReviewList, PreviewRow[]>;
  newAccounts: Array<{ name: string; balance: number }>;
  /** New categories show as Not grouped, with nothing to choose on the review. */
  newCategories: Record<CategoryKind, CategoryOption[]>;
  removedAccounts: number;
  removedCategories: number;
  warning: PartialWarning | null;
}

/** A file waiting for the owner's yes. Parsed rows only, never file bytes, and only ever in memory (Decision 10). */
export interface PendingUpdate {
  rows: ImportRow[];
  /** The data version the comparison was made against. */
  version: number;
  review: Review;
}

// JSON keeps the parts apart, whatever characters a name holds.
const exactKey = (row: ImportRow): string =>
  JSON.stringify([row.occurredAt, row.account, row.type, row.category, row.subcategory, row.note, row.amountPaise, row.originalAmount, row.currency, row.secondAccount]);
const sameSlotKey = (row: ImportRow): string => JSON.stringify([row.occurredAt, row.account, row.type]);

const preview = (row: ImportRow): PreviewRow => ({ date: dateOf(row), account: row.account, category: row.category, amountPaise: row.amountPaise });

function takeFrom(waiting: Map<string, ImportRow[]>, key: string): ImportRow | undefined {
  return waiting.get(key)?.shift();
}

function groupBy(rows: readonly ImportRow[], key: (row: ImportRow) => string): Map<string, ImportRow[]> {
  const groups = new Map<string, ImportRow[]>();
  for (const row of rows) {
    const list = groups.get(key(row));
    if (list) list.push(row);
    else groups.set(key(row), [row]);
  }
  return groups;
}

/**
 * Sorts a new file's rows into new, changed and removed. The export has no row
 * IDs, so rows that are the same in every column match first. Of the rest, an
 * old and a new row at the same moment, on the same account and of the same
 * type count as one changed row.
 */
function matchRows(current: readonly ImportRow[], next: readonly ImportRow[]): Record<ReviewList, PreviewRow[]> {
  const oldExact = groupBy(current, exactKey);
  const newLeft = next.filter((row) => takeFrom(oldExact, exactKey(row)) === undefined);
  const oldSlots = groupBy([...oldExact.values()].flat(), sameSlotKey);

  const added: PreviewRow[] = [];
  const changed: PreviewRow[] = [];
  for (const row of newLeft) {
    const before = takeFrom(oldSlots, sameSlotKey(row));
    if (before === undefined) added.push(preview(row));
    else changed.push({ ...preview(row), wasPaise: before.amountPaise });
  }
  const removed = [...oldSlots.values()].flat().sort((a, b) => a.rowNumber - b.rowNumber).map(preview);
  return { added, changed, removed };
}

function partialWarning(current: readonly ImportRow[], next: readonly ImportRow[]): PartialWarning | null {
  const months = (rows: readonly ImportRow[]) => {
    const sorted = rows.map((row) => dateOf(row).slice(0, 7)).sort();
    return { first: sorted[0] ?? "", last: sorted.at(-1) ?? "" };
  };
  const data = months(current);
  const file = months(next);
  const currentAccounts = findSetupOptions(current).accounts;
  const fileAccounts = new Set(findSetupOptions(next).accounts);
  const missing = currentAccounts.filter((account) => !fileAccounts.has(account)).length;
  const warning: PartialWarning = {
    startsLater: file.first > data.first ? { file: file.first, data: data.first } : null,
    endsEarlier: file.last < data.last ? { file: file.last, data: data.last } : null,
    // At least 10% fewer rows, in whole numbers so there's no rounding.
    fewerRows: next.length * 10 <= current.length * 9 ? { file: next.length, data: current.length } : null,
    // More than half of the current accounts, worked out here and never by the page (ruling 1).
    mostAccountsMissing: missing * 2 > currentAccounts.length,
  };
  return warning.startsLater || warning.endsEarlier || warning.fewerRows || warning.mostAccountsMissing ? warning : null;
}

/** Compares a parsed file with the current data. Nothing is saved. */
export function buildPending(db: Db, rows: ImportRow[], today: string): PendingUpdate {
  ensureDataSchema(db);
  const current = readRows(db);
  const lists = matchRows(current, rows);
  const before = findSetupOptions(current);
  const after = findSetupOptions(rows);
  const names = (options: SetupOptions, kind: CategoryKind) => new Set(options[kind].map((category) => category.name));
  const had = { accounts: new Set(before.accounts), income: names(before, "income"), expense: names(before, "expense") };
  const has = { accounts: new Set(after.accounts), income: names(after, "income"), expense: names(after, "expense") };
  const balances = rebuildBalances(rows, today);
  const dates = rows.map(dateOf).sort();
  const review: Review = {
    same: lists.added.length === 0 && lists.changed.length === 0 && lists.removed.length === 0,
    counts: { added: lists.added.length, changed: lists.changed.length, removed: lists.removed.length, total: rows.length },
    fileFrom: dates[0] ?? today,
    fileTo: dates.at(-1) ?? today,
    netWorthNew: netWorth(rows, today, today),
    netWorthOld: netWorth(current, today, today),
    lists,
    newAccounts: after.accounts.filter((account) => !had.accounts.has(account)).map((name) => ({ name, balance: balances.get(name) ?? 0 })),
    newCategories: {
      income: after.income.filter((category) => !had.income.has(category.name)),
      expense: after.expense.filter((category) => !had.expense.has(category.name)),
    },
    removedAccounts: before.accounts.filter((account) => !has.accounts.has(account)).length,
    removedCategories: CATEGORY_KINDS.reduce((total, kind) => total + [...had[kind]].filter((name) => !has[kind].has(name)).length, 0),
    warning: partialWarning(current, rows),
  };
  return { rows, version: dataState(db).version, review };
}

export interface ReplaceChoices {
  version: number | null;
  /** The "I've checked" tick box. */
  ticked: boolean;
  /** One per new account, in the review's order. "" leaves it Ungrouped. */
  groups: string[];
}

export type ReplaceCode = "STALE" | "NEED_TICK" | "BAD_ANSWERS" | "AMOUNTS_TOO_LARGE" | "SAVE_FAILED";
export type ReplaceResult = { ok: true } | { ok: false; code: ReplaceCode };

/**
 * Replaces the data with a reviewed file, and keeps the old data as the one
 * undo copy, all in one saved step. Answers for names no longer in the file
 * leave the live setup tables and stay only in the undo copy (condition 36).
 */
export function replaceData(db: Db, pending: PendingUpdate, choices: ReplaceChoices, today: string): ReplaceResult {
  try {
    ensureDataSchema(db);
    if (firstTimeStep(db) !== "shell") return { ok: false, code: "STALE" };
    if (choices.version === null || choices.version !== pending.version || pending.version !== dataState(db).version) return { ok: false, code: "STALE" };
    // The page keeps the button off until the box is ticked, but only this check counts.
    if (pending.review.warning !== null && !choices.ticked) return { ok: false, code: "NEED_TICK" };
    if (!amountsAddUpSafely(pending.rows)) return { ok: false, code: "AMOUNTS_TOO_LARGE" };
    const { newAccounts } = pending.review;
    if (!Array.isArray(choices.groups) || choices.groups.length !== newAccounts.length || !choices.groups.every(isGroupOrNone)) {
      return { ok: false, code: "BAD_ANSWERS" };
    }

    const kept = findSetupOptions(pending.rows);
    const accounts = new Set(kept.accounts);
    const categories = { income: new Set(kept.income.map((c) => c.name)), expense: new Set(kept.expense.map((c) => c.name)) };

    db.transaction(() => {
      if (pending.version !== dataState(db).version) throw new Error("stale");
      const before = dataState(db);

      clearUndo(db);
      for (const [undo, live] of UNDO_TABLES) db.exec(`INSERT INTO ${undo} SELECT * FROM ${live}`);
      db.prepare("INSERT INTO undo_state (id, last_upload_date, last_upload_rows) VALUES (1, ?, ?)").run(before.lastUploadDate, before.lastUploadRows);

      db.exec("DELETE FROM import_rows");
      writeRows(db, pending.rows);

      const dropAccount = db.prepare("DELETE FROM setup_accounts WHERE name = ?");
      for (const { name } of db.prepare("SELECT name FROM setup_accounts").all() as Array<{ name: string }>) {
        if (!accounts.has(name)) dropAccount.run(name);
      }
      // Groups are the owner's own names, not the file's, so they stay; only the category's place goes.
      const dropCategory = db.prepare("DELETE FROM setup_categories WHERE kind = ? AND name = ?");
      for (const { kind, name } of db.prepare("SELECT kind, name FROM setup_categories").all() as Array<{ kind: CategoryKind; name: string }>) {
        if (!categories[kind]?.has(name)) dropCategory.run(kind, name);
      }

      const addAccount = db.prepare("INSERT OR REPLACE INTO setup_accounts (name, account_group) VALUES (?, ?)");
      newAccounts.forEach(({ name }, index) => {
        if (choices.groups[index] !== "") addAccount.run(name, choices.groups[index]);
      });
      // New income and expense categories stay Not grouped until the owner places them in Settings.

      db.prepare("UPDATE app_state SET last_upload_date = ?, last_upload_rows = ?, note = 'updated', undo_date = ? WHERE id = 1")
        .run(today, pending.rows.length, today);
      bumpVersion(db);
    }).immediate();
    return { ok: true };
  } catch {
    return { ok: false, code: "SAVE_FAILED" };
  }
}

export type UndoResult = { ok: true } | { ok: false; code: "STALE" | "NOTHING_TO_UNDO" | "SAVE_FAILED" };

/** Brings back the rows and setup answers from before the last update, in one step. There's no redo. */
export function undoUpdate(db: Db, version: number | null): UndoResult {
  try {
    ensureDataSchema(db);
    const state = dataState(db);
    if (state.undoDate === null) return { ok: false, code: "NOTHING_TO_UNDO" };
    if (version === null || version !== state.version) return { ok: false, code: "STALE" };
    db.transaction(() => {
      const now = dataState(db);
      if (now.undoDate === null || now.version !== state.version) throw new Error("stale");
      for (const [undo, live] of UNDO_TABLES) {
        db.exec(`DELETE FROM ${live}`);
        db.exec(`INSERT INTO ${live} SELECT * FROM ${undo}`);
      }
      const before = db.prepare("SELECT last_upload_date AS date, last_upload_rows AS rows FROM undo_state WHERE id = 1").get() as
        | { date: string | null; rows: number | null }
        | undefined;
      clearUndo(db);
      db.prepare("UPDATE app_state SET last_upload_date = ?, last_upload_rows = ?, note = 'undone' WHERE id = 1").run(before?.date ?? null, before?.rows ?? null);
      bumpVersion(db);
    }).immediate();
    return { ok: true };
  } catch {
    return { ok: false, code: "SAVE_FAILED" };
  }
}

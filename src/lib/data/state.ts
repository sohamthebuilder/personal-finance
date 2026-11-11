/**
 * The app's own record of its data: a version that goes up with every saved
 * change, the last upload, the note waiting to be dismissed, and the one undo
 * copy. The undo copy is a second set of tables in the same encrypted database
 * (Decision 11), so it is never written anywhere else.
 */
import type Database from "better-sqlite3-multiple-ciphers";
import { ensureSchema as ensureRowsSchema } from "../import/store.ts";
import { ensureSetupSchema } from "../setup/store.ts";

type Db = Database.Database;

export type DataNote = "imported" | "updated" | "undone";

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS app_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    data_version INTEGER NOT NULL,
    last_upload_date TEXT,
    last_upload_rows INTEGER,
    note TEXT CHECK (note IN ('imported', 'updated', 'undone')),
    undo_date TEXT
  ) STRICT;
  CREATE TABLE IF NOT EXISTS undo_import_rows (
    id INTEGER PRIMARY KEY,
    row_number INTEGER NOT NULL,
    occurred_at TEXT NOT NULL,
    account TEXT NOT NULL,
    category TEXT NOT NULL,
    subcategory TEXT NOT NULL,
    note TEXT NOT NULL,
    amount_paise INTEGER NOT NULL,
    row_type TEXT NOT NULL,
    original_amount TEXT NOT NULL,
    currency TEXT NOT NULL,
    second_account TEXT NOT NULL
  ) STRICT;
  CREATE TABLE IF NOT EXISTS undo_setup_accounts (
    name TEXT PRIMARY KEY,
    account_group TEXT NOT NULL
  ) STRICT;
  DROP TABLE IF EXISTS undo_setup_income_categories;
  DROP TABLE IF EXISTS undo_setup_choices;
  CREATE TABLE IF NOT EXISTS undo_setup_groups (
    kind TEXT NOT NULL,
    position INTEGER NOT NULL,
    name TEXT NOT NULL,
    PRIMARY KEY (kind, position)
  ) STRICT;
  CREATE TABLE IF NOT EXISTS undo_setup_categories (
    kind TEXT NOT NULL,
    name TEXT NOT NULL,
    position INTEGER NOT NULL,
    PRIMARY KEY (kind, name)
  ) STRICT;
  CREATE TABLE IF NOT EXISTS undo_setup_saved (
    id INTEGER PRIMARY KEY CHECK (id = 1)
  ) STRICT;
  CREATE TABLE IF NOT EXISTS undo_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    last_upload_date TEXT,
    last_upload_rows INTEGER
  ) STRICT;
`;

/** Every table a change touches. Safe to call at any time. */
export function ensureDataSchema(db: Db): void {
  ensureRowsSchema(db);
  ensureSetupSchema(db);
  db.exec(SCHEMA);
  db.prepare("INSERT OR IGNORE INTO app_state (id, data_version) VALUES (1, 0)").run();
}

export interface DataState {
  version: number;
  lastUploadDate: string | null;
  lastUploadRows: number | null;
  note: DataNote | null;
  /** The date of the update that Undo would take back, or null when there's nothing to undo. */
  undoDate: string | null;
}

interface StoredState {
  data_version: number;
  last_upload_date: string | null;
  last_upload_rows: number | null;
  note: DataNote | null;
  undo_date: string | null;
}

export function dataState(db: Db): DataState {
  ensureDataSchema(db);
  const row = db.prepare("SELECT * FROM app_state WHERE id = 1").get() as StoredState;
  return {
    version: row.data_version,
    lastUploadDate: row.last_upload_date,
    lastUploadRows: row.last_upload_rows,
    note: row.note,
    undoDate: row.undo_date,
  };
}

export function dataVersion(db: Db): number {
  return dataState(db).version;
}

/** Called inside every write, so any page holding the old number is refused. */
export function bumpVersion(db: Db): void {
  db.prepare("UPDATE app_state SET data_version = data_version + 1 WHERE id = 1").run();
}

/** A version as it arrives in a request: whole digits only. */
export function readVersion(text: string): number | null {
  return /^[0-9]{1,15}$/.test(text) ? Number(text) : null;
}

/** Dismissing a note changes no data, so the version stays. */
export function dismissNote(db: Db): void {
  ensureDataSchema(db);
  db.prepare("UPDATE app_state SET note = NULL WHERE id = 1").run();
}

export const UNDO_TABLES = [
  ["undo_import_rows", "import_rows"],
  ["undo_setup_accounts", "setup_accounts"],
  ["undo_setup_groups", "setup_groups"],
  ["undo_setup_categories", "setup_categories"],
  ["undo_setup_saved", "setup_saved"],
] as const;

export function clearUndo(db: Db): void {
  for (const [undo] of UNDO_TABLES) db.exec(`DELETE FROM ${undo}`);
  db.exec("DELETE FROM undo_state");
  db.prepare("UPDATE app_state SET undo_date = NULL WHERE id = 1").run();
}

/**
 * Made-up data folders for the app's tests. Everything lives in a temporary
 * HOME, never the real data folder, and the password is made up.
 */
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createEncryptedDb, openEncryptedDb } from "../../src/lib/db/encrypted-db.ts";
import { type DataFiles, dataFiles, dataFolder } from "../../src/lib/data-files.ts";
import { ensureSchema, writeRows } from "../../src/lib/import/store.ts";
import type { ImportRow } from "../../src/lib/import/parse-export.ts";
import { confirmSummary, type FirstTimeStep } from "../../src/lib/setup/progress.ts";
import { loadSetup } from "../../src/lib/setup/store.ts";

export const MADE_UP_PASSWORD = "made up phrase for the tests";

export interface TempHome {
  home: string;
  files: DataFiles;
  cleanup: () => void;
}

export function tempHome(): TempHome {
  const home = mkdtempSync(join(tmpdir(), "pf-home-"));
  const folder = dataFolder(home);
  if (folder === null) throw new Error("bad temp home");
  return { home, files: dataFiles(folder), cleanup: () => rmSync(home, { recursive: true, force: true }) };
}

const MADE_UP_ROW: ImportRow = {
  rowNumber: 2,
  occurredAt: "2024-04-01T10:00:00",
  account: "Made-up Bank",
  category: "Food",
  subcategory: "",
  note: "",
  amountPaise: 12_300,
  type: "Exp.",
  originalAmount: "123",
  currency: "INR",
  secondAccount: "",
};

type Db = Awaited<ReturnType<typeof createEncryptedDb>>;

/** Fills a made-up database up to the given first-time step. */
function fill(db: Db, step: FirstTimeStep): void {
  if (step === "upload") return;
  ensureSchema(db);
  if (db.prepare("SELECT 1 FROM import_rows LIMIT 1").get() === undefined) writeRows(db, [MADE_UP_ROW]);
  if (step === "setup") return;
  loadSetup(db);
  db.prepare("INSERT OR IGNORE INTO setup_choices (id, reimbursement_account, trends_start_date) VALUES (1, NULL, NULL)").run();
  if (step === "summary") return;
  confirmSummary(db);
}

/** Builds a made-up encrypted database at the given first-time step. */
export async function makeDatabase(files: DataFiles, step: FirstTimeStep): Promise<void> {
  mkdirSync(files.folder, { recursive: true, mode: 0o700 });
  const db = await createEncryptedDb(files.database, MADE_UP_PASSWORD);
  try {
    fill(db, step);
  } finally {
    db.close();
  }
}

/** Moves an existing made-up database on to a later step, as Part 4B's screens will. Tests only. */
export async function advanceDatabase(files: DataFiles, password: string, step: FirstTimeStep): Promise<void> {
  const db = await openEncryptedDb(files.database, password);
  try {
    fill(db, step);
  } finally {
    db.close();
  }
}

/**
 * Where the owner is in the first-time flow, worked out from what's saved
 * (ruling 3). Nothing in a web address or a request body can change it.
 */
import type Database from "better-sqlite3-multiple-ciphers";

type Db = Database.Database;

export type FirstTimeStep = "upload" | "setup" | "summary" | "shell";

const PROGRESS_SCHEMA = `
  CREATE TABLE IF NOT EXISTS setup_progress (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    summary_confirmed INTEGER NOT NULL CHECK (summary_confirmed = 1)
  ) STRICT
`;

function tableHasRow(db: Db, table: "import_rows" | "setup_choices" | "setup_progress"): boolean {
  const exists = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
  if (exists === undefined) return false;
  return db.prepare(`SELECT 1 FROM ${table} LIMIT 1`).get() !== undefined;
}

export function firstTimeStep(db: Db): FirstTimeStep {
  if (!tableHasRow(db, "import_rows")) return "upload";
  if (!tableHasRow(db, "setup_choices")) return "setup";
  if (!tableHasRow(db, "setup_progress")) return "summary";
  return "shell";
}

/**
 * Records that the owner confirmed the summary. Phase 4B's summary route is
 * its only caller. In 4A no route calls it (condition 52); tests use it to
 * build a made-up database in a temporary folder.
 */
export function confirmSummary(db: Db): void {
  db.exec(PROGRESS_SCHEMA);
  db.prepare("INSERT OR IGNORE INTO setup_progress (id, summary_confirmed) VALUES (1, 1)").run();
}

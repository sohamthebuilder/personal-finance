import type Database from "better-sqlite3-multiple-ciphers";
import { ImportRejected } from "./errors.ts";
import type { ImportRow, RowType } from "./parse-export.ts";

type Db = Database.Database;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS import_rows (
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
  ) STRICT
`;

export function ensureSchema(db: Db): void {
  db.exec(SCHEMA);
}

export function hasImportedRows(db: Db): boolean {
  return db.prepare("SELECT 1 FROM import_rows LIMIT 1").get() !== undefined;
}

/** Writes every row in one transaction, with bound values only, so a failure leaves nothing behind. */
export function writeRows(db: Db, rows: readonly ImportRow[]): void {
  const insert = db.prepare(`
    INSERT INTO import_rows (
      row_number, occurred_at, account, category, subcategory, note,
      amount_paise, row_type, original_amount, currency, second_account
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  db.transaction(() => {
    for (const row of rows) {
      insert.run(
        row.rowNumber,
        row.occurredAt,
        row.account,
        row.category,
        row.subcategory,
        row.note,
        row.amountPaise,
        row.type,
        row.originalAmount,
        row.currency,
        row.secondAccount,
      );
    }
  })();
}

/**
 * The only way an import saves. The "already imported" check runs inside the
 * write transaction, so two imports can't both pass it.
 */
export function saveFirstImport(db: Db, rows: readonly ImportRow[]): void {
  db.transaction(() => {
    if (hasImportedRows(db)) throw new ImportRejected("ALREADY_IMPORTED");
    writeRows(db, rows);
  }).immediate();
}

interface StoredRow {
  row_number: number;
  occurred_at: string;
  account: string;
  category: string;
  subcategory: string;
  note: string;
  amount_paise: number;
  row_type: string;
  original_amount: string;
  currency: string;
  second_account: string;
}

export function readRows(db: Db): ImportRow[] {
  const stored = db.prepare("SELECT * FROM import_rows ORDER BY id").all() as StoredRow[];
  return stored.map((row) => ({
    rowNumber: row.row_number,
    occurredAt: row.occurred_at,
    account: row.account,
    category: row.category,
    subcategory: row.subcategory,
    note: row.note,
    amountPaise: row.amount_paise,
    type: row.row_type as RowType,
    originalAmount: row.original_amount,
    currency: row.currency,
    secondAccount: row.second_account,
  }));
}

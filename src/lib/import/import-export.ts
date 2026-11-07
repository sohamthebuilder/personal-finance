import type Database from "better-sqlite3-multiple-ciphers";
import { amountsAddUpSafely, isFutureDated, pairTransfers } from "./balances.ts";
import { ImportRejected, REJECTION_MESSAGES, type RejectionCode } from "./errors.ts";
import { type ImportRow, parseExport, ROW_TYPES, type RowType } from "./parse-export.ts";
import { ensureSchema, hasImportedRows, saveFirstImport } from "./store.ts";
import { LIMITS, type Limits, type ReadStats } from "./xlsx-reader.ts";

export interface ImportReport {
  rowsImported: number;
  rowsByType: Record<RowType, number>;
  accounts: number;
  transferPairs: number;
  /** A warning, not a failure: one odd row shouldn't lock the owner out of their data. */
  unmatchedTransferRows: number[];
  futureDatedRows: number[];
  roundedAmounts: number;
}

export type ImportResult =
  | { ok: true; report: ImportReport }
  | { ok: false; code: RejectionCode; message: string; rows: readonly number[]; rowCount: number };

export interface ImportOptions {
  /** YYYY-MM-DD. Rows dated after this are flagged as future-dated. */
  today: string;
  limits?: Limits;
  stats?: ReadStats;
}

function buildReport(rows: readonly ImportRow[], roundedAmounts: number, today: string): ImportReport {
  const rowsByType = Object.fromEntries(ROW_TYPES.map((type) => [type, 0])) as Record<RowType, number>;
  for (const row of rows) rowsByType[row.type] += 1;
  const transfers = pairTransfers(rows);
  return {
    rowsImported: rows.length,
    rowsByType,
    accounts: new Set(rows.map((row) => row.account)).size,
    transferPairs: transfers.pairs,
    unmatchedTransferRows: transfers.unmatchedRows,
    futureDatedRows: rows.filter((row) => isFutureDated(row, today)).map((row) => row.rowNumber),
    roundedAmounts,
  };
}

/**
 * Imports an export into an already open database. It takes bytes and never a
 * path, and has no default database, so it can't reach real data by accident.
 *
 * This is the error boundary: it never throws, and anything unexpected becomes
 * a fixed code, because error text can quote the file.
 */
export async function importExport(bytes: Uint8Array, db: Database.Database, options: ImportOptions): Promise<ImportResult> {
  try {
    ensureSchema(db);
    if (hasImportedRows(db)) throw new ImportRejected("ALREADY_IMPORTED");

    const { rows, roundedAmounts } = await parseExport(bytes, options.limits ?? LIMITS, options.stats);
    if (!amountsAddUpSafely(rows)) throw new ImportRejected("AMOUNTS_TOO_LARGE");
    const report = buildReport(rows, roundedAmounts, options.today);

    try {
      saveFirstImport(db, rows);
    } catch (error) {
      throw error instanceof ImportRejected ? error : new ImportRejected("SAVE_FAILED");
    }
    return { ok: true, report };
  } catch (error) {
    const rejected = error instanceof ImportRejected ? error : new ImportRejected("INTERNAL_ERROR");
    return {
      ok: false,
      code: rejected.code,
      message: REJECTION_MESSAGES[rejected.code],
      rows: rejected.rows,
      rowCount: rejected.rowCount,
    };
  }
}

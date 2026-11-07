import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createEncryptedDb } from "../../src/lib/db/encrypted-db.ts";
import { ImportRejected, type RejectionCode } from "../../src/lib/import/errors.ts";
import { EXPECTED_HEADER, parseExport } from "../../src/lib/import/parse-export.ts";
import type { Limits, ReadStats } from "../../src/lib/import/xlsx-reader.ts";
import { buildWorkbook, type SheetCell, type WorkbookOptions } from "../../src/lib/sample/xlsx-writer.ts";

export const HEADER: readonly SheetCell[] = [...EXPECTED_HEADER];

export type RowOverrides = Partial<{
  period: SheetCell;
  account: SheetCell;
  category: SheetCell;
  subcategory: SheetCell;
  note: SheetCell;
  inr: SheetCell;
  type: SheetCell;
  tag: SheetCell;
  description: SheetCell;
  amount: SheetCell;
  currency: SheetCell;
  secondAccount: SheetCell;
}>;

export function row(overrides: RowOverrides = {}): SheetCell[] {
  const merged = {
    period: "15/01/2024, 10:30:00",
    account: "Made-up Account",
    category: "Made-up Category",
    subcategory: "Made-up Subcategory",
    note: "Made-up note",
    inr: 100.5,
    type: "Exp.",
    tag: null,
    description: null,
    amount: 100.5,
    currency: "INR",
    secondAccount: "Made-up Account",
    ...overrides,
  };
  return [
    merged.period, merged.account, merged.category, merged.subcategory, merged.note, merged.inr,
    merged.type, merged.tag, merged.description, merged.amount, merged.currency, merged.secondAccount,
  ];
}

export function workbook(rows: ReadonlyArray<readonly SheetCell[]> = [row()], options?: WorkbookOptions): Uint8Array {
  return buildWorkbook([HEADER, ...rows], options);
}

export async function rejection(bytes: Uint8Array, limits?: Limits, stats?: ReadStats): Promise<ImportRejected> {
  try {
    await parseExport(bytes, limits, stats);
  } catch (error) {
    assert.ok(error instanceof ImportRejected, "only ImportRejected may escape the reader");
    return error;
  }
  return assert.fail("the file was accepted");
}

export async function assertRejected(
  bytes: Uint8Array,
  code: RejectionCode,
  limits?: Limits,
  stats?: ReadStats,
): Promise<ImportRejected> {
  const error = await rejection(bytes, limits, stats);
  assert.equal(error.code, code);
  return error;
}

/** A throwaway encrypted database, removed afterwards. */
export async function withDb<T>(run: (db: Awaited<ReturnType<typeof createEncryptedDb>>, folder: string) => Promise<T>): Promise<T> {
  const folder = mkdtempSync(join(tmpdir(), "import-test-"));
  const db = await createEncryptedDb(join(folder, "test.db"), "made-up-password");
  try {
    return await run(db, folder);
  } finally {
    if (db.open) db.close();
    rmSync(folder, { recursive: true, force: true });
  }
}

/**
 * The owner's check for Phase 1: imports the made-up sample into a throwaway
 * encrypted database and prints a short summary. It uses no real data.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createEncryptedDb } from "../src/lib/db/encrypted-db.ts";
import { pairTransfers, rebuildBalances } from "../src/lib/import/balances.ts";
import { importExport } from "../src/lib/import/import-export.ts";
import { ROW_TYPES } from "../src/lib/import/parse-export.ts";
import { readRows } from "../src/lib/import/store.ts";
import { makeSample } from "../src/lib/sample/sample-export.ts";
import { findMissingTraps, TRAP_COUNT } from "../src/lib/sample/traps.ts";

const folder = mkdtempSync(join(tmpdir(), "sample-check-"));
let passed = false;

try {
  const sample = makeSample();
  const db = await createEncryptedDb(join(folder, "sample.db"), "made-up-password");
  const result = await importExport(sample.bytes, db, { today: sample.today });
  if (!result.ok) throw new Error(`The sample didn't import: ${result.code}`);
  const rows = readRows(db);
  db.close();

  const rowTypesMatch = ROW_TYPES.every((type) => result.report.rowsByType[type] === (sample.rowsByType[type] ?? 0));
  const expected = sample.balancesAsOf(sample.today);
  const actual = rebuildBalances(rows, sample.today);
  const balancesMatched = [...expected].filter(([account, balance]) => actual.get(account) === balance).length;
  const transfers = pairTransfers(rows);
  const closedAtZero = sample.closedAccounts.every((account) => actual.get(account) === 0);
  const missingTraps = findMissingTraps(sample.rows);

  console.log("Rows read, by type:");
  for (const type of ROW_TYPES) console.log(`  ${type}: ${result.report.rowsByType[type]}`);
  console.log(`Rows in total: ${rows.length} of ${sample.rows.length}`);
  console.log(`Balances matched: ${balancesMatched} of ${expected.size}`);
  console.log(`Transfers paired: ${transfers.pairs} of ${sample.transferPairs}, with ${transfers.unmatchedRows.length} unmatched`);
  console.log(`Closed accounts at zero: ${closedAtZero ? "yes" : "no"}`);
  console.log(`Traps covered: ${TRAP_COUNT - missingTraps.length} of ${TRAP_COUNT}`);

  passed =
    rowTypesMatch &&
    rows.length === sample.rows.length &&
    balancesMatched === expected.size &&
    actual.size === expected.size &&
    transfers.pairs === sample.transferPairs &&
    transfers.unmatchedRows.length === 0 &&
    closedAtZero &&
    missingTraps.length === 0;
} finally {
  rmSync(folder, { recursive: true, force: true });
}

console.log(passed ? "PASS" : "FAIL");
process.exit(passed ? 0 : 1);

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { rebuildBalances } from "../src/lib/import/balances.ts";
import { REJECTION_MESSAGES } from "../src/lib/import/errors.ts";
import { importExport } from "../src/lib/import/import-export.ts";
import { ensureSchema, hasImportedRows, readRows } from "../src/lib/import/store.ts";
import { row, withDb, workbook } from "./support/import-helpers.ts";

const TODAY = "2026-06-15";
const HUGE = "90071992547409.91"; // The largest single amount the reader accepts.

describe("amounts too large for a balance (S-3)", () => {
  it("AC-26: Security's example is refused with fixed text, and nothing is saved", async () => {
    await withDb(async (db) => {
      const bytes = workbook([row({ inr: HUGE, type: "Income" }), row({ inr: HUGE, type: "Income" })]);
      const result = await importExport(bytes, db, { today: TODAY });
      assert.equal(result.ok, false);
      if (result.ok) return;
      assert.equal(result.code, "AMOUNTS_TOO_LARGE");
      assert.equal(result.message, REJECTION_MESSAGES.AMOUNTS_TOO_LARGE);
      ensureSchema(db);
      assert.equal(hasImportedRows(db), false);
    });
  });

  it("AC-26: amounts that cancel out are still refused, because a running balance or total could break", async () => {
    await withDb(async (db) => {
      const bytes = workbook([row({ inr: HUGE, type: "Income" }), row({ inr: HUGE, type: "Exp." })]);
      const result = await importExport(bytes, db, { today: TODAY });
      assert.equal(result.ok ? "ok" : result.code, "AMOUNTS_TOO_LARGE");
    });
  });

  it("AC-26: negative amounts count by size", async () => {
    await withDb(async (db) => {
      const bytes = workbook([row({ inr: `-${HUGE}`, type: "Income" }), row({ inr: `-${HUGE}`, type: "Income" })]);
      const result = await importExport(bytes, db, { today: TODAY });
      assert.equal(result.ok ? "ok" : result.code, "AMOUNTS_TOO_LARGE");
    });
  });

  it("AC-26: a huge gain and a huge loss are added by size, so they don't cancel out", async () => {
    await withDb(async (db) => {
      const bytes = workbook([row({ inr: HUGE, type: "Income" }), row({ inr: `-${HUGE}`, type: "Income" })]);
      const result = await importExport(bytes, db, { today: TODAY });
      assert.equal(result.ok ? "ok" : result.code, "AMOUNTS_TOO_LARGE");
    });
  });

  it("AC-26: exactly at the limit is accepted, and the balance rebuilds", async () => {
    await withDb(async (db) => {
      const result = await importExport(workbook([row({ inr: "90071992547409.90", type: "Income" }), row({ inr: "0.01", type: "Income" })]), db, { today: TODAY });
      assert.equal(result.ok, true);
      assert.equal(rebuildBalances(readRows(db), TODAY).get("Made-up Account"), Number.MAX_SAFE_INTEGER);
    });
  });

  it("AC-26: one paisa over the limit is refused", async () => {
    await withDb(async (db) => {
      const result = await importExport(workbook([row({ inr: HUGE, type: "Income" }), row({ inr: "0.01", type: "Income" })]), db, { today: TODAY });
      assert.equal(result.ok ? "ok" : result.code, "AMOUNTS_TOO_LARGE");
    });
  });
});

it("AC-26: a full-size file with ordinary amounts still imports", async () => {
  await withDb(async (db) => {
    const rows = Array.from({ length: 100_000 }, () => row({ inr: 12_345.67, type: "Exp." }));
    const result = await importExport(workbook(rows), db, { today: TODAY });
    assert.equal(result.ok && result.report.rowsImported, 100_000);
  });
});

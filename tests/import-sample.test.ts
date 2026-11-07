import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { before, describe, it } from "node:test";
import { isFutureDated, pairTransfers, rebuildBalances } from "../src/lib/import/balances.ts";
import { type ImportRow, parseExport, ROW_TYPES } from "../src/lib/import/parse-export.ts";
import { ACCOUNTS, HOSTILE_NOTES, makeSample, type Sample, type SampleRow } from "../src/lib/sample/sample-export.ts";
import { findMissingTraps, TRAP_COUNT } from "../src/lib/sample/traps.ts";

describe("sample export", () => {
  let sample: Sample;
  let rows: ImportRow[];

  before(async () => {
    sample = makeSample();
    ({ rows } = await parseExport(sample.bytes));
  });

  it("AC-1: running it twice gives identical bytes", () => {
    assert.deepEqual(Buffer.from(makeSample().bytes), Buffer.from(sample.bytes));
  });

  it("AC-1: the sample and the reader can't write to disk", () => {
    for (const folder of ["src/lib/sample", "src/lib/import"]) {
      for (const file of readdirSync(folder)) {
        const source = readFileSync(`${folder}/${file}`, "utf8");
        assert.doesNotMatch(source, /from "(node:)?fs/, `${file} imports the file system`);
      }
    }
  });

  it("AC-2: covers all nine traps", () => {
    assert.equal(TRAP_COUNT, 9);
    assert.deepEqual(findMissingTraps(sample.rows), []);
  });

  it("AC-2: the trap check fails when any one trap is taken out", () => {
    const without = (drop: (row: SampleRow) => boolean) => findMissingTraps(sample.rows.filter((row) => !drop(row)));
    const cases: Array<[string, (row: SampleRow) => boolean]> = [
      ["1.", (row) => row.type === "Income" && row.paise < 0],
      ["2.", (row) => row.category.includes("Loan")],
      ["3.", (row) => row.type === "Expense Balance"],
      ["4.", (row) => row.at.startsWith("2024-03")],
      ["5.", (row) => row.at.slice(0, 10) > sample.today],
      ["6.", (row) => row.account !== row.secondAccount],
      ["7.", (row) => row.currency !== "INR"],
      ["8.", (row) => row.note === "Made-up repeat"],
      ["9.", (row) => row.category === "Made-up Car"],
    ];
    for (const [trap, drop] of cases) {
      assert.ok(without(drop).some((name) => name.startsWith(trap)), `trap ${trap} wasn't noticed`);
    }
  });

  it("AC-2: includes a closed account and a foreign-currency account", () => {
    assert.ok(sample.closedAccounts.length > 0);
    assert.ok(sample.rows.some((row) => row.account === ACCOUNTS.closed));
    assert.ok(sample.rows.some((row) => row.account === ACCOUNTS.usd && row.currency === "USD"));
  });

  it("AC-3: all names are obviously made up", () => {
    const madeUp = /Sample|Demo|Test|Pretend|Made-up/;
    for (const row of sample.rows) {
      assert.match(row.account, madeUp);
      if (row.category && row.category !== "Transfer" && row.category !== "Modified Bal.") {
        assert.match(row.category, madeUp);
      }
    }
  });

  it("AC-4 and AC-8: every field of every row lands in the right place", () => {
    assert.equal(rows.length, sample.rows.length);
    sample.rows.forEach((expected, index) => {
      const actual = rows[index];
      assert.ok(actual);
      assert.equal(actual.rowNumber, index + 2);
      assert.equal(actual.occurredAt, expected.at);
      assert.equal(actual.account, expected.account);
      assert.equal(actual.secondAccount, expected.secondAccount);
      assert.equal(actual.category, expected.category);
      assert.equal(actual.subcategory, expected.subcategory);
      assert.equal(actual.note, expected.note);
      assert.equal(actual.amountPaise, expected.paise);
      assert.equal(actual.type, expected.type);
      assert.equal(actual.originalAmount, String(expected.amount));
      assert.equal(actual.currency, expected.currency);
    });
  });

  it("AC-4: the two Accounts columns stay apart on a known transfer", () => {
    const out = rows.find((row) => row.type === "Transfer-Out" && row.account === ACCOUNTS.closed);
    assert.equal(out?.secondAccount, ACCOUNTS.bank);
  });

  it("AC-5 and AC-6: every type is present and the counts match the generator", () => {
    for (const type of ROW_TYPES) {
      assert.ok((sample.rowsByType[type] ?? 0) > 0, `no ${type} rows`);
      assert.equal(rows.filter((row) => row.type === type).length, sample.rowsByType[type]);
    }
  });

  it("AC-7: identical repeat rows are all kept", () => {
    assert.equal(rows.filter((row) => row.note === "Made-up repeat").length, 3);
  });

  it("AC-8: sums use INR, with the original amount kept for reference", () => {
    const hotel = rows.find((row) => row.subcategory === "Hotel");
    assert.equal(hotel?.amountPaise, 20_862_50);
    assert.equal(hotel?.originalAmount, "250");
    assert.equal(hotel?.currency, "USD");
  });

  it("AC-9: a market loss stays negative", () => {
    assert.ok(rows.some((row) => row.type === "Income" && row.amountPaise < 0));
  });

  it("AC-10: future rows are flagged, and count only once their date arrives", () => {
    const future = rows.filter((row) => isFutureDated(row, sample.today));
    assert.equal(future.length, 2);
    const today = rebuildBalances(rows, sample.today).get(ACCOUNTS.bank) ?? 0;
    const afterRent = rebuildBalances(rows, "2026-06-30").get(ACCOUNTS.bank) ?? 0;
    const dayBeforeRent = rebuildBalances(rows, "2026-06-29").get(ACCOUNTS.bank) ?? 0;
    assert.equal(dayBeforeRent, today);
    assert.equal(afterRent, today - 12_345_67);
  });

  it("AC-11: balances match the generator's ledger exactly, today and in the past", () => {
    for (const date of ["2023-03-31", "2024-01-05", "2024-02-29", "2025-03-15", sample.today, "2026-12-31"]) {
      const actual = rebuildBalances(rows, date);
      const expected = sample.balancesAsOf(date);
      assert.deepEqual([...actual].sort(), [...expected].sort(), `balances on ${date}`);
    }
  });

  it("AC-12: every transfer has a partner, including identical repeats", () => {
    assert.deepEqual(pairTransfers(rows), { pairs: sample.transferPairs, unmatchedRows: [] });
  });

  it("AC-12: removing one side reports exactly the row left behind", () => {
    const repeatOuts = rows.filter((row) => row.type === "Transfer-Out" && row.occurredAt === "2025-05-06T08:15:00");
    assert.equal(repeatOuts.length, 2);
    const removed = repeatOuts[0];
    const check = pairTransfers(rows.filter((row) => row !== removed));
    assert.equal(check.pairs, sample.transferPairs - 1);
    assert.equal(check.unmatchedRows.length, 1);
    const left = rows.find((row) => row.rowNumber === check.unmatchedRows[0]);
    assert.equal(left?.type, "Transfer-In");
    assert.equal(left?.occurredAt, "2025-05-06T08:15:00");
  });

  it("AC-13: closed accounts come to zero", () => {
    const balances = rebuildBalances(rows, sample.today);
    for (const account of sample.closedAccounts) assert.equal(balances.get(account), 0);
  });

  it("AC-18: text that looks like code comes through unchanged", () => {
    for (const note of HOSTILE_NOTES) assert.ok(rows.some((row) => row.note === note), note);
  });
});

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { openEncryptedDb } from "../src/lib/db/encrypted-db.ts";
import { isFutureDated, pairTransfers, rebuildBalances } from "../src/lib/import/balances.ts";
import { REJECTION_MESSAGES } from "../src/lib/import/errors.ts";
import { importExport } from "../src/lib/import/import-export.ts";
import { parseExport } from "../src/lib/import/parse-export.ts";
import { ensureSchema, readRows, writeRows } from "../src/lib/import/store.ts";
import { makeSample } from "../src/lib/sample/sample-export.ts";
import { type RowOverrides, row, withDb, workbook } from "./support/import-helpers.ts";

const TODAY = "2026-06-15";
const MARKER = "MADEUPMARKERTEXT";

function filesContain(folder: string, text: string): string[] {
  const needles = [Buffer.from(text, "utf8"), Buffer.from(text, "utf16le")];
  return readdirSync(folder).filter((file) => {
    const bytes = readFileSync(join(folder, file));
    return needles.some((needle) => bytes.includes(needle));
  });
}

describe("hand-worked balances", () => {
  it("AC-11: a small file matches answers worked out by hand", async () => {
    // Opening 1,000.00, salary 500.25, spent 200.10, loss 50.05, moved 100.00, correction down 30.00.
    const at = (day: string) => `${day}/01/2024, 10:00:00`;
    const rows = [
      row({ period: at("01"), account: "A", inr: 1000, type: "Income Balance" }),
      row({ period: at("02"), account: "A", inr: 500.25, type: "Income" }),
      row({ period: at("03"), account: "A", inr: 200.1, type: "Exp." }),
      row({ period: at("04"), account: "A", inr: -50.05, type: "Income" }),
      row({ period: at("05"), account: "A", secondAccount: "B", inr: 100, type: "Transfer-Out" }),
      row({ period: at("05"), account: "B", secondAccount: "A", inr: 100, type: "Transfer-In" }),
      row({ period: at("06"), account: "A", inr: 30, type: "Expense Balance" }),
    ];
    const parsed = await parseExport(workbook(rows));
    const balances = rebuildBalances(parsed.rows, "2024-01-31");
    assert.equal(balances.get("A"), 1120_10);
    assert.equal(balances.get("B"), 100_00);
    assert.equal(rebuildBalances(parsed.rows, "2024-01-03").get("A"), 1300_15);
    assert.equal(rebuildBalances(parsed.rows, "2024-01-03").get("B"), 0);
  });

  it("many small amounts add up with no rounding drift", async () => {
    const rows = Array.from({ length: 1000 }, () => row({ inr: 0.1, type: "Income" }));
    const parsed = await parseExport(workbook(rows));
    assert.equal(rebuildBalances(parsed.rows, TODAY).get("Made-up Account"), 100_00);
  });

  it("accounts named after object internals are safe", async () => {
    const names = ["__proto__", "constructor", "toString", "hasOwnProperty"];
    const rows = names.map((account) => row({ account, inr: 10, type: "Income" }));
    const parsed = await parseExport(workbook(rows));
    const balances = rebuildBalances(parsed.rows, TODAY);
    for (const name of names) assert.equal(balances.get(name), 10_00, name);
    assert.equal(({} as Record<string, unknown>).polluted, undefined);
    assert.equal(Object.getPrototypeOf({}), Object.prototype);
    assert.equal(Object.keys(Object.prototype).length, 0);

    await withDb(async (db) => {
      const result = await importExport(workbook(rows), db, { today: TODAY });
      assert.ok(result.ok);
      assert.equal(result.report.accounts, 4);
      assert.deepEqual(readRows(db).map((saved) => saved.account), names);
    });
  });

  it("transfers with no partner are listed in the report as a warning", async () => {
    await withDb(async (db) => {
      const rows = [
        row({ type: "Transfer-Out", inr: 5, secondAccount: "Made-up Other" }),
        row({ type: "Transfer-In", inr: 5, account: "Made-up Other" }),
        row({ type: "Transfer-Out", inr: 7, secondAccount: "Made-up Other" }),
      ];
      const result = await importExport(workbook(rows), db, { today: TODAY });
      assert.ok(result.ok);
      assert.equal(result.report.transferPairs, 1);
      assert.deepEqual(result.report.unmatchedTransferRows, [4]);
      assert.equal(readRows(db).length, 3);
    });
  });
});

describe("transfer pairing", () => {
  const at = "15/01/2024, 10:00:00";
  const out = (account: string, to: string, inr = 5, period = at) =>
    row({ type: "Transfer-Out", account, secondAccount: to, inr, period });
  const into = (account: string, from: string, inr = 5, period = at) =>
    row({ type: "Transfer-In", account, secondAccount: from, inr, period });
  const check = async (rows: ReturnType<typeof row>[]) => pairTransfers((await parseExport(workbook(rows))).rows);

  it("AC-12: names the right row when two transfers share a time and amount", async () => {
    assert.deepEqual(await check([out("A", "B"), out("C", "D"), into("D", "C")]), { pairs: 1, unmatchedRows: [2] });
  });

  it("AC-12: doesn't pair unrelated accounts", async () => {
    assert.deepEqual(await check([out("A", "B"), into("X", "Y")]), { pairs: 0, unmatchedRows: [2, 3] });
  });

  it("AC-12: doesn't pair an account with itself", async () => {
    assert.deepEqual(await check([out("A", "A"), into("A", "A")]), { pairs: 0, unmatchedRows: [2, 3] });
  });

  it("AC-12: doesn't pair different times or different amounts", async () => {
    const later = "15/01/2024, 10:00:01";
    assert.deepEqual(await check([out("A", "B"), into("B", "A", 5, later)]), { pairs: 0, unmatchedRows: [2, 3] });
    assert.deepEqual(await check([out("A", "B", 5), into("B", "A", 6)]), { pairs: 0, unmatchedRows: [2, 3] });
  });

  it("AC-12: account names can't run together to fake a match", async () => {
    assert.deepEqual(await check([out('A","B', "C"), into("C", 'A","B')]), { pairs: 1, unmatchedRows: [] });
    assert.deepEqual(await check([out('A","B', "C"), into('B","C', "A")]), { pairs: 0, unmatchedRows: [2, 3] });
  });
});

describe("future-dated rows", () => {
  it("AC-10: a row dated today isn't future, and one dated tomorrow is", async () => {
    const { rows } = await parseExport(
      workbook([row({ period: "15/06/2026, 23:59:59" }), row({ period: "16/06/2026, 00:00:00" })]),
    );
    assert.deepEqual(rows.map((saved) => isFutureDated(saved, TODAY)), [false, true]);
  });
});

describe("saving", () => {
  it("AC-14: every row saved reads back identical", async () => {
    await withDb(async (db) => {
      const sample = makeSample();
      const result = await importExport(sample.bytes, db, { today: sample.today });
      assert.ok(result.ok);
      const { rows } = await parseExport(sample.bytes);
      assert.deepEqual(readRows(db), rows);
      assert.equal(result.report.rowsImported, sample.rows.length);
      assert.equal(result.report.transferPairs, sample.transferPairs);
      assert.equal(result.report.futureDatedRows.length, 2);
      assert.deepEqual(result.report.unmatchedTransferRows, []);
      assert.deepEqual(pairTransfers(readRows(db)).unmatchedRows, []);
    });
  });

  it("AC-14: rows survive closing and reopening with the password", async () => {
    await withDb(async (db, folder) => {
      await importExport(workbook([row({ note: MARKER })]), db, { today: TODAY });
      db.close();
      const reopened = await openEncryptedDb(join(folder, "test.db"), "made-up-password");
      assert.equal(readRows(reopened)[0]?.note, MARKER);
      reopened.close();
    });
  });

  it("AC-14: no made-up text is readable in the database file", async () => {
    await withDb(async (db, folder) => {
      await importExport(workbook([row({ note: MARKER, account: MARKER })]), db, { today: TODAY });
      db.close();
      assert.deepEqual(filesContain(folder, MARKER), []);
    });
  });

  it("AC-14: no made-up text is readable in any side file, even mid-save", async () => {
    await withDb(async (db, folder) => {
      const rows = Array.from({ length: 3000 }, () => row({ note: MARKER }));
      await importExport(workbook(rows), db, { today: TODAY });

      // A tiny cache forces changed pages out to disk while the save is still open.
      db.pragma("cache_size = 2");
      db.exec("BEGIN IMMEDIATE");
      db.exec(`UPDATE import_rows SET note = note || '${MARKER}'`);
      const during = readdirSync(folder);
      assert.ok(during.some((file) => file.endsWith("-journal")), "the save must have a journal to scan");
      assert.deepEqual(filesContain(folder, MARKER), []);
      db.exec("ROLLBACK");
    });
  });

  it("AC-15: a failure halfway through saving leaves earlier rows exactly as they were", async () => {
    await withDb(async (db) => {
      const first = await importExport(workbook([row({ note: "Made-up first" })]), db, { today: TODAY });
      assert.ok(first.ok);
      const before = readRows(db);

      const { rows } = await parseExport(workbook(Array.from({ length: 10 }, () => row({ note: "Made-up second" }))));
      db.exec(`
        CREATE TRIGGER fail_halfway BEFORE INSERT ON import_rows
        WHEN NEW.row_number = 7 BEGIN SELECT RAISE(ABORT, 'made-up failure'); END
      `);
      assert.throws(() => writeRows(db, rows));
      assert.deepEqual(readRows(db), before);
    });
  });

  it("AC-15: a save that fails partway through an import reports it and saves nothing", async () => {
    await withDb(async (db) => {
      ensureSchema(db);
      db.exec(`
        CREATE TRIGGER fail_halfway BEFORE INSERT ON import_rows
        WHEN NEW.row_number = 7 BEGIN SELECT RAISE(ABORT, '${MARKER}'); END
      `);
      const result = await importExport(workbook(Array.from({ length: 10 }, () => row())), db, { today: TODAY });
      assert.equal(result.ok, false);
      assert.ok(!result.ok && result.code === "SAVE_FAILED");
      assert.doesNotMatch(JSON.stringify(result), new RegExp(MARKER));
      assert.equal(readRows(db).length, 0);
    });
  });

  it("AC-15: a bad file saves nothing", async () => {
    await withDb(async (db) => {
      const result = await importExport(workbook([row(), row({ type: "Made-up" })]), db, { today: TODAY });
      assert.equal(result.ok, false);
      assert.equal(readRows(db).length, 0);
    });
  });

  it("AC-15: two imports at once can't both save", async () => {
    await withDb(async (db) => {
      const sample = makeSample();
      const options = { today: sample.today };
      const results = await Promise.all([importExport(sample.bytes, db, options), importExport(sample.bytes, db, options)]);
      assert.equal(results.filter((result) => result.ok).length, 1);
      assert.ok(results.some((result) => !result.ok && result.code === "ALREADY_IMPORTED"));
      assert.equal(readRows(db).length, sample.rows.length);
    });
  });

  it("AC-15: a second import is refused, and the first stays as it was", async () => {
    await withDb(async (db) => {
      const sample = makeSample();
      assert.ok((await importExport(sample.bytes, db, { today: sample.today })).ok);
      const before = readRows(db);
      const again = await importExport(sample.bytes, db, { today: sample.today });
      assert.ok(!again.ok && again.code === "ALREADY_IMPORTED");
      assert.deepEqual(readRows(db), before);
    });
  });

  it("AC-18: hostile text is saved as plain data", async () => {
    await withDb(async (db) => {
      const note = "'); DROP TABLE import_rows; --";
      assert.ok((await importExport(workbook([row({ note, account: note })]), db, { today: TODAY })).ok);
      assert.equal(readRows(db)[0]?.note, note);
    });
  });

  it("AC-19: the import takes bytes, and a path string does nothing", async () => {
    await withDb(async (db) => {
      const path = "/made-up/path/export.bin" as unknown as Uint8Array;
      const result = await importExport(path, db, { today: TODAY });
      assert.ok(!result.ok && result.code === "NOT_EXCEL");
    });
  });
});

describe("nothing leaks", () => {
  const everyColumn: RowOverrides = {
    period: `${MARKER}1`,
    account: `${MARKER}2`,
    category: `${MARKER}3`,
    subcategory: `${MARKER}4`,
    note: `${MARKER}5`,
    inr: `${MARKER}6`,
    type: `${MARKER}7`,
    tag: `${MARKER}8`,
    description: `${MARKER}9`,
    amount: `${MARKER}10`,
    currency: `${MARKER}11`,
    secondAccount: `${MARKER}12`,
  };

  const badFiles: Array<[string, Uint8Array]> = [
    ["every column bad", workbook([row(everyColumn)])],
    ["bad header", workbook([], { overrides: { "xl/sharedStrings.xml": `<sst><si><t>${MARKER}</t></si></sst>` } })],
    ["broken XML after marker", workbook([], { overrides: { "xl/worksheets/sheet1.xml": `<a>${MARKER}<b></a>` } })],
    ["bad entity", workbook([], { overrides: { "xl/sharedStrings.xml": `<sst><si><t>&${MARKER};</t></si></sst>` } })],
    ["unknown cell", workbook([row({ note: { attributes: `t="${MARKER}"`, inner: "<v>1</v>" } })])],
    ["bad reference", workbook([], { overrides: { "xl/worksheets/sheet1.xml": `<worksheet><sheetData><row r="${MARKER}"/></sheetData></worksheet>` } })],
    ["not a zip", Buffer.from(`${MARKER}${MARKER}`)],
  ];

  it("AC-20: messages, stacks and logs never hold file contents", async () => {
    const logged: string[] = [];
    const methods = ["log", "info", "warn", "error", "debug"] as const;
    const originals = methods.map((method) => console[method]);
    const writeOut = process.stdout.write;
    const writeErr = process.stderr.write;

    await withDb(async (db) => {
      methods.forEach((method) => {
        console[method] = (...args: unknown[]) => void logged.push(args.map(String).join(" "));
      });
      const capture = ((text: unknown) => (logged.push(String(text)), true)) as typeof process.stdout.write;
      process.stdout.write = capture;
      process.stderr.write = capture;
      try {
        for (const [name, bytes] of badFiles) {
          const result = await importExport(bytes, db, { today: TODAY });
          assert.equal(result.ok, false, name);
          assert.ok(!result.ok);
          assert.equal(result.message, REJECTION_MESSAGES[result.code], name);
          assert.doesNotMatch(JSON.stringify(result), new RegExp(MARKER), name);

          const thrown = await parseExport(bytes).then(
            () => null,
            (error: unknown) => error as Error,
          );
          assert.ok(thrown, name);
          assert.doesNotMatch(`${thrown.message} ${thrown.stack} ${String(thrown.cause)}`, new RegExp(MARKER), name);
        }
      } finally {
        process.stdout.write = writeOut;
        process.stderr.write = writeErr;
        methods.forEach((method, index) => {
          console[method] = originals[index] as (typeof console)[typeof method];
        });
      }
    });
    assert.doesNotMatch(logged.join("\n"), new RegExp(MARKER));
  });

  it("AC-20: an unexpected error becomes a fixed code with no original text", async () => {
    const brokenDb = {
      exec() {
        throw new Error(`${MARKER} from a made-up failure`);
      },
    } as unknown as Parameters<typeof importExport>[1];
    const result = await importExport(workbook(), brokenDb, { today: TODAY });
    assert.ok(!result.ok && result.code === "INTERNAL_ERROR");
    assert.doesNotMatch(JSON.stringify(result), new RegExp(MARKER));
  });

  it("the import code never logs", () => {
    for (const file of ["xlsx-reader", "parse-export", "balances", "store", "import-export"]) {
      assert.doesNotMatch(readFileSync(`src/lib/import/${file}.ts`, "utf8"), /console\./, file);
    }
  });
});

describe("leftover check", () => {
  it("AC-1: finds a stray database or spreadsheet, including in nested folders", () => {
    const folder = mkdtempSync(join(tmpdir(), "leftover-test-"));
    try {
      const run = () => spawnSync(process.execPath, ["scripts/check-leftovers.mjs", folder], { encoding: "utf8" });
      assert.equal(run().status, 0);
      writeFileSync(join(folder, "stray.db-journal"), "");
      const result = run();
      assert.equal(result.status, 1);
      assert.match(result.stderr, /stray\.db-journal/);
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });
});


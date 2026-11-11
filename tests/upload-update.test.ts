/**
 * Part 4B: the upload worker, first import, setup, summary, the update review,
 * replace and undo (conditions 54 to 57, AC-17 to AC-24). Every file is made
 * up, and every database sits in a temporary HOME.
 */
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { logIn } from "../src/lib/auth/actions.ts";
import { lock, resetSessionStore, sessionStore, type Unlocked } from "../src/lib/auth/session.ts";
import { dataState, dataVersion } from "../src/lib/data/state.ts";
import {
  acceptSummary,
  buildPending,
  replaceData,
  saveFirstRows,
  startOver,
  summaryData,
  undoUpdate,
} from "../src/lib/data/update.ts";
import { isFutureDated, pairTransfers } from "../src/lib/import/balances.ts";
import { REJECTION_MESSAGES } from "../src/lib/import/errors.ts";
import { readRows } from "../src/lib/import/store.ts";
import { netWorth } from "../src/lib/metrics/metrics.ts";
import type { ImportRow } from "../src/lib/import/parse-export.ts";
import { readInWorker, ReaderBusy } from "../src/lib/import/read-in-worker.ts";
import { firstUpload, updateUpload } from "../src/lib/import/upload.ts";
import { readFileBody } from "../src/lib/http/route-helpers.ts";
import { makeSample } from "../src/lib/sample/sample-export.ts";
import { gateRequest, UPLOAD_BODY_LIMIT } from "../src/lib/security/gate.ts";
import { firstTimeStep } from "../src/lib/setup/progress.ts";
import { findSetupOptions } from "../src/lib/setup/setup.ts";
import { answersFor, saveAnswers } from "./support/setup-helpers.ts";
import { MADE_UP_PASSWORD, makeDatabase, type TempHome, tempHome } from "./support/app-helpers.ts";
import { row, workbook } from "./support/import-helpers.ts";

const TODAY = "2026-06-15";
const MARKER = "Zebra Marker Account Qx7731";

let home: TempHome;
beforeEach(() => {
  home = tempHome();
  resetSessionStore();
});
afterEach(() => {
  resetSessionStore();
  home.cleanup();
});

/** A logged-in session on a made-up database at the upload step. */
async function session(): Promise<Unlocked> {
  await makeDatabase(home.files, "upload");
  const login = await logIn(MADE_UP_PASSWORD, home.files);
  assert.ok(login.ok);
  const unlocked = sessionStore().unlocked;
  assert.ok(unlocked);
  return unlocked;
}

function made(account: string, overrides: Partial<ImportRow> = {}): ImportRow {
  return {
    rowNumber: 2,
    occurredAt: "2024-04-01T10:00:00",
    account,
    category: "Made-up Food",
    subcategory: "",
    note: "",
    amountPaise: 10_000,
    type: "Exp.",
    originalAmount: "100",
    currency: "INR",
    secondAccount: "",
    ...overrides,
  };
}

/** Rows over four months for the given accounts, with one made-up income category. */
function rowsFor(accounts: readonly string[], months = ["2024-01", "2024-02", "2024-03", "2024-04"]): ImportRow[] {
  const rows: ImportRow[] = [];
  let number = 2;
  for (const month of months) {
    for (const account of accounts) {
      rows.push(made(account, { rowNumber: number++, occurredAt: `${month}-10T10:00:00` }));
    }
    rows.push(made(accounts[0] ?? "Made-up Bank", { rowNumber: number++, occurredAt: `${month}-01T09:00:00`, type: "Income", category: "Made-up Salary", amountPaise: 500_000 }));
  }
  return rows;
}

/** Saves setup answers the way screen 5's route does: every account in Bank, no income or expense groups. */
function answerSetup(db: Unlocked["db"]): void {
  assert.equal(saveAnswers(db, answersFor(db)).ok, true);
}

/** Takes a session through first import, setup and summary, ending in the shell. */
function toShell(db: Unlocked["db"], rows: ImportRow[]): void {
  assert.deepEqual(saveFirstRows(db, rows, TODAY), { ok: true, rows: rows.length });
  answerSetup(db);
  assert.deepEqual(acceptSummary(db, dataVersion(db)), { ok: true });
  assert.equal(firstTimeStep(db), "shell");
}

const ALL_ACCOUNTS = ["Made-up Bank", "Made-up Card", "Made-up Wallet", MARKER];

describe("upload worker (condition 54, Decision 10)", () => {
  it("refuses an over-size file at the gate, before a byte is read", () => {
    const raw = (length: number, path = "/api/upload") =>
      gateRequest({ method: "POST", url: path, rawHeaders: ["Host", "127.0.0.1:3000", "Origin", "http://127.0.0.1:3000", "Content-Length", String(length)] }, "3000");
    assert.equal(UPLOAD_BODY_LIMIT, 20 * 1024 * 1024);
    assert.deepEqual(raw(UPLOAD_BODY_LIMIT + 1), { pass: false, status: 413 });
    assert.deepEqual(raw(UPLOAD_BODY_LIMIT + 1, "/api/update/upload"), { pass: false, status: 413 });
    // The bigger limit is for the two upload routes only.
    assert.deepEqual(raw(16 * 1024 + 1, "/api/setup"), { pass: false, status: 413 });
  });

  it("refuses an over-size file in the route without reading the body", async () => {
    const request = new Request("http://127.0.0.1:3000/api/upload", {
      method: "POST",
      body: new Uint8Array(8),
      headers: { "Content-Type": "application/octet-stream", "Content-Length": String(UPLOAD_BODY_LIMIT + 1) },
    });
    assert.equal(await readFileBody(request), "TOO_LARGE");
    assert.equal(request.bodyUsed, false, "not a byte of the body was read");
  });

  it("refuses a body longer than its declared length, and anything but a raw file", async () => {
    const send = (bytes: Uint8Array<ArrayBuffer>, length: number, type = "application/octet-stream") =>
      readFileBody(new Request("http://127.0.0.1:3000/api/upload", { method: "POST", body: bytes, headers: { "Content-Type": type, "Content-Length": String(length) } }));
    assert.equal(await send(new Uint8Array(10), 4), null);
    assert.equal(await send(new Uint8Array(10), 10, "multipart/form-data; boundary=x"), null);
    assert.deepEqual(await send(new Uint8Array([1, 2, 3]), 3), new Uint8Array([1, 2, 3]));
  });

  it("turns running out of memory into fixed text", async () => {
    const big = workbook(Array.from({ length: 40_000 }, (_, index) => row({ note: `Made-up note ${index}` })));
    await assert.rejects(readInWorker(big, { resourceLimits: { maxOldGenerationSizeMb: 8, maxYoungGenerationSizeMb: 2, stackSizeMb: 4 } }), (error: Error & { code?: string }) => {
      assert.equal(error.code, "INTERNAL_ERROR");
      assert.equal(error.message, REJECTION_MESSAGES.INTERNAL_ERROR);
      return true;
    });
  });

  it("turns a read that takes too long into fixed text", async () => {
    await assert.rejects(readInWorker(makeSample().bytes, { timeoutMs: 1 }), (error: Error & { code?: string }) => {
      assert.equal(error.code, "INTERNAL_ERROR");
      assert.equal(error.message, REJECTION_MESSAGES.INTERNAL_ERROR);
      return true;
    });
  });

  it("hands the bytes over to the worker, so none stay behind", async () => {
    const bytes = makeSample().bytes;
    const parsed = await readInWorker(bytes);
    assert.ok(parsed.rows.length > 100);
    assert.equal(bytes.byteLength, 0, "the main thread's copy is gone");
  });

  it("refuses a second upload while one is being read", async () => {
    const unlocked = await session();
    const first = firstUpload(unlocked, makeSample().bytes, TODAY);
    await assert.rejects(readInWorker(makeSample().bytes), ReaderBusy);
    assert.deepEqual(await firstUpload(unlocked, makeSample().bytes, TODAY), { ok: false, code: "BUSY", rows: [], rowCount: 0 });
    assert.equal((await first).ok, true);
  });

  it("writes no new file to the temp folder or the data folder during an import", async () => {
    const scratch = mkdtempSync(join(tmpdir(), "pf-tmp-"));
    const before = process.env.TMPDIR;
    process.env.TMPDIR = scratch;
    try {
      const unlocked = await session();
      const dataBefore = readdirSync(home.files.folder).sort();
      const seen = new Set<string>();
      const watch = setInterval(() => {
        for (const name of readdirSync(scratch)) seen.add(`tmp/${name}`);
        for (const name of readdirSync(home.files.folder)) if (!dataBefore.includes(name)) seen.add(`data/${name}`);
      }, 1);
      const result = await firstUpload(unlocked, makeSample().bytes, TODAY);
      clearInterval(watch);
      assert.equal(result.ok, true);
      // SQLite's own journal beside the database is the only file that may come and go.
      const unexpected = [...seen].filter((name) => !/^data\/finance\.db-(journal|wal|shm)$/.test(name));
      assert.deepEqual(unexpected, []);
      assert.deepEqual(readdirSync(scratch), []);
    } finally {
      if (before === undefined) delete process.env.TMPDIR;
      else process.env.TMPDIR = before;
      rmSync(scratch, { recursive: true, force: true });
    }
  });

  it("never writes a file from the import or upload code", () => {
    for (const file of ["src/lib/import/read-in-worker.ts", "src/lib/import/parse-worker.ts", "src/lib/import/upload.ts", "src/app/api/upload/route.ts", "src/app/api/update/upload/route.ts"]) {
      assert.doesNotMatch(readFileSync(file, "utf8"), /writeFile|createWriteStream|mkdtemp|appendFile|openSync|tmpdir/, file);
    }
  });

  it("starts the worker with no environment and the set limits", () => {
    const text = readFileSync("src/lib/import/read-in-worker.ts", "utf8");
    assert.match(text, /maxOldGenerationSizeMb: 768/);
    assert.match(text, /maxYoungGenerationSizeMb: 64/);
    assert.match(text, /stackSizeMb: 4/);
    assert.match(text, /WORKER_TIMEOUT_MS = 60_000/);
    assert.match(text, /env: \{\}/);
    assert.match(text, /argv: \[\]/);
    assert.match(text, /transferList/);
    // The worker only parses: no database, no session.
    const imports = readFileSync("src/lib/import/parse-worker.ts", "utf8").match(/^import .*$/gm) ?? [];
    assert.deepEqual(imports.map((line) => line.replace(/^.* from /, "")), ['"node:worker_threads";', '"./errors.ts";', '"./parse-export.ts";', '"./xlsx-reader.ts";']);
  });
});

describe("refusals (AC-18)", () => {
  it("shows ALREADY_IMPORTED only on the first-upload route", async () => {
    const unlocked = await session();
    assert.equal((await firstUpload(unlocked, makeSample().bytes, TODAY)).ok, true);
    const again = await firstUpload(unlocked, makeSample().bytes, TODAY);
    assert.equal(again.ok === false && again.code, "ALREADY_IMPORTED");
  });

  it("says the same file matches on update, with nothing waiting", async () => {
    const unlocked = await session();
    const sample = makeSample();
    assert.equal((await firstUpload(unlocked, sample.bytes, TODAY)).ok, true);
    answerSetup(unlocked.db);
    acceptSummary(unlocked.db, dataVersion(unlocked.db));
    assert.deepEqual(await updateUpload(unlocked, makeSample().bytes, TODAY), { ok: true, same: true });
    assert.equal(unlocked.pending, null);
  });

  it("gives row refusals as row numbers only, and fixed codes", async () => {
    const unlocked = await session();
    const bad = workbook([row(), row({ inr: "not an amount" }), row({ inr: "nor this" }), row({ inr: "nor this one" })]);
    const result = await firstUpload(unlocked, bad, TODAY);
    assert.deepEqual(result, { ok: false, code: "BAD_AMOUNT", rows: [3, 4], rowCount: 3 });
  });
});

describe("first-time flow (AC-19, condition 56)", () => {
  it("runs upload, setup and summary in order, and the summary has every line", async () => {
    const unlocked = await session();
    const db = unlocked.db;
    const sample = makeSample();
    assert.equal((await firstUpload(unlocked, sample.bytes, TODAY)).ok, true);
    assert.equal(firstTimeStep(db), "setup");
    answerSetup(db);
    assert.equal(firstTimeStep(db), "summary");
    const summary = summaryData(db, TODAY);
    assert.equal(summary.rows, sample.rows.length);
    assert.deepEqual(summary.groups.map((group) => group.group), ["Bank"]);
    const rows = readRows(db);
    assert.equal(summary.unmatchedTransfers, pairTransfers(rows).unmatchedRows.length);
    assert.equal(summary.futureRows, rows.filter((item) => isFutureDated(item, TODAY)).length);
    assert.equal(summary.netWorth, netWorth(rows, TODAY, TODAY));
    assert.equal(summary.groups[0]?.accounts, findSetupOptions(rows).accounts.length);
    assert.deepEqual(acceptSummary(db, summary.version), { ok: true });
    assert.equal(firstTimeStep(db), "shell");
    assert.equal(dataState(db).note, "imported");
  });

  it("refuses Start over once the summary is confirmed (S3-14), and allows it before", async () => {
    const unlocked = await session();
    assert.deepEqual(saveFirstRows(unlocked.db, rowsFor(ALL_ACCOUNTS), TODAY).ok, true);
    assert.deepEqual(startOver(unlocked.db, dataVersion(unlocked.db)), { ok: true });
    assert.equal(firstTimeStep(unlocked.db), "upload");
    toShell(unlocked.db, rowsFor(ALL_ACCOUNTS));
    assert.deepEqual(startOver(unlocked.db, dataVersion(unlocked.db)), { ok: false, code: "CONFIRMED" });
    assert.equal(firstTimeStep(unlocked.db), "shell");
  });

  it("refuses any save whose data version is stale", async () => {
    const unlocked = await session();
    const db = unlocked.db;
    saveFirstRows(db, rowsFor(ALL_ACCOUNTS), TODAY);
    answerSetup(db);
    const current = dataVersion(db);
    assert.deepEqual(acceptSummary(db, current + 1), { ok: false, code: "STALE" });
    assert.deepEqual(acceptSummary(db, null), { ok: false, code: "STALE" });
    assert.deepEqual(startOver(db, current - 1), { ok: false, code: "STALE" });
    assert.deepEqual(acceptSummary(db, current), { ok: true });
    // The page that confirmed is now stale too.
    assert.deepEqual(acceptSummary(db, current), { ok: false, code: "WRONG_STEP" });

    // A second window's review can't be confirmed after the first has saved.
    const first = buildPending(db, rowsFor(ALL_ACCOUNTS.slice(0, 3)), TODAY);
    const second = buildPending(db, rowsFor(ALL_ACCOUNTS.slice(0, 2)), TODAY);
    assert.deepEqual(replaceData(db, first, { version: first.version, ticked: true, groups: [] }, TODAY), { ok: true });
    assert.deepEqual(replaceData(db, second, { version: second.version, ticked: true, groups: [] }, TODAY), { ok: false, code: "STALE" });
    assert.deepEqual(undoUpdate(db, second.version), { ok: false, code: "STALE" });
  });
});

describe("update review (AC-20, condition 56)", () => {
  it("lists new, changed and removed rows, net worth, new accounts and new income categories", async () => {
    const unlocked = await session();
    const current = rowsFor(ALL_ACCOUNTS);
    toShell(unlocked.db, current);
    const next = current.map((item) => ({ ...item }));
    (next[0] as ImportRow).amountPaise = 12_345;
    next.splice(1, 1);
    next.push(made("Made-up New Account", { rowNumber: 99, occurredAt: "2024-04-20T10:00:00" }));
    next.push(made("Made-up Bank", { rowNumber: 100, occurredAt: "2024-04-21T10:00:00", type: "Income", category: "Made-up Side Job", amountPaise: 7_000 }));
    const { review } = buildPending(unlocked.db, next, TODAY);
    assert.deepEqual([review.counts.added, review.counts.changed, review.counts.removed], [2, 1, 1]);
    assert.equal(review.lists.changed[0]?.wasPaise, 10_000);
    assert.equal(review.lists.changed[0]?.amountPaise, 12_345);
    assert.deepEqual(review.newAccounts.map((account) => account.name), ["Made-up New Account"]);
    assert.deepEqual(review.newCategories, { income: [{ name: "Made-up Side Job", subcategories: [] }], expense: [] });
    assert.notEqual(review.netWorthNew, review.netWorthOld);
    assert.equal(review.warning, null);
  });

  it("works out 'most accounts missing' itself, above half only (ruling 1)", async () => {
    const unlocked = await session();
    toShell(unlocked.db, rowsFor(ALL_ACCOUNTS));
    const half = buildPending(unlocked.db, rowsFor(ALL_ACCOUNTS.slice(0, 2)), TODAY).review.warning;
    assert.equal(half?.mostAccountsMissing ?? false, false);
    const most = buildPending(unlocked.db, rowsFor(ALL_ACCOUNTS.slice(0, 1)), TODAY).review.warning;
    assert.equal(most?.mostAccountsMissing, true);
    assert.ok(most?.fewerRows);
  });

  it("warns when the file starts later or ends earlier", async () => {
    const unlocked = await session();
    toShell(unlocked.db, rowsFor(ALL_ACCOUNTS));
    const later = buildPending(unlocked.db, rowsFor(ALL_ACCOUNTS, ["2024-02", "2024-03", "2024-04", "2024-05"]), TODAY).review.warning;
    assert.deepEqual(later?.startsLater, { file: "2024-02", data: "2024-01" });
    const earlier = buildPending(unlocked.db, rowsFor(ALL_ACCOUNTS, ["2023-12", "2024-01", "2024-02", "2024-03"]), TODAY).review.warning;
    assert.deepEqual(earlier?.endsEarlier, { file: "2024-03", data: "2024-04" });
  });

  it("refuses a replace without the tick when a warning applied", async () => {
    const unlocked = await session();
    toShell(unlocked.db, rowsFor(ALL_ACCOUNTS));
    const pending = buildPending(unlocked.db, rowsFor(ALL_ACCOUNTS.slice(0, 1)), TODAY);
    assert.ok(pending.review.warning);
    assert.deepEqual(replaceData(unlocked.db, pending, { version: pending.version, ticked: false, groups: [] }, TODAY), { ok: false, code: "NEED_TICK" });
    assert.equal(dataState(unlocked.db).undoDate, null, "nothing changed");
    assert.deepEqual(replaceData(unlocked.db, pending, { version: pending.version, ticked: true, groups: [] }, TODAY), { ok: true });
  });

  it("throws the waiting file away on lock", async () => {
    const unlocked = await session();
    toShell(unlocked.db, rowsFor(ALL_ACCOUNTS));
    unlocked.pending = buildPending(unlocked.db, rowsFor(ALL_ACCOUNTS.slice(0, 3)), TODAY);
    await lock("idle");
    assert.equal(unlocked.pending, null);
    assert.equal(sessionStore().lostUpload, true);
  });
});

describe("replace and undo (AC-21, AC-22, AC-24, conditions 36, 55, 57)", () => {
  it("removes a removed account's name from the live tables, keeps it only in the undo copy, and Undo brings it back", async () => {
    const unlocked = await session();
    const db = unlocked.db;
    toShell(db, rowsFor(ALL_ACCOUNTS));
    const pending = buildPending(db, rowsFor(ALL_ACCOUNTS.slice(0, 3)), TODAY);
    assert.deepEqual([pending.review.removedAccounts, pending.review.removedCategories], [1, 0]);
    assert.deepEqual(replaceData(db, pending, { version: pending.version, ticked: true, groups: [] }, TODAY), { ok: true });

    const live = ["import_rows", "setup_accounts", "setup_groups", "setup_categories", "setup_saved"];
    const holds = (table: string) => JSON.stringify(db.prepare(`SELECT * FROM ${table}`).all()).includes(MARKER);
    for (const table of live) assert.equal(holds(table), false, table);
    assert.equal(holds("undo_setup_accounts"), true);
    assert.equal(holds("undo_import_rows"), true);
    assert.equal(dataState(db).note, "updated");
    assert.equal(dataState(db).undoDate, TODAY);

    assert.deepEqual(undoUpdate(db, dataVersion(db) - 1), { ok: false, code: "STALE" });
    assert.deepEqual(undoUpdate(db, dataVersion(db)), { ok: true });
    assert.equal(holds("setup_accounts"), true);
    assert.equal(holds("import_rows"), true);
    assert.equal(holds("undo_setup_accounts"), false);
    assert.equal(dataState(db).note, "undone");
    assert.deepEqual(undoUpdate(db, dataVersion(db)), { ok: false, code: "NOTHING_TO_UNDO" });
  });

  it("keeps the undo copy encrypted: the raw database and side files never hold the marker name", async () => {
    const unlocked = await session();
    const db = unlocked.db;
    toShell(db, rowsFor(ALL_ACCOUNTS));
    const pending = buildPending(db, rowsFor(ALL_ACCOUNTS.slice(0, 3)), TODAY);
    assert.deepEqual(replaceData(db, pending, { version: pending.version, ticked: true, groups: [] }, TODAY), { ok: true });

    const check = () => {
      const files = readdirSync(home.files.folder).map((name) => join(home.files.folder, name));
      assert.ok(files.includes(home.files.database));
      for (const file of files) {
        const raw = readFileSync(file);
        assert.equal(raw.includes(Buffer.from(MARKER, "utf8")), false, file);
        assert.equal(raw.includes(Buffer.from(MARKER, "utf16le")), false, file);
        assert.equal(raw.includes(Buffer.from("Zebra Marker", "utf8")), false, file);
      }
    };
    check();
    await lock(null);
    check();
  });

  it("saves new account groups with the replace, and new income and expense categories stay Not grouped", async () => {
    const unlocked = await session();
    const db = unlocked.db;
    toShell(db, rowsFor(ALL_ACCOUNTS));
    const next = rowsFor([...ALL_ACCOUNTS, "Made-up Fund"]);
    next.push(made("Made-up Bank", { rowNumber: 500, occurredAt: "2024-04-25T10:00:00", type: "Income", category: "Made-up Dividends", amountPaise: 1_000 }));
    const pending = buildPending(db, next, TODAY);
    assert.deepEqual(pending.review.newCategories.income.map((category) => category.name), ["Made-up Dividends"]);
    assert.deepEqual(replaceData(db, pending, { version: pending.version, ticked: false, groups: ["Nonsense"] }, TODAY), { ok: false, code: "BAD_ANSWERS" });
    assert.deepEqual(replaceData(db, pending, { version: pending.version, ticked: false, groups: [] }, TODAY), { ok: false, code: "BAD_ANSWERS" });
    assert.deepEqual(replaceData(db, pending, { version: pending.version, ticked: false, groups: ["Investments"] }, TODAY), { ok: true });
    assert.deepEqual(db.prepare("SELECT account_group FROM setup_accounts WHERE name = ?").get("Made-up Fund"), { account_group: "Investments" });
    assert.equal(db.prepare("SELECT 1 FROM setup_categories WHERE name = ?").get("Made-up Dividends"), undefined);
  });

  it("runs the amounts limit on replace and on the first import (AC-24)", async () => {
    const unlocked = await session();
    const huge = [made("Made-up Bank", { amountPaise: Number.MAX_SAFE_INTEGER }), made("Made-up Bank", { rowNumber: 3, amountPaise: Number.MAX_SAFE_INTEGER })];
    assert.deepEqual(saveFirstRows(unlocked.db, huge, TODAY), { ok: false, code: "AMOUNTS_TOO_LARGE" });
    toShell(unlocked.db, rowsFor(ALL_ACCOUNTS));
    const pending = { rows: huge, version: dataVersion(unlocked.db), review: buildPending(unlocked.db, rowsFor(ALL_ACCOUNTS.slice(0, 3)), TODAY).review };
    assert.deepEqual(replaceData(unlocked.db, pending, { version: pending.version, ticked: true, groups: [] }, TODAY), { ok: false, code: "AMOUNTS_TOO_LARGE" });
    assert.equal(dataState(unlocked.db).undoDate, null);
  });
});

describe("source rules (conditions 55, 57, AC-3, AC-24)", () => {
  const files = readdirSync("src", { recursive: true }).map(String).filter((name) => /\.(ts|tsx)$/.test(name));

  it("never copies the database with serialize(, VACUUM INTO, ATTACH or .backup(", () => {
    for (const file of files) {
      const text = readFileSync(join("src", file), "utf8");
      assert.doesNotMatch(text, /serialize\(|VACUUM\s+INTO|\bATTACH\b|\.backup\(/i, file);
    }
  });

  it("checks the session in every route but the three open ones, inside one error boundary", () => {
    const open = new Set(["password/create/route.ts", "login/route.ts", "delete/finish/route.ts", "status/route.ts"]);
    for (const file of readdirSync("src/app/api", { recursive: true }).map(String).filter((name) => name.endsWith("route.ts"))) {
      if (open.has(file)) continue;
      const text = readFileSync(join("src/app/api", file), "utf8");
      assert.match(text, /requireSession\(request|withSessionForm\(request/, file);
      assert.match(text, /catch \{|withSessionForm\(/, file);
      assert.doesNotMatch(text, /console\./, file);
    }
  });

  it("takes today from the server, never from a request", () => {
    for (const file of readdirSync("src/app/api", { recursive: true }).map(String).filter((name) => name.endsWith("route.ts"))) {
      const text = readFileSync(join("src/app/api", file), "utf8");
      assert.doesNotMatch(text, /field\(form, "today"\)|"today"/, file);
    }
  });
});

describe("start-up screen still comes from the server (AC-11)", () => {
  it("stays on setup after the first upload, and on the summary until it's confirmed", async () => {
    const unlocked = await session();
    assert.equal(firstTimeStep(unlocked.db), "upload");
    saveFirstRows(unlocked.db, rowsFor(ALL_ACCOUNTS), TODAY);
    assert.equal(firstTimeStep(unlocked.db), "setup");
    answerSetup(unlocked.db);
    assert.equal(firstTimeStep(unlocked.db), "summary");
    assert.deepEqual(acceptSummary(unlocked.db, dataVersion(unlocked.db) + 5), { ok: false, code: "STALE" });
    assert.equal(firstTimeStep(unlocked.db), "summary");
  });

  it("has one route that saves setup answers, screen 5's and screen 13's", () => {
    assert.equal(existsSync("src/app/api/setup/route.ts"), true);
  });
});

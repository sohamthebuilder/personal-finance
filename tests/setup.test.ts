import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { importExport } from "../src/lib/import/import-export.ts";
import { ensureSchema, readRows, writeRows } from "../src/lib/import/store.ts";
import { periodMetrics } from "../src/lib/metrics/metrics.ts";
import { ACCOUNTS, makeSample, SAMPLE_SETUP } from "../src/lib/sample/sample-export.ts";
import { ACCOUNT_GROUPS, EMPTY_SETUP, findSetupOptions, groupOf, type SetupAnswers, setupStatus, UNGROUPED } from "../src/lib/setup/setup.ts";
import { loadSetup, saveSetup, SETUP_REFUSALS, type SetupRefusal } from "../src/lib/setup/store.ts";
import { suggestAccountGroup, suggestCategoryRole } from "../src/lib/setup/suggestions.ts";
import { row, withDb, workbook } from "./support/import-helpers.ts";
import { rowsFrom } from "./support/metrics-helpers.ts";

const TODAY = "2026-06-15";
const ALL = { from: "2000-01-01", to: "2099-12-31" };
const ANSWERS: SetupAnswers = { ...SAMPLE_SETUP, accountGroups: [...SAMPLE_SETUP.accountGroups] };
type Db = Parameters<Parameters<typeof withDb>[0]>[0];

async function importSample(db: Db): Promise<void> {
  const result = await importExport(makeSample().bytes, db, { today: TODAY });
  assert.equal(result.ok, true);
}

function assertRefused(db: Db, answers: SetupAnswers, code: SetupRefusal): void {
  const before = loadSetup(db);
  const result = saveSetup(db, answers);
  assert.deepEqual(result, { ok: false, code, message: SETUP_REFUSALS[code] });
  assert.deepEqual(loadSetup(db), before);
}

describe("setup options", () => {
  it("AC-1: lists every account and every income category, from the saved rows", async () => {
    await withDb(async (db) => {
      await importSample(db);
      const options = findSetupOptions(readRows(db));
      assert.deepEqual(options.accounts, Object.values(ACCOUNTS).sort());
      assert.deepEqual(options.incomeCategories, ["Made-up Consulting", "Made-up Dividends", "Made-up Interest", "Made-up Loan", "Made-up Market Moves", "Made-up Salary"]);
    });
  });

  it("AC-1: an account named only as a transfer's other side is listed, and a category only on spending isn't", async () => {
    const rows = await rowsFrom([
      { account: "One Side", secondAccount: "Other Side", type: "Transfer-Out" },
      { account: "One Side", secondAccount: "Not On A Transfer", category: "Spending Only", type: "Exp." },
    ]);
    assert.deepEqual(findSetupOptions(rows), { accounts: ["One Side", "Other Side"], incomeCategories: [] });
  });
});

describe("saving setup", () => {
  it("AC-2: answers can be saved and read back", async () => {
    await withDb(async (db) => {
      await importSample(db);
      assert.deepEqual(saveSetup(db, ANSWERS), { ok: true });
      const setup = loadSetup(db);
      assert.equal(setup.saved, true);
      assert.deepEqual([...setup.groups].sort(), ANSWERS.accountGroups.map(({ account, group }) => [account, group]).sort());
      assert.deepEqual([...setup.returnCategories].sort(), [...ANSWERS.returnCategories].sort());
      assert.deepEqual([...setup.loanCategories], [...ANSWERS.loanCategories]);
      assert.equal(setup.reimbursementAccount, ACCOUNTS.reimbursement);
      assert.equal(setup.trendsStartDate, "2024-01-01");
    });
  });

  it("AC-2: every one of the six groups is accepted, and none for reimbursement and date is fine", async () => {
    await withDb(async (db) => {
      await importSample(db);
      assert.equal(ACCOUNT_GROUPS.length, 6);
      for (const group of ACCOUNT_GROUPS) {
        const answers = { ...ANSWERS, accountGroups: [{ account: ACCOUNTS.bank, group }], reimbursementAccount: null, trendsStartDate: null };
        assert.deepEqual(saveSetup(db, answers), { ok: true }, group);
        assert.equal(loadSetup(db).groups.get(ACCOUNTS.bank), group);
        assert.equal(loadSetup(db).reimbursementAccount, null);
        assert.equal(loadSetup(db).trendsStartDate, null);
      }
    });
  });

  it("AC-3: an account with no saved group reads as Ungrouped", async () => {
    await withDb(async (db) => {
      await importSample(db);
      saveSetup(db, { ...ANSWERS, accountGroups: ANSWERS.accountGroups.filter(({ account }) => account !== ACCOUNTS.wallet) });
      assert.equal(groupOf(loadSetup(db), ACCOUNTS.wallet), UNGROUPED);
      assert.equal(groupOf(loadSetup(db), ACCOUNTS.bank), "Bank");
      assert.equal(groupOf(EMPTY_SETUP, "__proto__"), UNGROUPED);
    });
  });

  it("AC-4: bad answers are refused with fixed text, nothing is saved, and no name is quoted", async () => {
    await withDb(async (db) => {
      await importSample(db);
      saveSetup(db, ANSWERS);
      const secret = "NAME-NOT-IN-DATA";
      const bank = { account: ACCOUNTS.bank, group: "Bank" };
      const cases: Array<[Partial<SetupAnswers>, SetupRefusal]> = [
        [{ accountGroups: [{ account: ACCOUNTS.bank, group: secret }] }, "UNKNOWN_GROUP"],
        [{ accountGroups: [{ account: ACCOUNTS.bank, group: "__proto__" }] }, "UNKNOWN_GROUP"],
        [{ accountGroups: [{ account: secret, group: "Bank" }] }, "UNKNOWN_ACCOUNT"],
        [{ reimbursementAccount: secret }, "UNKNOWN_ACCOUNT"],
        [{ accountGroups: [bank, { ...bank, group: "Cards" }] }, "REPEATED_ACCOUNT"],
        [{ returnCategories: [secret] }, "UNKNOWN_CATEGORY"],
        [{ loanCategories: [secret] }, "UNKNOWN_CATEGORY"],
        [{ returnCategories: ["Made-up Fun"] }, "UNKNOWN_CATEGORY"],
        [{ returnCategories: ["Made-up Loan"] }, "CATEGORY_IN_BOTH"],
        [{ trendsStartDate: "2024-02-30" }, "BAD_DATE"],
        [{ trendsStartDate: "01/02/2024" }, "BAD_DATE"],
        [{ trendsStartDate: 20240101 as unknown as string }, "BAD_DATE"],
      ];
      for (const [change, code] of cases) {
        assertRefused(db, { ...ANSWERS, ...change }, code);
        assert.ok(!SETUP_REFUSALS[code].includes(secret));
      }
    });
  });

  it("AC-4: answers of the wrong shape are refused, not crashed on", async () => {
    await withDb(async (db) => {
      await importSample(db);
      const junk: unknown[] = [null, undefined, "text", 7, {}, { ...ANSWERS, accountGroups: "x" }, { ...ANSWERS, accountGroups: [null] },
        { ...ANSWERS, accountGroups: [{ account: 1, group: 2 }] }, { ...ANSWERS, returnCategories: [1] }, { ...ANSWERS, loanCategories: null },
        { ...ANSWERS, reimbursementAccount: 5 }];
      for (const answers of junk) assertRefused(db, answers as SetupAnswers, "BAD_ANSWERS");
    });
  });

  it("refuses to save before any import, and reads as not saved", async () => {
    await withDb(async (db) => {
      assertRefused(db, { ...ANSWERS, accountGroups: [] }, "NO_DATA");
      assert.equal(loadSetup(db).saved, false);
    });
  });

  it("AC-7: changing an answer changes the results at once, and the rows stay identical", async () => {
    await withDb(async (db) => {
      await importSample(db);
      saveSetup(db, ANSWERS);
      const rowsBefore = readRows(db);
      const before = periodMetrics(rowsBefore, loadSetup(db), ALL, TODAY);

      saveSetup(db, { ...ANSWERS, loanCategories: [] });
      const rowsAfter = readRows(db);
      const after = periodMetrics(rowsAfter, loadSetup(db), ALL, TODAY);
      assert.deepEqual(rowsAfter, rowsBefore);
      assert.equal(after.earned - before.earned, 300_000_00);
      assert.equal(after.loans, 0);
    });
  });

  it("AC-7: setup is kept apart from the rows, so clearing the rows leaves it", async () => {
    await withDb(async (db) => {
      await importSample(db);
      saveSetup(db, ANSWERS);
      db.exec("DELETE FROM import_rows");
      assert.equal(loadSetup(db).groups.get(ACCOUNTS.bank), "Bank");
    });
  });

  it("AC-8: answers are unreadable on disk, including the journal mid-save", async () => {
    const marker = "MADEUPSETUPMARKER";
    const needles = [Buffer.from(marker, "utf8"), Buffer.from(marker, "utf16le")];
    await withDb(async (db, folder) => {
      const contains = (): string[] => readdirSync(folder).filter((file) => {
        const bytes = readFileSync(join(folder, file));
        return needles.some((needle) => bytes.includes(needle));
      });
      await importExport(workbook([row({ account: marker, category: marker, type: "Income" })]), db, { today: TODAY });
      const answers: SetupAnswers = {
        accountGroups: [{ account: marker, group: "Bank" }], returnCategories: [marker], loanCategories: [],
        reimbursementAccount: marker, trendsStartDate: null,
      };
      assert.deepEqual(saveSetup(db, answers), { ok: true });

      let during: string[] = [];
      let seenJournal = false;
      db.transaction(() => {
        db.prepare("UPDATE setup_accounts SET account_group = 'Cards'").run();
        db.prepare("UPDATE setup_choices SET trends_start_date = '2024-01-01'").run();
        db.pragma("cache_spill = 1");
        db.pragma("cache_size = 1");
        db.prepare("INSERT INTO setup_income_categories (name, role) VALUES (?, 'earned')").run(`${marker}${"x".repeat(50_000)}`);
        seenJournal = readdirSync(folder).some((file) => file.endsWith("-journal"));
        during = contains();
      })();
      assert.ok(seenJournal, "the save must have a journal to scan");
      assert.deepEqual(during, []);
      db.close();
      assert.deepEqual(contains(), []);
    });
  });

  it("AC-8: names like __proto__ are plain data", async () => {
    await withDb(async (db) => {
      await importExport(workbook([row({ account: "__proto__", category: "constructor", type: "Income" })]), db, { today: TODAY });
      const result = saveSetup(db, {
        accountGroups: [{ account: "__proto__", group: "Bank" }], returnCategories: ["constructor"], loanCategories: [],
        reimbursementAccount: "__proto__", trendsStartDate: null,
      });
      assert.deepEqual(result, { ok: true });
      const setup = loadSetup(db);
      assert.equal(setup.groups.get("__proto__"), "Bank");
      assert.equal(setup.returnCategories.has("constructor"), true);
      assert.equal(({} as Record<string, unknown>).polluted, undefined);
    });
  });

  it("a name with SQL in it is stored as plain text", async () => {
    const name = `x'); DROP TABLE setup_accounts; --`;
    await withDb(async (db) => {
      await importExport(workbook([row({ account: name, type: "Income" })]), db, { today: TODAY });
      assert.deepEqual(saveSetup(db, { ...ANSWERS, accountGroups: [{ account: name, group: "Bank" }], returnCategories: [], loanCategories: [], reimbursementAccount: name }), { ok: true });
      assert.equal(loadSetup(db).groups.get(name), "Bank");
    });
  });
});

describe("setup status", () => {
  it("AC-6: not done until saved, then done, then new names show as unreviewed", async () => {
    await withDb(async (db) => {
      await importSample(db);
      const notYet = setupStatus(readRows(db), loadSetup(db));
      assert.equal(notYet.done, false);
      assert.equal(notYet.unreviewedAccounts.length, Object.keys(ACCOUNTS).length);
      assert.equal(notYet.unreviewedIncomeCategories.length, 6);

      saveSetup(db, ANSWERS);
      assert.deepEqual(setupStatus(readRows(db), loadSetup(db)), { done: true, unreviewedAccounts: [], unreviewedIncomeCategories: [] });

      ensureSchema(db);
      writeRows(db, await rowsFrom([{ account: "Brand New Account", category: "Brand New Income", type: "Income" }]));
      assert.deepEqual(setupStatus(readRows(db), loadSetup(db)), {
        done: false, unreviewedAccounts: ["Brand New Account"], unreviewedIncomeCategories: ["Brand New Income"],
      });
    });
  });

  it("AC-6: a new income category alone reopens setup", async () => {
    await withDb(async (db) => {
      await importSample(db);
      saveSetup(db, ANSWERS);
      writeRows(db, await rowsFrom([{ account: ACCOUNTS.bank, category: "Brand New Income", type: "Income" }]));
      assert.deepEqual(setupStatus(readRows(db), loadSetup(db)), {
        done: false, unreviewedAccounts: [], unreviewedIncomeCategories: ["Brand New Income"],
      });
    });
  });

  it("AC-6: setup that was never saved isn't done, even with nothing left to review", () => {
    assert.deepEqual(setupStatus([], EMPTY_SETUP), { done: false, unreviewedAccounts: [], unreviewedIncomeCategories: [] });
  });

  it("question 3: a new income category counts as Earned while it waits for review", async () => {
    await withDb(async (db) => {
      await importSample(db);
      saveSetup(db, ANSWERS);
      const before = periodMetrics(readRows(db), loadSetup(db), ALL, TODAY).earned;
      writeRows(db, await rowsFrom([{ period: "02/01/2024, 10:00:00", category: "Brand New Income", inr: 7, type: "Income" }]));
      assert.equal(periodMetrics(readRows(db), loadSetup(db), ALL, TODAY).earned - before, 7_00);
    });
  });

  it("AC-6: leaving an account Ungrouped keeps setup open", async () => {
    await withDb(async (db) => {
      await importSample(db);
      saveSetup(db, { ...ANSWERS, accountGroups: ANSWERS.accountGroups.filter(({ account }) => account !== ACCOUNTS.usd) });
      const status = setupStatus(readRows(db), loadSetup(db));
      assert.deepEqual([status.done, status.unreviewedAccounts], [false, [ACCOUNTS.usd]]);
    });
  });

  it("with no setup saved, the metrics still work and count all income as Earned", async () => {
    const rows = await rowsFrom([{ category: "Market", inr: 5, type: "Income" }]);
    assert.equal(periodMetrics(rows, EMPTY_SETUP, ALL, TODAY).earned, 5_00);
    assert.equal(setupStatus(rows, EMPTY_SETUP).done, false);
  });
});

describe("suggestions", () => {
  it("AC-5: generic keywords suggest a group or role", () => {
    assert.equal(suggestAccountGroup(ACCOUNTS.card), "Cards");
    assert.equal(suggestAccountGroup(ACCOUNTS.wallet), "Wallets");
    assert.equal(suggestAccountGroup(ACCOUNTS.bank), "Bank");
    assert.equal(suggestAccountGroup(ACCOUNTS.broker), "Investments");
    assert.equal(suggestAccountGroup(ACCOUNTS.friends), "Money with others");
    assert.equal(suggestAccountGroup(ACCOUNTS.business), "Business");
    assert.equal(suggestCategoryRole("Made-up Dividends"), "returns");
    assert.equal(suggestCategoryRole("Made-up Market Moves"), "returns");
    assert.equal(suggestCategoryRole("Made-up Interest"), "returns");
    assert.equal(suggestCategoryRole("Made-up Loan"), "loans");
  });

  it("AC-5: no keyword means no suggestion, and part of a word doesn't match", () => {
    for (const name of ["Discard", "Cardamom", "Sample USD Account", "", "__proto__", "constructor", "toString"]) {
      assert.equal(suggestAccountGroup(name), undefined, name);
      assert.equal(suggestCategoryRole(name), undefined, name);
    }
    assert.equal(suggestCategoryRole("Made-up Salary"), undefined);
    assert.equal(suggestCategoryRole("Supermarket"), undefined);
  });

  it("AC-5: a suggestion is never saved or used until accepted", async () => {
    await withDb(async (db) => {
      await importSample(db);
      suggestAccountGroup(ACCOUNTS.card);
      suggestCategoryRole("Made-up Loan");
      assert.equal(loadSetup(db).saved, false);
      saveSetup(db, { ...ANSWERS, accountGroups: [], returnCategories: [], loanCategories: [] });
      const setup = loadSetup(db);
      assert.equal(groupOf(setup, ACCOUNTS.card), UNGROUPED);
      assert.equal(periodMetrics(readRows(db), setup, ALL, TODAY).loans, 0);
    });
    for (const file of ["src/lib/setup/store.ts", "src/lib/metrics/metrics.ts"]) {
      assert.doesNotMatch(readFileSync(file, "utf8"), /suggestions/, file);
    }
  });
});

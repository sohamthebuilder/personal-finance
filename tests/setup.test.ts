import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { dataVersion } from "../src/lib/data/state.ts";
import { setupPage } from "../src/lib/data/update.ts";
import { importExport } from "../src/lib/import/import-export.ts";
import { ensureSchema, readRows, writeRows } from "../src/lib/import/store.ts";
import { periodMetrics } from "../src/lib/metrics/metrics.ts";
import { ACCOUNTS, makeSample, SAMPLE_SETUP } from "../src/lib/sample/sample-export.ts";
import { confirmSummary } from "../src/lib/setup/progress.ts";
import { ACCOUNT_GROUPS, categoryGroupOf, EMPTY_SETUP, findSetupOptions, groupOf, NOT_GROUPED, type SetupAnswers, setupStatus, UNGROUPED } from "../src/lib/setup/setup.ts";
import { loadSetup, SETUP_REFUSALS, type SetupRefusal } from "../src/lib/setup/store.ts";
import { suggestAccountGroup } from "../src/lib/setup/suggestions.ts";
import { row, withDb, workbook } from "./support/import-helpers.ts";
import { rowsFrom } from "./support/metrics-helpers.ts";
import { answersFor, saveAnswers } from "./support/setup-helpers.ts";

const TODAY = "2026-06-15";
const ALL = { from: "2000-01-01", to: "2099-12-31" };
type Db = Parameters<Parameters<typeof withDb>[0]>[0];

async function importSample(db: Db): Promise<void> {
  const result = await importExport(makeSample().bytes, db, { today: TODAY });
  assert.equal(result.ok, true);
}

const sampleAnswers = (db: Db): SetupAnswers =>
  answersFor(db, { accounts: SAMPLE_SETUP.accountGroups, income: SAMPLE_SETUP.incomeGroups, expense: SAMPLE_SETUP.expenseGroups });

function assertRefused(db: Db, answers: SetupAnswers, code: SetupRefusal): void {
  const before = loadSetup(db);
  const version = dataVersion(db);
  assert.deepEqual(saveAnswers(db, answers), { ok: false, code });
  assert.deepEqual(loadSetup(db), before);
  assert.equal(dataVersion(db), version);
}

describe("setup options", () => {
  it("AC-1: lists every account, and every income and expense category with its subcategories", async () => {
    await withDb(async (db) => {
      await importSample(db);
      const options = findSetupOptions(readRows(db));
      assert.deepEqual(options.accounts, Object.values(ACCOUNTS).sort());
      assert.deepEqual(options.income.map((category) => category.name), ["Made-up Consulting", "Made-up Dividends", "Made-up Interest", "Made-up Loan", "Made-up Market Moves", "Made-up Salary"]);
      assert.ok(options.expense.some((category) => category.name === "Made-up Food" && category.subcategories.includes("Groceries")));
    });
  });

  it("AC-1: an account named only as a transfer's other side is listed; blank subcategories aren't", async () => {
    const rows = await rowsFrom([
      { account: "One Side", secondAccount: "Other Side", type: "Transfer-Out" },
      { account: "One Side", secondAccount: "Not On A Transfer", category: "Spending Only", subcategory: "", type: "Exp." },
      { account: "One Side", category: "Spending Only", subcategory: "Lunch", type: "Exp." },
    ]);
    assert.deepEqual(findSetupOptions(rows), {
      accounts: ["One Side", "Other Side"],
      income: [],
      expense: [{ name: "Spending Only", subcategories: ["Lunch"] }],
    });
  });
});

describe("saving setup", () => {
  it("AC-19: answers save, read back, and move the first-time step on", async () => {
    await withDb(async (db) => {
      await importSample(db);
      const saved = saveAnswers(db, sampleAnswers(db));
      assert.equal(saved.ok, true);
      const setup = loadSetup(db);
      assert.equal(setup.saved, true);
      assert.deepEqual([...setup.groups].sort(), SAMPLE_SETUP.accountGroups.map(({ account, group }) => [account, group]).sort());
      assert.deepEqual(setup.income.names, ["Work", "Savings", "Borrowed"]);
      assert.equal(categoryGroupOf(setup, "income", "Made-up Loan"), "Borrowed");
      assert.equal(categoryGroupOf(setup, "expense", "Made-up Fun"), "Wants");
      assert.equal(categoryGroupOf(setup, "expense", "Made-up Car"), NOT_GROUPED);
    });
  });

  it("AC-19: income and expense groups are optional the first time; every account needs a group", async () => {
    await withDb(async (db) => {
      await importSample(db);
      const answers = answersFor(db, { accounts: SAMPLE_SETUP.accountGroups });
      assertRefused(db, { ...answers, accounts: answers.accounts.map((group, index) => (index === 0 ? "" : group)) }, "NEEDS_GROUP");
      assert.equal(saveAnswers(db, answers).ok, true);
      assert.deepEqual(loadSetup(db).income.names, []);
    });
  });

  it("AC-2: every one of the six groups is accepted", async () => {
    await withDb(async (db) => {
      await importSample(db);
      assert.equal(ACCOUNT_GROUPS.length, 6);
      for (const group of ACCOUNT_GROUPS) {
        assert.equal(saveAnswers(db, answersFor(db, { fallback: group })).ok, true, group);
        assert.equal(loadSetup(db).groups.get(ACCOUNTS.bank), group);
      }
    });
  });

  it("AC-23: in Settings, Ungrouped is an allowed answer and reads as Ungrouped", async () => {
    await withDb(async (db) => {
      await importSample(db);
      assert.equal(saveAnswers(db, sampleAnswers(db)).ok, true);
      confirmSummary(db);
      const answers = sampleAnswers(db);
      const wallet = findSetupOptions(readRows(db)).accounts.indexOf(ACCOUNTS.wallet);
      answers.accounts[wallet] = "";
      assert.equal(saveAnswers(db, answers).ok, true);
      assert.equal(groupOf(loadSetup(db), ACCOUNTS.wallet), UNGROUPED);
      assert.equal(groupOf(loadSetup(db), ACCOUNTS.bank), "Bank");
      assert.equal(groupOf(EMPTY_SETUP, "__proto__"), UNGROUPED);
    });
  });

  it("AC-4: bad answers are refused with fixed text, nothing is saved, and no name is quoted", async () => {
    await withDb(async (db) => {
      await importSample(db);
      saveAnswers(db, sampleAnswers(db));
      const secret = "NAME-NOT-IN-DATA";
      const good = sampleAnswers(db);
      const cases: Array<[SetupAnswers, SetupRefusal]> = [
        [{ ...good, accounts: good.accounts.map(() => secret) }, "UNKNOWN_GROUP"],
        [{ ...good, accounts: good.accounts.map(() => "__proto__") }, "UNKNOWN_GROUP"],
        [{ ...good, accounts: [...good.accounts, "Bank"] }, "BAD_ANSWERS"],
        [{ ...good, accounts: good.accounts.slice(1) }, "BAD_ANSWERS"],
        [{ ...good, income: { ...good.income, categories: good.income.categories.map(() => 7) } }, "BAD_ANSWERS"],
        [{ ...good, income: { ...good.income, categories: good.income.categories.map(() => -1) } }, "BAD_ANSWERS"],
        [{ ...good, expense: { ...good.expense, categories: good.expense.categories.slice(1) } }, "BAD_ANSWERS"],
      ];
      for (const [answers, code] of cases) {
        assertRefused(db, answers, code);
        assert.ok(!SETUP_REFUSALS[code].includes(secret));
      }
    });
  });

  it("AC-4: answers of the wrong shape are refused, not crashed on", async () => {
    await withDb(async (db) => {
      await importSample(db);
      const good = sampleAnswers(db);
      const junk: unknown[] = [null, undefined, "text", 7, {}, { ...good, accounts: "x" }, { ...good, accounts: good.accounts.map(() => 1) },
        { ...good, income: null }, { ...good, income: { names: "x", categories: [] } }, { ...good, expense: { names: [1], categories: good.expense.categories } },
        { ...good, income: { ...good.income, categories: good.income.categories.map(() => 0.5) } }, { ...good, income: { ...good.income, categories: good.income.categories.map(() => "0") } }];
      for (const answers of junk) assertRefused(db, answers as SetupAnswers, "BAD_ANSWERS");
    });
  });

  it("refuses to save before any import, and reads as not saved", async () => {
    await withDb(async (db) => {
      assertRefused(db, { accounts: [], income: { names: [], categories: [] }, expense: { names: [], categories: [] } }, "NO_DATA");
      assert.equal(loadSetup(db).saved, false);
    });
  });

  it("refuses a save whose data version is stale (condition 56)", async () => {
    await withDb(async (db) => {
      await importSample(db);
      const answers = sampleAnswers(db);
      assert.deepEqual(saveAnswers(db, answers, dataVersion(db) + 1), { ok: false, code: "STALE" });
      assert.deepEqual(saveAnswers(db, answers, null), { ok: false, code: "STALE" });
      const first = saveAnswers(db, answers);
      assert.equal(first.ok, true);
      // A second window still holding the old version is refused.
      assert.deepEqual(saveAnswers(db, answers, dataVersion(db) - 1), { ok: false, code: "STALE" });
      assert.equal(first.ok && first.version, dataVersion(db));
    });
  });

  it("AC-7: changing a group changes no number, and the rows stay identical", async () => {
    await withDb(async (db) => {
      await importSample(db);
      saveAnswers(db, sampleAnswers(db));
      const rowsBefore = readRows(db);
      const before = periodMetrics(rowsBefore, loadSetup(db), ALL, TODAY);
      saveAnswers(db, answersFor(db, { accounts: SAMPLE_SETUP.accountGroups }));
      const rowsAfter = readRows(db);
      assert.deepEqual(rowsAfter, rowsBefore);
      assert.deepEqual(periodMetrics(rowsAfter, loadSetup(db), ALL, TODAY), before);
    });
  });

  it("AC-7: setup is kept apart from the rows, so clearing the rows leaves it", async () => {
    await withDb(async (db) => {
      await importSample(db);
      saveAnswers(db, sampleAnswers(db));
      db.exec("DELETE FROM import_rows");
      assert.equal(loadSetup(db).groups.get(ACCOUNTS.bank), "Bank");
      assert.deepEqual(loadSetup(db).expense.names, ["Needs", "Wants"]);
    });
  });

  it("AC-8 and AC-28: answers and group names are unreadable on disk, including the journal mid-save", async () => {
    const marker = "MADEUPSETUPMARKER";
    const needles = [Buffer.from(marker, "utf8"), Buffer.from(marker, "utf16le")];
    await withDb(async (db, folder) => {
      const contains = (): string[] => readdirSync(folder).filter((file) => {
        const bytes = readFileSync(join(folder, file));
        return needles.some((needle) => bytes.includes(needle));
      });
      await importExport(workbook([row({ account: marker, category: marker, type: "Income" })]), db, { today: TODAY });
      const answers: SetupAnswers = { accounts: ["Bank"], income: { names: [marker], categories: [0] }, expense: { names: [], categories: [] } };
      assert.equal(saveAnswers(db, answers).ok, true);

      let during: string[] = [];
      let seenJournal = false;
      db.transaction(() => {
        db.prepare("UPDATE setup_accounts SET account_group = 'Cards'").run();
        db.pragma("cache_spill = 1");
        db.pragma("cache_size = 1");
        db.prepare("INSERT INTO setup_categories (kind, name, position) VALUES ('expense', ?, 0)").run(`${marker}${"x".repeat(50_000)}`);
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
      const result = saveAnswers(db, { accounts: ["Bank"], income: { names: ["__proto__"], categories: [0] }, expense: { names: ["constructor"], categories: [] } });
      assert.equal(result.ok, true);
      const setup = loadSetup(db);
      assert.equal(setup.groups.get("__proto__"), "Bank");
      assert.equal(categoryGroupOf(setup, "income", "constructor"), "__proto__");
      assert.equal(({} as Record<string, unknown>).polluted, undefined);
    });
  });

  it("a name with SQL in it is stored as plain text", async () => {
    const name = `x'); DROP TABLE setup_accounts; --`;
    await withDb(async (db) => {
      await importExport(workbook([row({ account: name, category: name, type: "Income" })]), db, { today: TODAY });
      assert.equal(saveAnswers(db, { accounts: ["Bank"], income: { names: [name], categories: [0] }, expense: { names: [], categories: [] } }).ok, true);
      assert.equal(loadSetup(db).groups.get(name), "Bank");
      assert.equal(categoryGroupOf(loadSetup(db), "income", name), name);
    });
  });

  it("the screens' page data lines up the saved answers with the server's lists", async () => {
    await withDb(async (db) => {
      await importSample(db);
      assert.equal(setupPage(db).firstTime, true);
      assert.ok(setupPage(db).accounts.every((account) => account.group === ""));
      saveAnswers(db, sampleAnswers(db));
      const page = setupPage(db);
      assert.equal(page.version, dataVersion(db));
      assert.equal(page.accounts.find((account) => account.name === ACCOUNTS.card)?.group, "Cards");
      assert.equal(page.income.categories.find((category) => category.name === "Made-up Salary")?.group, 0);
      assert.equal(page.expense.categories.find((category) => category.name === "Made-up Car")?.group, null);
      confirmSummary(db);
      assert.equal(setupPage(db).firstTime, false);
    });
  });
});

describe("setup status", () => {
  it("AC-6: not done until saved, then done, then a new account shows as ungrouped", async () => {
    await withDb(async (db) => {
      await importSample(db);
      const notYet = setupStatus(readRows(db), loadSetup(db));
      assert.equal(notYet.done, false);
      assert.equal(notYet.ungroupedAccounts.length, Object.keys(ACCOUNTS).length);

      saveAnswers(db, sampleAnswers(db));
      assert.deepEqual(setupStatus(readRows(db), loadSetup(db)), { done: true, ungroupedAccounts: [] });

      ensureSchema(db);
      writeRows(db, await rowsFrom([{ account: "Brand New Account", category: "Brand New Income", type: "Income" }]));
      assert.deepEqual(setupStatus(readRows(db), loadSetup(db)), { done: false, ungroupedAccounts: ["Brand New Account"] });
    });
  });

  it("AC-6: a new income or expense category doesn't reopen setup, and reads Not grouped", async () => {
    await withDb(async (db) => {
      await importSample(db);
      saveAnswers(db, sampleAnswers(db));
      writeRows(db, await rowsFrom([{ account: ACCOUNTS.bank, category: "Brand New Income", type: "Income" }]));
      assert.deepEqual(setupStatus(readRows(db), loadSetup(db)), { done: true, ungroupedAccounts: [] });
      assert.equal(categoryGroupOf(loadSetup(db), "income", "Brand New Income"), NOT_GROUPED);
    });
  });

  it("AC-6: setup that was never saved isn't done", () => {
    assert.deepEqual(setupStatus([], EMPTY_SETUP), { done: false, ungroupedAccounts: [] });
  });

  it("AC-29: a new income category counts as Earned straight away", async () => {
    await withDb(async (db) => {
      await importSample(db);
      saveAnswers(db, sampleAnswers(db));
      const before = periodMetrics(readRows(db), loadSetup(db), ALL, TODAY).earned;
      writeRows(db, await rowsFrom([{ period: "02/01/2024, 10:00:00", category: "Brand New Income", inr: 7, type: "Income" }]));
      assert.equal(periodMetrics(readRows(db), loadSetup(db), ALL, TODAY).earned - before, 7_00);
    });
  });

  it("with no setup saved, the metrics still work and count all income as Earned", async () => {
    const rows = await rowsFrom([{ category: "Market", inr: 5, type: "Income" }]);
    assert.equal(periodMetrics(rows, EMPTY_SETUP, ALL, TODAY).earned, 5_00);
    assert.equal(setupStatus(rows, EMPTY_SETUP).done, false);
  });
});

describe("suggestions", () => {
  it("AC-5: generic keywords suggest an account group, and nothing suggests income", () => {
    assert.equal(suggestAccountGroup(ACCOUNTS.card), "Cards");
    assert.equal(suggestAccountGroup(ACCOUNTS.wallet), "Wallets");
    assert.equal(suggestAccountGroup(ACCOUNTS.bank), "Bank");
    assert.equal(suggestAccountGroup(ACCOUNTS.broker), "Investments");
    assert.equal(suggestAccountGroup(ACCOUNTS.friends), "Money with others");
    assert.equal(suggestAccountGroup(ACCOUNTS.business), "Business");
    assert.doesNotMatch(readFileSync("src/lib/setup/suggestions.ts", "utf8"), /dividend|loan|returns/i);
  });

  it("AC-5: no keyword means no suggestion, and part of a word doesn't match", () => {
    for (const name of ["Discard", "Cardamom", "Sample USD Account", "", "__proto__", "constructor", "toString"]) {
      assert.equal(suggestAccountGroup(name), undefined, name);
    }
  });

  it("AC-5: a suggestion is never saved or used until accepted", async () => {
    await withDb(async (db) => {
      await importSample(db);
      suggestAccountGroup(ACCOUNTS.card);
      assert.equal(loadSetup(db).saved, false);
      saveAnswers(db, answersFor(db, { fallback: "Bank" }));
      assert.equal(groupOf(loadSetup(db), ACCOUNTS.card), "Bank");
    });
    for (const file of ["src/lib/setup/store.ts", "src/lib/metrics/metrics.ts", "src/lib/data/update.ts"]) {
      assert.doesNotMatch(readFileSync(file, "utf8"), /suggestions/, file);
    }
  });
});

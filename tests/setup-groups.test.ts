/**
 * The new setup model (brief, "Requirement change, setup answers" and "Second
 * change, income groups"): owner-named income and expense groups, their limits
 * on the server, and setup at full size (AC-23, AC-27, AC-28, AC-29). All data
 * is made up.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dataVersion, ensureDataSchema } from "../src/lib/data/state.ts";
import { buildPending, replaceData, setupPage } from "../src/lib/data/update.ts";
import { readRows, writeRows } from "../src/lib/import/store.ts";
import type { ImportRow } from "../src/lib/import/parse-export.ts";
import { netWorthBreakdown, periodMetrics } from "../src/lib/metrics/metrics.ts";
import { groupNameProblem, plainOnly, visibleLength } from "../src/lib/setup/group-names.ts";
import { confirmSummary } from "../src/lib/setup/progress.ts";
import { categoryGroupOf, GROUP_LIMIT, NOT_GROUPED, type SetupAnswers } from "../src/lib/setup/setup.ts";
import { loadSetup, type SetupRefusal } from "../src/lib/setup/store.ts";
import { matchCount } from "../src/app/ui/format.ts";
import { ROUTE_BODY_LIMIT } from "../src/lib/security/gate.ts";
import { withDb } from "./support/import-helpers.ts";
import { answersFor, saveAnswers } from "./support/setup-helpers.ts";

const TODAY = "2026-06-15";
const ALL = { from: "2000-01-01", to: "2099-12-31" };
type Db = Parameters<Parameters<typeof withDb>[0]>[0];

let rowNumber = 2;
function made(overrides: Partial<ImportRow>): ImportRow {
  return {
    rowNumber: rowNumber++, occurredAt: "2024-04-01T10:00:00", account: "Made-up Account 00", category: "Made-up Food", subcategory: "",
    note: "", amountPaise: 10_000, type: "Exp.", originalAmount: "100", currency: "INR", secondAccount: "", ...overrides,
  };
}

/** 60 accounts, and 40 income and 40 expense categories with three subcategories each (AC-27). */
function bigRows(): ImportRow[] {
  const rows: ImportRow[] = [];
  for (let index = 0; index < 60; index += 1) rows.push(made({ account: `Made-up Account ${String(index).padStart(2, "0")}`, category: "Made-up Spend 0" }));
  for (let index = 0; index < 40; index += 1) {
    for (const sub of ["One", "Two", "Three"]) {
      rows.push(made({ type: "Income", category: `Made-up Income ${index}`, subcategory: `Made-up ${sub}`, amountPaise: 1_000 + index }));
      rows.push(made({ type: "Exp.", category: `Made-up Spend ${index}`, subcategory: `Made-up ${sub}`, amountPaise: 500 + index }));
    }
  }
  return rows;
}

/** A logged-in database in Settings: rows in, setup saved once, summary confirmed. */
function inSettings(db: Db, rows: ImportRow[]): void {
  ensureDataSchema(db);
  writeRows(db, rows);
  assert.equal(saveAnswers(db, answersFor(db)).ok, true);
  confirmSummary(db);
}

function refused(db: Db, answers: SetupAnswers, code: SetupRefusal): void {
  const before = loadSetup(db);
  assert.deepEqual(saveAnswers(db, answers), { ok: false, code });
  assert.deepEqual(loadSetup(db), before);
}

const names = (count: number, prefix = "Group") => Array.from({ length: count }, (_, index) => `${prefix} ${index + 1}`);

describe("AC-27: setup at full size", () => {
  it("lists 60 accounts and 40 income and 40 expense categories with their subcategories, and saves them all", async () => {
    await withDb(async (db) => {
      inSettings(db, bigRows());
      const page = setupPage(db);
      assert.equal(page.accounts.length, 60);
      assert.equal(page.income.categories.length, 40);
      assert.equal(page.expense.categories.length, 40);
      assert.deepEqual(page.income.categories[0]?.subcategories, ["Made-up One", "Made-up Three", "Made-up Two"]);

      const answers: SetupAnswers = {
        accounts: page.accounts.map((_, index) => (index % 7 === 0 ? "" : "Bank")),
        income: { names: names(12, "Income"), categories: page.income.categories.map((_, index) => index % 12) },
        expense: { names: names(12, "Spend"), categories: page.expense.categories.map((_, index) => (index % 5 === 0 ? null : index % 12)) },
      };
      const saved = saveAnswers(db, answers);
      assert.equal(saved.ok, true);
      const after = setupPage(db);
      assert.deepEqual(after.accounts.map((account) => account.group), answers.accounts);
      assert.deepEqual(after.income.categories.map((category) => category.group), answers.income.categories);
      assert.deepEqual(after.expense.categories.map((category) => category.group), answers.expense.categories);
    });
  });

  it("fits the largest likely save in the 16 KiB form limit: 60 accounts, 80 categories and 24 names of 40 characters", () => {
    const longName = (index: number) => `${String(index).padStart(2, "0")}${"é".repeat(38)}`;
    const answers: SetupAnswers = {
      accounts: Array.from({ length: 60 }, () => "Money with others"),
      income: { names: Array.from({ length: 12 }, (_, index) => longName(index)), categories: Array.from({ length: 40 }, () => 11) },
      expense: { names: Array.from({ length: 12 }, (_, index) => longName(index)), categories: Array.from({ length: 40 }, () => 11) },
    };
    const body = new URLSearchParams({ version: "123456", answers: JSON.stringify(answers) }).toString();
    assert.ok(Buffer.byteLength(body) <= ROUTE_BODY_LIMIT, `${Buffer.byteLength(body)} bytes`);
  });
});

describe("AC-28: income and expense groups", () => {
  it("add, rename and remove work, and a removed group's categories read Not grouped", async () => {
    await withDb(async (db) => {
      inSettings(db, bigRows());
      const options = setupPage(db);
      const base = answersFor(db);
      // Add two expense groups and place three categories.
      const place = (categories: Array<number | null>) => options.expense.categories.map((_, index) => categories[index] ?? null);
      assert.equal(saveAnswers(db, { ...base, expense: { names: ["Needs", "Wants"], categories: place([0, 1, 1]) } }).ok, true);
      assert.equal(categoryGroupOf(loadSetup(db), "expense", "Made-up Spend 1"), "Wants");

      // Rename keeps its categories.
      assert.equal(saveAnswers(db, { ...base, expense: { names: ["Needs", "Treats"], categories: place([0, 1, 1]) } }).ok, true);
      assert.equal(categoryGroupOf(loadSetup(db), "expense", "Made-up Spend 1"), "Treats");

      // Remove "Treats": the page sends its categories as Not grouped.
      assert.equal(saveAnswers(db, { ...base, expense: { names: ["Needs"], categories: place([0, null, null]) } }).ok, true);
      const setup = loadSetup(db);
      assert.deepEqual(setup.expense.names, ["Needs"]);
      assert.equal(categoryGroupOf(setup, "expense", "Made-up Spend 1"), NOT_GROUPED);
      assert.equal(categoryGroupOf(setup, "expense", "Made-up Spend 0"), "Needs");
    });
  });

  it("the server refuses over the limit, too long, empty, the same name twice, Not grouped and line breaks, in each list", async () => {
    await withDb(async (db) => {
      inSettings(db, bigRows());
      const base = answersFor(db);
      const income = (list: string[]): SetupAnswers => ({ ...base, income: { names: list, categories: base.income.categories } });
      const expense = (list: string[]): SetupAnswers => ({ ...base, expense: { names: list, categories: base.expense.categories } });
      for (const make of [income, expense]) {
        refused(db, make(names(GROUP_LIMIT + 1)), "TOO_MANY_GROUPS");
        refused(db, make(["W".repeat(41)]), "NAME_TOO_LONG");
        refused(db, make([""]), "NAME_EMPTY");
        refused(db, make(["   "]), "NAME_EMPTY");
        refused(db, make(["Wants", " WANTS "]), "NAME_TAKEN");
        refused(db, make(["Not Grouped"]), "NAME_RESERVED");
        refused(db, make(["Two\nLines"]), "NAME_NOT_PLAIN");
        refused(db, make(["Tab\there"]), "NAME_NOT_PLAIN");
      }
      // Exactly at the limits is fine: 12 groups, 40 characters people see (emoji count once).
      assert.equal(saveAnswers(db, income(names(GROUP_LIMIT))).ok, true);
      const forty = "👨‍👩‍👧".repeat(40);
      assert.equal(visibleLength(forty), 40);
      assert.equal(saveAnswers(db, expense([forty])).ok, true);
      assert.equal(saveAnswers(db, expense(["W".repeat(40)])).ok, true);
    });
  });

  it("QA Q4B-5: names are compared as NFC, invisible-only names are empty, and direction-changing characters are refused", async () => {
    await withDb(async (db) => {
      inSettings(db, bigRows());
      const base = answersFor(db);
      const expense = (list: string[]): SetupAnswers => ({ ...base, expense: { names: list, categories: base.expense.categories } });
      const composed = "Caf\u00e9";
      const decomposed = "Cafe\u0301";
      refused(db, expense([composed, decomposed]), "NAME_TAKEN");
      // A zero-width space inside a name is now refused outright (Security S4-17).
      refused(db, expense(["Food", "Fo\u200Bod"]), "NAME_NOT_PLAIN");
      for (const blank of ["\u200B", "\u200B\u200C\u200D\u2060\uFEFF", "\u00A0\u3000", "\u3164", " \u00AD "]) refused(db, expense([blank]), "NAME_EMPTY");
      for (const bidi of ["Made-up \u202Eevil", "A\u200FB", "A\u2066B\u2069", "A\u061CB"]) refused(db, expense([bidi]), "NAME_NOT_PLAIN");
      // 40 accents written as letter plus mark count as 40 once joined, and the name is saved joined.
      assert.equal(saveAnswers(db, expense(["e\u0301".repeat(40)])).ok, true);
      assert.equal(saveAnswers(db, expense([decomposed])).ok, true);
      assert.deepEqual(loadSetup(db).expense.names, [composed]);
    });
    // The page runs the same function, so it gets the same answers.
    assert.deepEqual(groupNameProblem("Cafe\u0301", ["Caf\u00e9"]), { problem: "TAKEN", takenBy: "Caf\u00e9" });
    assert.deepEqual(groupNameProblem("\u200B", []), { problem: "EMPTY" });
    assert.deepEqual(groupNameProblem("A\u202EB", []), { problem: "NOT_PLAIN" });
  });

  it("Security S4-16 and S4-17: broken, overloaded and hidden characters are refused, and real emoji and scripts still pass", async () => {
    // S4-16: half of a broken character pair, as only a hand-made request can send.
    for (const broken of [JSON.parse('"Bills\\ud800"') as string, "\udc00Rent", "A\ud83dB"]) assert.deepEqual(groupNameProblem(broken, []), { problem: "NOT_PLAIN" });
    // S4-17: one character carrying a pile of accents counts as too long, whatever it looks like.
    assert.equal(groupNameProblem("e" + "\u0301".repeat(3000), [])?.problem, "TOO_LONG");
    assert.equal(groupNameProblem("Food" + "a\u0300\u0301\u0302\u0303\u0304\u0305\u0306\u0307\u0308", [])?.problem, "TOO_LONG");
    // S4-17: invisible characters inside a name that also has letters.
    for (const hidden of ["Fo\u200Bod", "A\u2060B", "A\uFEFFB", "Soft\u00ADhyphen", "A\u200DB", "Rent\u200C", "A\u{E0041}B", "x\uFE0Fy", "A\u3164B"]) {
      assert.deepEqual(groupNameProblem(hidden, []), { problem: "NOT_PLAIN" }, JSON.stringify(hidden));
    }
    // Still fine: emoji built with joiners, selectors and tags, keycaps, a few accents, and scripts that use joiners.
    const fine = ["👨‍👩‍👧 Family", "🏳️‍🌈", "👩🏽‍❤️‍💋‍👨🏻", "👨🏻‍👩🏼‍👧🏽‍👦🏾", "🏴󠁧󠁢󠁥󠁮󠁧󠁿 Trip", "1️⃣ First", "❤️ Gifts", "Phở", "স্ত্রী", "র‍্যাব", "می‌خواهم", "e\u0301\u0302\u0303"];
    for (const name of fine) assert.equal(groupNameProblem(name, []), null, JSON.stringify(name));
    await withDb(async (db) => {
      inSettings(db, bigRows());
      const base = answersFor(db);
      const expense = (list: string[]): SetupAnswers => ({ ...base, expense: { names: list, categories: base.expense.categories } });
      refused(db, expense([JSON.parse('"Bills\\ud800"') as string]), "NAME_NOT_PLAIN");
      refused(db, expense(["e" + "\u0301".repeat(3000)]), "NAME_TOO_LONG");
      refused(db, expense(["Fo\u200Bod"]), "NAME_NOT_PLAIN");
      assert.equal(saveAnswers(db, expense(["👨🏻‍👩🏼‍👧🏽‍👦🏾".repeat(40)])).ok, true);
    });
    // The page takes the same characters out as the owner types, and keeps emoji whole.
    assert.equal(plainOnly("Fo\u200Bod\u00AD\n\u202E\ud800"), "Food");
    assert.equal(plainOnly("👨‍👩‍👧 🏳️‍🌈"), "👨‍👩‍👧 🏳️‍🌈");
  });

  it("QA Q4B-3: the search count counts groups found by name, so it is never 0 while groups show", () => {
    const emptyGroup = { rows: [], groupHit: true };
    assert.equal(matchCount([emptyGroup, emptyGroup, emptyGroup]), 3);
    assert.equal(matchCount([{ rows: [1, 2], groupHit: false }]), 2);
    assert.equal(matchCount([{ rows: [1, 2], groupHit: true }, { rows: [3], groupHit: false }]), 4);
    assert.equal(matchCount([]), 0);
  });

  it("QA Q4B-2 and Q4B-1: Keep group returns focus to the Options button, and long names wrap", () => {
    const page = readText("src/app/ui/setup-lists.tsx");
    assert.match(page, /setFocusTo\(menuId\(removing\.id\)\)/);
    assert.match(page, /id=\{props\.id\}/);
    const css = readText("src/app/system.css");
    assert.equal(css, readText("docs/design-system/system.css"), "the app's copy matches the design system");
    for (const part of [".pick-row__name", ".pick-row__sub", ".fold__name"]) {
      const rule = css.split("\n").find((line) => line.startsWith(`${part} {`)) ?? "";
      assert.match(rule, /overflow-wrap: anywhere/, part);
    }
  });

  it("the two lists are separate, so a name can be used once in each", async () => {
    await withDb(async (db) => {
      inSettings(db, bigRows());
      const base = answersFor(db);
      const answers = { ...base, income: { names: ["Family"], categories: base.income.categories }, expense: { names: ["Family"], categories: base.expense.categories } };
      assert.equal(saveAnswers(db, answers).ok, true);
    });
  });

  it("names are stored trimmed, as given, and never changed into anything but text", async () => {
    await withDb(async (db) => {
      inSettings(db, bigRows());
      const base = answersFor(db);
      const odd = "<script>x</script> & dlrow";
      assert.equal(saveAnswers(db, { ...base, income: { names: [`  ${odd}  `], categories: base.income.categories } }).ok, true);
      assert.deepEqual(loadSetup(db).income.names, [odd]);
    });
  });

  it("the page's checks and the server's are the same function, with the design's wording on the page", () => {
    assert.deepEqual(groupNameProblem("wants", ["Wants"]), { problem: "TAKEN", takenBy: "Wants" });
    assert.equal(groupNameProblem("Needs", ["Wants"]), null);
    for (const file of ["src/lib/setup/store.ts", "src/app/ui/setup-lists.tsx"]) {
      assert.match(readText(file), /groupNameProblem/, file);
    }
    const page = readText("src/app/ui/setup-lists.tsx");
    for (const words of ["Give the group a name.", "Use 40 characters or fewer.", "You already have a group called “", "“Not grouped” is kept for categories without a group.",
      "You have 12 groups, the most you can have. Remove one to add another.", "Up to 40 characters.", "Nothing matches “", "Clear search", "Keep group", "Remove group"]) {
      assert.ok(page.includes(words), words);
    }
  });
});

describe("AC-23: Settings keeps the same checks after the first time", () => {
  it("allows Ungrouped, refuses a stale page, and new names from an update read Not grouped", async () => {
    await withDb(async (db) => {
      inSettings(db, bigRows());
      const base = answersFor(db, { fallback: "" });
      assert.equal(saveAnswers(db, base).ok, true);
      const stale = dataVersion(db) - 1;
      assert.deepEqual(saveAnswers(db, base, stale), { ok: false, code: "STALE" });

      const withGroups = { ...base, expense: { names: ["Needs"], categories: base.expense.categories.map(() => 0) } };
      assert.equal(saveAnswers(db, withGroups).ok, true);
      // An update brings a new expense category and drops an old one.
      const next = readRows(db).filter((row) => row.category !== "Made-up Spend 39");
      next.push(made({ type: "Exp.", category: "Made-up Brand New", subcategory: "Made-up Sub", rowNumber: 9_000 }));
      const pending = buildPending(db, next, TODAY);
      assert.deepEqual(pending.review.newCategories.expense, [{ name: "Made-up Brand New", subcategories: ["Made-up Sub"] }]);
      assert.equal(pending.review.removedCategories, 1);
      assert.deepEqual(replaceData(db, pending, { version: pending.version, ticked: true, groups: [] }, TODAY), { ok: true });
      const setup = loadSetup(db);
      assert.equal(categoryGroupOf(setup, "expense", "Made-up Brand New"), NOT_GROUPED);
      assert.equal(categoryGroupOf(setup, "expense", "Made-up Spend 0"), "Needs");
      // The removed category's answer leaves the live table (condition 36).
      assert.equal(db.prepare("SELECT 1 FROM setup_categories WHERE name = ?").get("Made-up Spend 39"), undefined);
      assert.deepEqual(setup.expense.names, ["Needs"]);
    });
  });
});

describe("AC-29: income in several groups all counts as Earned", () => {
  it("gives the same numbers whatever the groups, and the breakdown adds up", async () => {
    await withDb(async (db) => {
      const rows = [
        made({ type: "Income", category: "Made-up Salary", subcategory: "Made-up Pay", amountPaise: 100_000_00 }),
        made({ type: "Income", category: "Made-up Market", subcategory: "Made-up Shares", amountPaise: -2_500_00 }),
        made({ type: "Income", category: "Made-up Market", subcategory: "Made-up Funds", amountPaise: 4_000_00 }),
        made({ type: "Income", category: "Made-up Loan", amountPaise: 50_000_00 }),
        made({ type: "Exp.", category: "Made-up Food", amountPaise: 30_000_00 }),
        made({ type: "Income Balance", category: "Modified Bal.", amountPaise: 1_000_00 }),
      ];
      inSettings(db, rows);
      const ungrouped = periodMetrics(readRows(db), loadSetup(db), ALL, TODAY);
      const base = answersFor(db);
      // Income in the server's order: Loan, Market, Salary, each in its own group.
      assert.equal(saveAnswers(db, { ...base, income: { names: ["Borrowed", "Savings", "Work"], categories: [0, 1, 2] } }).ok, true);
      const grouped = periodMetrics(readRows(db), loadSetup(db), ALL, TODAY);
      assert.deepEqual(grouped, ungrouped);
      assert.equal(grouped.earned, 100_000_00 - 2_500_00 + 4_000_00 + 50_000_00);
      assert.equal(grouped.otherCorrections, 1_000_00);
      const breakdown = netWorthBreakdown(readRows(db), loadSetup(db), ALL, TODAY);
      assert.equal(breakdown.earned - breakdown.spent + breakdown.otherCorrections + breakdown.unmatchedTransfers, breakdown.change);
      assert.equal(breakdown.change, breakdown.closing - breakdown.opening);
    });
  });
});

function readText(file: string): string {
  return readFileSync(file, "utf8");
}

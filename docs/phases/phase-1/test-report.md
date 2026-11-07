# Phase 1 test report

Full QA run, done once, by independent QA on 2026-11-07. It covers the uncommitted working tree on branch `phase-1`.

## Result

**Not ready to merge.** 22 of 23 criteria pass and 1 fails. There is 1 Blocker, 3 Major and 4 Minor findings.

The core is strong. Balances, row reading, saving, encryption and error messages all held up under hostile files. The problems are at the edges: one limit can be dodged, and three odd inputs give wrong results without any warning.

| Level | Count | Findings |
|---|---|---|
| Blocker | 1 | F-1 |
| Major | 3 | F-2, F-3, F-4 |
| Minor | 4 | F-5, F-6, F-7, F-8 |

## Checks

| Check | Result |
|---|---|
| `npm test` | Pass: 237 tests, 0 failed, no leftovers |
| `npm run typecheck` | Pass |
| `npm audit` | Pass: 0 vulnerabilities |
| `npm audit signatures` | Pass |
| `npm run guard` | Pass: 103 files, nothing blocked. Also passes after this run |
| `npm run sample:check` | PASS: 525 of 525 rows, 7 of 7 balances, 92 of 92 transfers, 9 of 9 traps |
| Pull request check | Not tested: there's no commit or pull request yet |
| App sanity check | Pass: the production server answers the home page with 200, and refuses a wrong `Host` with 403 |

## Criteria

| Criterion | Result | Evidence |
|---|---|---|
| AC-1 Sample in memory, repeatable, nothing left behind | Pass | Same hash in two separate processes. The sample and reader don't import `node:fs`. The leftover check fails on a planted database, including in a hidden folder and in capitals, and passes on a clean folder |
| AC-2 All nine traps, closed and foreign accounts | Pass | 9 of 9. Taking out market losses or future rows fails the tests. Removing `Income` or `Expense Balance` rows reports the right traps missing |
| AC-3 Made-up names, separate answers | Pass | All 18 account and category names read as fake. Expected balances come from the generator's ledger |
| AC-4 Columns by position | Pass | My own comparison of all 525 rows, field by field: 0 differences. 184 rows have different values in the two `Accounts` columns. Swapping the columns fails the tests |
| AC-5 Fixed types, unknown reported | Pass | 12 near-miss labels, such as `exp.`, `Income ` and blank, are all rejected with row numbers. Silently dropping them fails the tests |
| AC-6 Row counts per type | Pass | All six types match the generator. See F-3 for a crafted file that breaks this |
| AC-7 Repeats kept | Pass | All 3 repeat rows are kept. A planted de-duplicate step fails 12 tests |
| AC-8 Sums use `INR` | Pass | The USD rows keep `250 USD` and `1000 USD` for reference, and maths uses INR. Reading `Amount` instead fails the tests |
| AC-9 Negative income | Pass | 9 negative rows stay negative |
| AC-10 Future rows | Pass | Tested on the boundary: a row dated today isn't flagged. A later row is kept, flagged, left out until its date, and counted from that date |
| AC-11 Balances exact | Pass | Sample: 0 differences across 9 dates. 20,000 random rows checked against my own whole-number sums: exact, today and at a past date. 10,000 × 0.1 gives exactly 100,000 paise |
| AC-12 Transfers pair | Pass | 92 of 92 pairs. Removing one side, for a sweep of 27 sample transfers including identical repeats, reports the correct row every time. See F-4 for the case the criterion doesn't name |
| AC-13 Closed accounts at zero | Pass | Exactly 0 |
| AC-14 Saved, encrypted, no readable text | Pass | 18 awkward values read back identical, including emoji and a 32,767-character note. Wrong password refused. No plain header. A raw scan during a real 4,000-row save, with a journal present in all 10 scans, found no marker. Killing the process mid-save also left no marker |
| AC-15 Failed import saves nothing, second refused | Pass | A forced failure at row 300 saved 0 rows and gave a fixed message, and a retry worked. After a kill mid-save, 0 rows on reopening. A second import is refused with rows unchanged. See F-2 for two imports at once |
| AC-16 Bad files rejected | Pass | Wrong columns, wrong order, empty, not Excel, password-protected, macro, two sheets (one hidden too), fake `.xls` and cut-off files are all rejected. About 27,000 single-byte flips: none changed the data, crashed or hung. See F-7 |
| AC-17 Limits | **Fail** | Exact and one-over pass on the real numbers for 20 MB, 200 MB unpacked, 100,000 rows, 100 entries, 12 columns and 200 MB of text. A 1 GB bomb, honest or lying about its size, stops at once. Full 100,000-row import takes about 2 seconds. **But the 32,767-character cell limit can be dodged: see F-1** |
| AC-18 Cell text is only data | Pass | Formula-looking and script text is stored unchanged. Shared, array, empty and reordered formulas in date or amount columns reject the file. `DOCTYPE` is refused in all five parts read. Entity tricks such as `&constructor;` are refused. See F-6 |
| AC-19 Bytes only | Pass | No file path anywhere. A path string is rejected as not Excel. `../`, absolute and backslash zip names and escaping link targets are all rejected |
| AC-20 No leaks | Pass | Markers planted in 19 harmful files, covering every column, header, sheet name, zip name, link target and XML error. No leak in results, messages, stacks or anything logged |
| AC-20a `__proto__` and `constructor` | Pass | Five such names in every text column give correct balances, and `Object.prototype` is unchanged |
| AC-21 `sample:check` | Pass | Short, plain summary. It prints FAIL with a broken balance sign, wrong columns, or a missing trap |
| AC-22 Project checks | Pass | All four local checks pass. `yauzl`, `sax` and `pend` have no install scripts and are recorded in D-019. The GitHub check can't run until there's a commit. See F-8 |

## Findings

### F-1 Blocker: the per-cell text limit can be dodged

AC-17 sets 32,767 characters per cell. The limit is applied to each piece of text, not to the whole cell, and a cell can hold many pieces. I stored a note of 9.8 million characters. Only the 200 MB total limit stops it.

Steps:

1. Build a file in memory with `buildWorkbook`, using one good row.
2. Set the `Note` cell to `{ attributes: 't="inlineStr"', inner: "<is>" + "<r><t>" + "a".repeat(32767) + "</t></r>" (repeated 300 times) + "</is>" }`.
3. Pass it to `parseExport`. It's accepted, and the note is 9,830,100 characters long.
4. Two `<v>` elements in a `t="str"` cell do the same, giving 65,534 characters.

Expected: `CELL_TOO_LONG`. The cause is in `readSheet` in `xlsx-reader.ts`, which adds pieces with no check on the total. Shared text isn't affected.

### F-2 Major: two imports at once both save, doubling every balance

The "already imported" check runs before the file is read, and isn't repeated just before saving. Two overlapping imports both pass it, and both report success.

Steps:

1. Open a throwaway database.
2. Run `Promise.all([importExport(sample.bytes, db, options), importExport(sample.bytes, db, options)])`.
3. Both return `ok: true`, and the database holds 1,050 rows for a 525-row file.

Expected: the second is refused. This is the doubling Security's P1 was meant to stop. Nothing can trigger it today because there's no upload screen, but a double click in Phase 4 could. One after the other, the refusal works, so I've passed AC-15 and graded this Major. The owner may prefer to read it as an AC-15 failure.

### F-3 Major: a row or cell nested inside another silently loses data

Security condition 4 says the reader fails closed on anything unknown, and section 2 says rows are never cut off silently. Well-formed XML with a `<row>` inside a `<row>` drops the outer row with no error. A `<c>` inside a `<c>` drops the outer cell the same way.

Steps:

1. Replace `xl/worksheets/sheet1.xml` using the `overrides` option. Use a header row, then row 2 left open, then a complete row 3, then `</row>`.
2. Pass it to `parseExport`. It's accepted with 1 row, and row 2 has gone.
3. With a cell nested inside the `Note` cell, the file is accepted and the note comes back empty.

Expected: `BAD_STRUCTURE`. Normal Excel output doesn't look like this, so only a crafted or broken file would hit it. But the result is a wrong balance with no warning.

### F-4 Major: transfer pairing ignores accounts

Pairing matches on time and amount only, so it can name the wrong row or pair two sides that have nothing to do with each other. This is the only check that a transfer really has a partner, and `sample:check` reports its result.

Steps, all with the same time and the same amount:

1. Rows: Out from A to B, Out from C to D, In at D to C. The In at B is missing. The report names row 3, which is the good transfer. The correct answer is row 2.
2. Rows: Out from A to B, In at X from Y. These are unrelated, but they're counted as 1 pair with nothing unmatched.
3. Rows: Out and In on the same account. These are also counted as a pair.

Identical repeats, which AC-12 names, work correctly, so AC-12 passes. It needs two different transfers in the same second for the same amount, or a missing side on each, so it's rare. Fixing it relies on the second `Accounts` column holding the other account. That's true in the sample but the owner has only said it's "also an account name", so this may need one question to the owner.

### F-5 Minor: four checks have no test that fails

I made 40 deliberate breaks to a copy of the code outside the repo. The tests caught 36. These four went unnoticed:

| Break | Effect |
|---|---|
| Running byte limit switched off | Known and written in the handoff. It can't fire alone today. Security's condition 5 asks for a test of every control |
| `strictFileNames` switched off | Bad zip names are still refused, so there's no harm today. The settings test doesn't cover this option |
| Future flag also includes today | The code is correct, as I tested by hand, but no test covers the boundary |
| Pairing ignores time | No test has transfers of the same amount at different times |

### F-6 Minor: formulas are allowed in the type and account columns

AC-18 only asks for rejection in amount and date columns, so this isn't a failure. But a formula in `Income/Expense` or `Accounts` is accepted, and its stored result decides which way the money moves. Nothing is run. The PM may want to widen the rule.

### F-7 Minor: damage in parts the app doesn't read goes unnoticed

A flipped byte in `_rels/.rels` is accepted, and a `DOCTYPE` in an unread part such as `xl/styles.xml` is too. These parts are never opened, so the rows come back identical and nothing harmful can happen. Strictly, AC-16 and Security's "in every part" could be read more widely.

### F-8 Minor: D-019 doesn't mention install scripts

AC-22 asks for install scripts to be recorded in `docs/DECISIONS.md`. D-019 doesn't mention them, though `security.md` does. I checked and none of the three packages has one.

## Security conditions before merge

| Condition | Result | Evidence |
|---|---|---|
| 4 Steps in order, fails closed | **Not met** | The seven steps are built in order, but F-1 and F-3 show gaps |
| 5 A test for every control | Partly met | All controls tested except the running byte count and `strictFileNames` (F-5). The cell limit test misses F-1 |
| 6 Settings protected by a test | Met | Turning on `unparsedEntities` or turning off `validateEntrySizes` fails the tests |
| 7 Error boundary, row numbers only | Met | AC-20 run. A raw error let through fails the tests |
| 8 One transaction, bound values | Met | The only SQL is fixed text with bound values. Removing the transaction fails the tests |
| 9 Raw scan of database and journal | Met | Scanned during a real save and after a kill mid-save: no marker |
| 10 Leftover check, no `node:fs` | Met | Leftover check proven both ways. No `node:fs` in `src/lib/import` or `src/lib/sample` |

## How this was tested

All hostile files were built in memory with `src/lib/sample/xlsx-writer.ts`, by throwaway scripts outside the repo. Deliberate breaks were made to copies outside the repo. All data was made up, and no spreadsheet was opened or saved. No app code, tests or brief were changed. This report is the only new file.

## Not tested

- The GitHub pull request check, because there's no commit yet.
- Real-file differences. This is an accepted gap until Phase 13.

## Narrow re-test

Scope: F-1 to F-6 and F-8, as fixed in the uncommitted work on `phase-1`. F-7 was not changed and stays Minor. For each finding I ran the original steps, then a close variant the builder's tests don't cover. All files were built in memory with `xlsx-writer.ts`, by throwaway scripts outside the repo. All data is made up.

| Finding | Result | Evidence |
|---|---|---|
| F-1 cell limit dodged | Pass | 300 rich pieces: `CELL_TOO_LONG`. Two `<v>`: `BAD_STRUCTURE`. Exactly 32,767 characters accepted, 32,768 refused. Variants all refused: two plain `<t>` in one `<is>`, two 20,000-character pieces, a shared item with 3 long pieces, the same in the `Accounts` column. Phonetic `<rPh>` text isn't read or stored, so 30,000 + 30,000 is accepted at 30,000 characters. That's harmless. |
| F-2 parallel imports | Pass | Two at once: one ok, one `ALREADY_IMPORTED`, 525 rows saved. Three at once with different files: 1 ok, 2 refused, 1 row saved. Two separate database handles on the same file: one ok, one refused, 525 rows. Taking the check out of the save transaction in a copy fails a test. |
| F-3 nested row or cell | Pass, with one new Minor (N-1) | Open row 2 with row 3 inside: `BAD_STRUCTURE`. Cell inside cell: `BAD_STRUCTURE`. Variants refused: `<t>` in `<t>`, `<v>` in `<v>`, `<sheetData>` in `<sheetData>`, row inside a cell, cell outside a row, `<si>` in `<si>`, a plain and an inline value in one cell, `<f>` in `<f>` (as `FORMULA_IN_VALUE`). |
| F-4 transfer pairing | Pass | Out A>B, Out C>D, In D<-C: pair 1, unmatched row 2 (correct). Unrelated In: 0 pairs, both unmatched. Same-account Out and In: unmatched. Variants right: reversed direction, different time, different amount, names holding quotes or commas, `__proto__` as a name, 2 identical Outs and 1 In (1 pair, 1 left). Names are matched exactly, so `B` and `b` don't pair. That's the safe side. |
| F-5 four checks with no failing test | Pass | In a copy outside the repo, each break now fails one more test than the copy's baseline: byte count off, `strictFileNames` off, future flag including today, pairing ignoring time. Dropping the accounts from pairing fails 3 more. (The copy had 1 failure of its own before any break, from not being the real folder. The real run is clean.) |
| F-6 formulas in type and account | Pass | A formula in `Income/Expense` or the first `Accounts` column rejects the file with `FORMULA_IN_VALUE`. This holds for string, inline and empty `<f/>` forms, a shared-formula marker, and a bad row far down the sheet. Text that merely starts with `=` is stored unchanged. A formula in the second `Accounts` column is accepted. The owner's rule names only the first column, so it isn't a failure. |
| F-8 D-019 and install scripts | Pass | D-019 now says none of the three packages has an install script, so D-004 needs no exception. |

### New findings

- **N-1 Minor:** an `<is>` inside an `<is>`, or an `<r>` inside an `<r>`, is accepted. Nothing is lost: the inner text is kept, so the note reads the same. It isn't the silent loss F-3 described, but it is the same "unexpected nesting" the reader otherwise refuses. Logged only.

### Nothing broken by the fixes

| Check | Result |
|---|---|
| `npm test` | 247 of 247 pass, leftover check clean |
| `npm run typecheck` | Clean |
| `npm audit` | 0 vulnerabilities |
| `npm run guard` | 103 files checked, nothing blocked |
| `npm run sample:check` | PASS: 525 of 525 rows, 7 of 7 balances, 92 of 92 transfers paired, 0 unmatched, 9 of 9 traps |

No Blocker or Major finding is open. No app code, tests or brief were changed, and nothing was committed.

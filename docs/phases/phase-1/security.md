# Phase 1 security review

## Threat review (before the build)

Reviewer: Security, independent agent. Date: 2026-11-07. Scope: reading Excel files, the sample generator and saving rows. This review changes no app code. Sign-off comes after the build.

**In short:** use a small in-house `.xlsx` reader on top of two small, maintained packages, `yauzl` (unzip) and `sax` (XML). No ready-made Excel package passed. The brief's three limits are sound, but they aren't enough alone. AC-1's guard proof doesn't prove what it claims.

**How I checked:** `npm view`, plus `npm audit` on lockfiles built in a scratch folder, and reading package source. I ran attacks there with made-up files built in memory. Nothing was installed in this repo, and no spreadsheet file was opened or written.

## 1. Which reader

| Option | Maintained? | Audit | Packages | Install scripts | Verdict |
|---|---|---|---|---|---|
| `xlsx` from npm, 0.18.5 | No. Last npm release March 2022, and SheetJS says npm gets no more updates | 1 high: prototype pollution and slow-regex attack | 9 | None | **Rejected.** It fails our audit check |
| SheetJS from its own site, 0.20.3 | Yes, but not through npm. 0.20.3 is the newest I could confirm | Blind spot, see note 1 | 1 to 2 | None seen | Rejected for `.xlsx`. Only fallback for `.xls` |
| `node-xlsx`, `@e965/xlsx` | Wrapper and unofficial copy of SheetJS. Last releases 2024 | Same blind spot | 1 to 2 | None | **Rejected.** Not the maintained channel |
| `exceljs` 4.4.0 | Last stable release October 2023 | 2 moderate, see note 2 | 193, six deprecated | None | **Rejected.** Its streaming reader can write sheet data to temp files in plain text (`workbook-reader.js` line 115) |
| `xlsx-populate` 1.21.0 | Last release 2020 | Clean | 19 | None | **Rejected.** Unmaintained |
| `read-excel-file` 9.3.14 | Yes, October 2026. One maintainer | Clean | 7 | None | **Rejected as it stands.** No limits, see below. Fallback only |
| No packages: own zip and XML code | Ours | Nothing to audit | 0 | None | Rejected. Hand-written XML parsing is where the mistakes would be |
| **In-house reader on `yauzl` 3.4.0 and `sax` 1.6.1** | Yes, both released in 2026 | Clean | 3, with `pend` | None | **Recommended** |

Note 1: `npm audit` can't check a package that comes from a web link. `node-xlsx` pulls SheetJS 0.20.2 that way, and audit reported zero problems without being able to look at it.

Note 2: Third-party sites also list 2026 reports against `exceljs` up to 4.4.0: prototype pollution, unlimited unpacking and path traversal. I couldn't confirm these at a primary source, and npm audit doesn't show them. The rejection doesn't depend on them.

**Why not `read-excel-file`.** It's the best ready-made package, but I tested it:

- A 147 KB file that unpacks to 150 MB, which is under our limit, ran for 50 seconds, used about 1 GB of memory, then died with a stack overflow.
- It unpacks everything at once, so limits can't apply partway through.
- It ignored a real formula and returned the stored value (99) with no sign.
- It turns amounts into decimal numbers before we see them.

Fallback, only if the in-house reader overruns the budget: `read-excel-file` behind a `yauzl` pre-check and a memory-capped worker. That needs Security to look again.

**What I proved about the recommended pair:**

- `yauzl` stopped a file that lied about its size at the first 16 KB chunk.
- `yauzl` refused `../evil.xml`. It did **not** refuse two entries with the same name, so we must.
- `sax` in strict mode doesn't expand custom entities, but it does if `unparsedEntities` is on. That option must stay off.
- Streaming through `sax` read 100,000 rows of 12 columns in 1.6 seconds. That file was 7 MB zipped and 71 MB unpacked.

**The honest cost:** our own reader sees only the Excel features we teach it. So it must fail closed: anything it doesn't recognise stops the import, never a guess. A surprise in Phase 13 then gives an error rather than a wrong number. This adds to the accepted gap in the brief.

**`.xlsx` or `.xls`:**

- **`.xlsx`:** everything here applies.
- **Real old `.xls`:** this is a different binary format with no zip or XML. Zip bombs don't apply, but neither of these packages can read it, and we shouldn't write a reader for it. It also holds at most 65,536 rows. See proposal P4.
- **Fake `.xls`:** some apps save HTML or text under that ending. Decide by the file's first bytes, never its name. See proposal P5.

## 2. File-reading threats

Order matters. Each step runs before the next one starts, and any failure rejects the whole file. Rows are never cut off silently.

| Step | Check |
|---|---|
| 1 | Size is 20 MB or less, before any parsing |
| 2 | First bytes are a zip. Password-protected Excel files look like old Office files, so they're rejected here with a clear message |
| 3 | Directory only, nothing unpacked: 100 entries at most, no repeated names (ignoring case), only store or deflate, no encryption flag, and the sizes the file *declares* add up to 200 MB or less |
| 4 | Only named parts are opened: workbook, its links, one sheet, shared strings and styles. Everything else is never unpacked, so macros, images and zips inside zips do nothing |
| 5 | Unpack as a stream with one running byte count across all parts, and stop at 200 MB whatever the file declared. Keep `validateEntrySizes` on. Check each part's checksum, because `yauzl` doesn't, and a damaged amount must not pass |
| 6 | Parse as a stream. Never hold a whole part as one string |
| 7 | While parsing: count rows and stop at 100,001. Apply the cell limits below |

| Threat | Control |
|---|---|
| Zip bomb | Steps 3 and 5. The test must show the byte count never passed the limit |
| File lying about its size | Step 5 uses real bytes, not the declared size |
| Overlapping or repeated entries | Step 3 adds up every entry, and each part is read once |
| XML entity attacks | Reject any `DOCTYPE`, in every part. `sax` strict mode, and every parser error is fatal. Reject XML that isn't UTF-8, and decode with a fatal decoder |
| Formulas | Never run. Macros and links to other files are never opened. See proposal P2 for real formula cells |
| Text that looks like code | Stored unchanged, through bound values only. Never build SQL from cell text |
| Huge cells | 32,767 characters at most, which is Excel's own limit |
| Shared text multiplied | One 10 MB string can be referenced by a million cells, and the unpacked limit doesn't see it. Cap cell text after expansion at 200 MB in total. Check every string index is in range |
| Sparse or odd rows | Columns come from the cell's `r` reference, because Excel leaves out empty cells. Counting cells would shift a value into the wrong column. Rows must increase, and a cell beyond column 12 rejects the file. Bad references reject the file |
| Odd numbers | Only plain decimal text of limited length. No `NaN`, `Infinity` or huge exponents. Store whole paise and check they stay within safe integer range |
| Odd dates | Honour the 1904 date setting, and reject impossible serial values |
| Paths | Entry names and link targets are only compared with the fixed list. External links are rejected. Nothing is ever written to disk from the zip |
| Prototype pollution | Account, category and sheet names must never be object keys. Use `Map`, or fixed fields on row objects. This matters most in the balance rebuild, because `__proto__` or `constructor` could be an account name |
| Memory | Steps 1 to 7, plus streaming. A 200 MB limit is only safe with streaming, because a string that size can use twice the memory and a parsed tree far more |

**Are the working limits sound? Yes, keep all three.** A full-size file came to 7 MB zipped and 71 MB unpacked, so 20 MB and 200 MB leave about three times the room. Don't add a compression ratio limit. Honest repeated text compresses very well, so a ratio could reject a real file, and the absolute limit already does the job. The 100,000 limit should mean data rows, not counting the header, and it must also count empty `<row>` elements. Without that, a file of empty rows took 9 seconds.

## 3. Data handling

- **Errors can leak values by themselves.** I confirmed `BigInt("Secret Bank")` throws an error containing that text, and `JSON.parse` does too. So one boundary around the import must turn anything thrown into a fixed code, keeping no `cause` and no original message. Don't pass on `sax` messages either.
- **Reports use row numbers and fixed reason codes only.** That covers unknown types, unmatched transfers and wrong columns. Never echo a cell, not even a bad header cell, because a shifted file may put a value there. No `console.log` of rows, and no file name in messages.
- **Partial saves.** Read and check the whole file first, then write in one transaction. Nothing touches the database while parsing.
- **Repeat imports.** Rows have no IDs and repeats are genuine, so a second import that adds rows can't be undone or spotted, and it would double every balance. See proposal P1.
- **Side files.** A crash mid-save leaves a journal file. Don't assume it's encrypted: test it (condition 9).
- **Sample stays in memory.** The generator returns bytes. Neither it nor the parser may import `node:fs`. Zip timestamps must be fixed so two runs match. Hostile test files are built in memory too. No exception may be added to the guard for fixtures.
- **Tests on disk.** Existing tests use `mkdtemp` with cleanup, which is the right pattern. But the guard is no safety net here: see the first gap below. The import takes an open database and has no default path, so tests and `sample:check` can't reach a real database by accident.

## 4. Gaps in the acceptance criteria

These tighten the proof rather than change what the app does. The PM should fold them into the brief, and the owner accepts them there.

- **AC-1 proves nothing about leftover files.** `npm run guard` checks git history only, and `.gitignore` hides spreadsheets and databases, so a test that leaves one behind still passes. It needs a check of the working folder, including ignored files, after the tests run.
- **AC-14** should scan the database and any journal file, including mid-transaction, for a known made-up text.
- **AC-15** should force a failure halfway through saving, with rows already in the database. It should also say what a second good import does (P1).
- **AC-16** is missing password-protected files, macro files, more than one sheet, a fake `.xls`, and a flipped byte inside a part, which only a checksum catches.
- **AC-17** has one zip bomb test. It needs a file that lies about its size, too many entries, overlapping entries and shared text multiplied. It should also test exactly at each limit and one over, and show the limit fired *during* unpacking.
- **AC-18** should test `DOCTYPE`, entity expansion and a real formula cell, not just text that looks like one.
- **AC-19** covers the file's name only. Add zip entry names and link targets, and make the import accept bytes only.
- **AC-20** should also list dates, currency, raw cell text and file names. The test should plant marker text in every column and check messages, stacks and everything logged.
- **Missing:** a test with accounts named `__proto__` and `constructor`, whose balances come out right and which leave `Object.prototype` unchanged.

## 5. Conditions

**Before build**

1. Record the reader decision in `docs/DECISIONS.md`: `yauzl` 3.4.0, `sax` 1.6.1 and `pend`, pinned. No other new package without Security (AC-22, Phase 0 condition 16).
2. Don't start the parser until question 1c is answered. If the answer is `.xls`, stop and bring P4 to the owner.
3. The owner answers P1 and P2, and the design takes bytes in, with no file path anywhere.

**Before merge**

4. All seven steps in section 2 are built in that order, and the reader fails closed on anything unknown.
5. Every control in the threat table has a test, using files built in memory.
6. `unparsedEntities` stays off, `validateEntrySizes` stays on, and a test fails if either changes.
7. The error boundary and row-numbers-only rule from section 3 are built, with the marker test from AC-20.
8. Saves use one transaction after full validation, with bound values only.
9. The raw scan of the database and its journal finds no made-up marker text. If it does, that's a Blocker.
10. The after-tests check of the working folder exists, and the sample and parser don't import `node:fs`.
11. At sign-off, recheck `npm audit`, `npm audit signatures` and install scripts on the final lockfile.

**Later**

12. **Before Phase 4:** run the reader in a worker with memory and time limits, so a bad upload can't freeze the app. Set the upload size limit before the body is read (Phase 0 condition 13). Drop file bytes after import.
13. **Before Phase 4:** add to Known limits that file bytes and strings stay in memory until cleared and can't be wiped.
14. **Screens and any export:** stored cell text stays dangerous. Show it as text only, and escape `=`, `+`, `-` and `@` in any CSV export.
15. **Phase 13:** repeat this review before the real file is used (Phase 0 condition 18). Expect possible fail-closed errors, and fix them with shape information only, never values.

**From Phase 0:** condition 1 still has only the owner's word as evidence. It doesn't block this phase.

## 6. Proposals for the owner

None of these is decided.

- **P1. A second import in this phase is refused** if rows are already saved, until Phase 4 brings replace and undo. Otherwise balances could double with no way to tell.
- **P2. A real formula in an amount or date column rejects the file.** Elsewhere, the stored text is kept. It's never run. A formula's stored value could be stale or planted, and the export shouldn't contain any. If the real file does, we'd find out in Phase 13 and revisit this.
- **P3. Add these to AC-17, leaving the three working limits as they are:** 100 zip entries, 12 columns, exactly one sheet, 32,767 characters per cell and 200 MB of total cell text. Real exports should never reach them.
- **P4. Only if the file really is old `.xls`:** you re-save it as `.xlsx` in Excel before each import, which adds one step but keeps old-format parsing out of the app. The other way is the official SheetJS build, pinned by hash, which `npm audit` can't check and which needs its own review.
- **P5. Add one item to question 1.** Run this on your own file, replacing the path, and send back the one line it prints. It shows the file's true type and no data:

```bash
file -b --mime-type "PATH-TO-YOUR-FILE"
```

## Couldn't verify

- The newest SheetJS version: its site's version list didn't load, and 0.20.3 comes from search results.
- The 2026 `exceljs` reports: third-party sources only, and one page refused access.
- Whether the database's journal files are encrypted: not tested, so it's condition 9.
- How the real file is laid out. Reader choices assume a normal `.xlsx` until question 1 is answered.

## Sources

- [SheetJS advisory, CVE-2023-30533](https://cdn.sheetjs.com/advisories/CVE-2023-30533)
- [GitLab advisory for `xlsx`](https://advisories.gitlab.com/npm/xlsx/CVE-2023-30533/)
- [SheetJS CE repository](https://git.sheetjs.com/sheetjs/sheetjs)
- [`yauzl` README](https://github.com/thejoshwolfe/yauzl)
- [`exceljs` report listing (third party)](https://exploit-intel.com/vendor/exceljs)
- [Snyk page for `read-excel-file`](https://security.snyk.io/package/npm/read-excel-file)

## Sign-off (after the build)

Reviewer: Security, independent agent. Date: 2026-11-07. Scope: the uncommitted work on `phase-1`, after QA's narrow re-test. No app code or tests were changed. All hostile files were made up, built in memory by throwaway scripts outside the repo, and nothing here opened a spreadsheet outside the repo.

**Verdict: Not signed off.** Two Blockers are open, and condition 4 isn't met. Both Blockers need small fixes in `xlsx-reader.ts`, then a narrow Security recheck. No data was exposed by anything I tried: the two Blockers are a crash or stall, and hostile files being read wrongly. Everything else held up.

### Conditions

| Condition | Result | Evidence |
|---|---|---|
| 4 Seven steps in order, fails closed | **Not met** | The steps are built in order. It doesn't fail closed on unknown XML elements or on extreme nesting: S-1 and S-2 |
| 5 A test for every control | **Partly met** | QA's F-5 is closed, and I confirmed the tests run. The Memory control has no test for nesting or attribute counts, and the formula and row controls have no test for unknown elements. S-1 and S-2 need tests |
| 6 Settings protected by a test | Met | In a copy outside the repo, each of these failed tests: `unparsedEntities` on (1 fail), `validateEntrySizes` off (2), `strictEntities` off (1). The unchanged copy had 0 fails |
| 7 Error boundary, row numbers only | Met | 20,000 damaged files with marker text in every column (flips, random bytes, cut-offs, directory damage): every rejection was a fixed code, no marker in any message, stack or `cause`, nothing logged, 0 uncaught errors, 0 hangs, and no accepted file had changed rows. 11 more hostile files through `importExport`, with the marker in entry names, tag names, entity names, `DOCTYPE`, cell types and the header: 0 leaks. By reading the code, zip, XML and database errors are all replaced by fixed codes |
| 8 One transaction, bound values | Met | Read `store.ts`: fixed SQL, bound values only, validation finishes before any write, and the check and save share one immediate transaction. A rollback mid-change kept all 5,000 rows |
| 9 Raw scan of database and journal | Met | Marker not found in the database after a save, during a save with a tiny cache, or after a kill mid-save. QA's scan could miss the journal, because a first import puts little in it. So I also forced a 1 MB journal holding old marked rows: no marker. Mode is `delete`, no WAL file, and `temp_store` is memory |
| 10 Leftover check, no `node:fs` | Met | A planted database file exits 1 and a clean folder exits 0. `src/lib/import` and `src/lib/sample` import only `node:zlib` |
| 11 Audit, signatures, install scripts | Met | Final lockfile: `npm audit` 0 vulnerabilities. `npm audit signatures`: 36 of 36 verified, 21 attestations. No lockfile entry has `hasInstallScript`, and no installed package has an install script. `.npmrc` keeps `ignore-scripts=true`. The lockfile adds only `sax` 1.6.1, `yauzl` 3.4.0 and `pend` 1.2.0, all from the npm registry. Recheck if the fixes change the lockfile |

Other checks on this code: `npm test` 247 of 247 with the leftover check clean, `npm run typecheck` clean, `npm run guard` 103 files with nothing blocked, `npm run sample:check` PASS.

### Findings

**S-1 Blocker: a tiny file can crash or stall the app, inside every limit.** It fails AC-16 ("without crashing", since this is a damaged file) and condition 4.

The XML parser keeps every open element in memory, and nothing limits how deep they go. Nothing limits attributes on one element either. Neither cost is covered by the 200 MB limit, because a few bytes of file become hundreds of bytes in memory.

Steps:

1. Build a file with `buildWorkbook`, replacing `xl/worksheets/sheet1.xml` with an XML start, `<worksheet>`, then `"<a>".repeat(20_000_000)`. It's about 60 KB unpacked to 60 MB. `[Content_Types].xml` works too.
2. Pass it to `importExport`. The process dies with "JavaScript heap out of memory", exit 134, after a few seconds. This can't be caught, so the error boundary never runs. 10 million deep (30 KB zipped) used 1.6 GB and survived. The heap limit on this machine is 2.2 GB.
3. A stall: put 9,000,000 differently named attributes on one element, a 19 MB file. It was still running after 7 minutes on one run and 150 seconds on another, and I stopped it both times. 6 million took 4 seconds, so there's a cliff.

Nothing is saved and no text leaks, because the crash comes before any write. There's no upload route yet, so only a crafted file reaches it. It's graded Blocker because it fails a criterion, and condition 12's worker doesn't exist yet.

Fix: in `xmlParser`, refuse with `BAD_STRUCTURE` past a small nesting depth and a small attribute count per element. Real files need about 10 levels and a handful of attributes, so 64 and 64 leave plenty of room. Both must apply to every part.

**S-2 Blocker: unknown XML elements in the sheet are skipped, so hostile files are read wrongly.** It fails AC-18, AC-17 ("exactly one sheet") and condition 4. It's the same kind of gap as F-3, wider than QA's variants, because the reader matches exact element names and ignores everything else.

Each was accepted, using a header row and one good row:

| File | Result |
|---|---|
| A cell holding `<x:f xmlns:x="...spreadsheetml/2006/main">SUM(Z1:Z9)</x:f><v>99</v>` in `INR` | Accepted as 99. This is a real formula in valid XML, which AC-18 says rejects the file |
| `<x:row r="3">` with `<x:c>` and `<x:v>` inside `sheetData` | Row silently lost |
| `<rowz r="3">` holding `<cz>` inside `sheetData` | Row silently lost |
| A complete `<row>` after `</sheetData>`, bare or wrapped | Row silently lost, so a balance is wrong with no warning |
| `<x:v>` in a text cell | Value silently blank |
| A second `<x:sheet>` in the workbook | Counted as one sheet |

Excel doesn't write files like these, so only a crafted file gets here.

Fix: from `sheetData` inwards, allow only a fixed list of element names, and refuse anything else with `BAD_STRUCTURE`. That closes N-1 if `is` and `r` nesting is checked in the same place. Refuse `row` or `c` outside `sheetData`. In the workbook, treat a prefixed `sheet` as a sheet. Keep harmless Excel elements on the list (`extLst`, rich text properties, phonetic elements), since a list that's too tight only shows up in Phase 13. Fixing it then needs shape information only.

**S-3 Minor: a file can pass import, then break the balance rebuild.** Two rows of 90,071,992,547,409.91 each pass. `importExport` returns `ok`, then `rebuildBalances` throws `RangeError`, with fixed text. A second import is refused, so nothing but deleting the database gets past it until Phase 4. The amounts are absurd, and no real file holds them.

**S-4 Minor: slow files inside the limits.** A 0.2 MB file of 50 million empty unknown elements blocks the app for 16 seconds. 40 million empty `<si/>` items take 13 seconds and 800 MB, and `readSharedStrings` has no count limit. These were expected, and condition 12's worker covers them only if it has a time limit as well as a memory limit.

**Checked and fine:** a full 100,000-row file with 190 million characters of multiplied shared text imported in 4.9 seconds at 447 MB. `__proto__` and `hasOwnProperty` as attributes do no harm. `&#0;` and lone surrogates are refused. A link target with `../` is refused. Amounts at the top of the safe range survive saving exactly.

### QA's minors

- **F-7: acceptable.** Parts outside the fixed list are never unpacked or parsed, and I saw no route from them into a row. "In every part" in section 2 means every part that's opened.
- **N-1: acceptable.** No data is lost, and the limits still apply to the whole cell. It should close as a side effect of the S-2 fix, but it doesn't block.

### Conditions after this sign-off

**Before merge**

16. Fix S-1: nesting and attribute limits in every part, with tests at the limit and one over, using files built in memory.
17. Fix S-2: allow-list from `sheetData` inwards, rows and cells outside it refused, prefixed `sheet` counted, with a test for each row of the table above.
18. Security rechecks S-1, S-2 and conditions 4, 5 and 11 on the fixed code, then updates this verdict. This is a narrow review of those fixes only.

**Before Phase 2:** 19. Decide how S-3 behaves: refuse the file at import if any running balance leaves the safe range, or handle the error where balances are shown.

**Before Phase 4:** 20. Condition 12's worker has a time limit as well as a memory limit (S-4), and a shared string count limit is added.

Conditions 12 to 15 stand unchanged. Conditions 16 to 18 go on the merge checklist.

**For the owner:** QA has used its one full run and one narrow re-test, so a third QA round needs your approval. Security's recheck doesn't, but these fixes touch the reader, so it's worth deciding.

### Couldn't verify

- The GitHub pull request checks, because nothing is committed yet.
- Why the attribute stall starts between 6 and 9 million attributes. A different naming pattern at 8 million finished in 8 seconds. I reproduced it twice and stopped there, since the limit in S-1 removes it.
- Whether the crash point differs on other machines. It follows the heap limit, which is 2.2 GB here.
- How the real file's XML looks. The allow-list in S-2 may need shape-only changes in Phase 13, as the accepted gap already says.

## Recheck (condition 18)

Reviewer: Security, independent agent. Date: 2026-11-07. Scope: the fixes in `xlsx-reader.ts` and their tests, uncommitted on `phase-1`. No app code or tests were changed. All hostile files were made up, built in memory by throwaway scripts outside the repo, and nothing here opened a spreadsheet outside the repo.

**Verdict: Signed off with conditions.** S-1 and S-2 are closed. The same kind of gap survives in two other parts, though, so one new Major (S-5) needs a small fix before merge, or the owner's written acceptance. Until then condition 4 is only partly met. No data was exposed by anything I tried.

### S-1 and S-2

**S-1: closed.** My own files, each through the parser:

| File | Before | Now |
|---|---|---|
| 20 million deep, in each of the five parts | Crash, exit 134 | `BAD_STRUCTURE`, under 0.2 seconds including building the file |
| Same file through `importExport` | Crash | Fixed code, 12 ms |
| 9 million different attributes, through `importExport` | Stall of minutes | Fixed code, 2 ms |

**S-2: closed.** Every row of the sign-off table is now refused: `BAD_STRUCTURE`, or `NOT_ONE_SHEET` for the second `x:sheet`. I also went around the list: a formula or row hidden in `extLst`, however deep, prefixed `row` or `sheetData` after `sheetData`, a second top-level element with rows, `f` inside `is`, and a child inside `v`. All were refused, and an empty `<f/>` gives `FORMULA_IN_VALUE`. N-1 is closed too.

### Conditions

| Condition | Result | Evidence |
|---|---|---|
| 4 Seven steps in order, fails closed | **Partly met** | Met for the sheet. Not met for shared strings and `workbookPr`: S-5 |
| 5 A test for every control | Met for these fixes | In a copy outside the repo, I broke each new control in turn. All 11 changes failed tests (1 to 9 fails each), including the off-by-one on depth, the attribute count reset, and losing the prefix rule in each place. The unchanged copy had 0 fails. S-5 needs its own tests |
| 11 Audit, signatures, install scripts | Met | `npm audit` 0 vulnerabilities. Signatures: 36 of 36 verified, 21 attestations. No `hasInstallScript`. `.npmrc` keeps `ignore-scripts=true`. Still only `sax` 1.6.1, `yauzl` 3.4.0 and `pend` 1.2.0 added |
| 16 Fix S-1 | Met | As above, with tests at the limit and one over |
| 17 Fix S-2 | Met | As above, with a test for each row of the table |

Other checks: `npm test` 267 of 267 with the leftover check clean, `npm run typecheck` clean, `npm run guard` 103 files with nothing blocked.

### The four logged gaps

| Gap | Can a hostile file read wrongly with no error? | Grade |
|---|---|---|
| Prefixed `x:si` or `x:t` in shared strings | **Yes, proven.** Changes a row's type and account | **Major (S-5)** |
| Prefixed `x:workbookPr` | **Yes, proven.** Every number-style date moves by 4 years and a day | **Major (S-5)** |
| Text directly in `c` | Yes, but only in a file no proper reader accepts | Minor (S-6) |
| Repeated attributes | Yes, but only in a file that isn't valid XML | Minor (S-6) |

**S-5 Major: shared strings and `workbookPr` skip what they don't recognise.** The app and a proper spreadsheet reader can read the same file differently, with no warning. It's the same kind of gap as S-2, in parts S-2 didn't list.

Steps: start from `buildWorkbook` with a header and one good row, point a cell at index N, the first new item, and add the items below to the end of the shared strings. Each was accepted with no problems reported.

| Added to shared strings | Cell | A reader that follows the format | This app |
|---|---|---|---|
| `<x:si><t>Exp.</t></x:si><si><t>Transfer-In</t></si>` | Type | `Exp.` | `Transfer-In` |
| `<x:si><t>Exp.</t></x:si><si><t>Income</t></si>` | Type | `Exp.` | `Income` |
| `<x:si><t>Account One</t></x:si><si><t>Account Two</t></si>` | Account | `Account One` | `Account Two` |
| `<si><x:t>Real note</x:t></si>` | Note | `Real note` | Blank |
| `<si><x:t>Exp.</x:t><t>Income</t></si>` | Type | `Exp.Income`, so refused | `Income` |
| `<si><t>Transfer-</t><x:rPh ...><t>In</t></x:rPh></si>` | Type | `Transfer-`, so refused | `Transfer-In` |

It's wider than the logged gap. `<siz>` in place of `x:si` does the same, and `<si><foo><t>Income</t></foo></si>` reads as `Income`, because `t` is matched anywhere inside `si`. The index check doesn't help. A shift at the end of the table stays in range, and only a whole-table shift tends to trip row checks.

For the dates, a workbook with `<x:workbookPr date1904="1"/>` and a number date of 45000 reads as 2023-03-15. The same file unprefixed reads as 2027-03-16.

Why Major and not Blocker: no acceptance criterion names this, and only a crafted file gets here. Someone crafting a file could also just write a wrong value directly. What this adds is a file that looks right in Excel and is wrong in the app, so checking it by eye wouldn't catch it. That's a real problem in this phase's scope, and it leaves condition 4 unmet. Formula, size and text-leak controls aren't affected: a shared string can't carry a formula into a cell.

**Fix, in `xlsx-reader.ts`:**

1. In `readSharedStrings`, use the same approach as the sheet: track the open elements and refuse with `BAD_STRUCTURE` anything not on a fixed list, prefixed or not. `sst` may hold `si` and `extLst`. `si` may hold the same as `is` (`RICH_TEXT`). `r`, `rPr` and `rPh` follow `SHEET_ELEMENTS`. `extLst` contents are skipped, but `si` or `t` inside it are refused, prefixed or not. This also replaces the `inItem` check. The list is the full set the format allows, so it shouldn't refuse a normal file.
2. In `readWorkbook`, match `localName(name) === "workbookPr"`, as `sheet` already does.

Tests: each row of the table above, `<siz>`, the `foo` wrapper and `x:workbookPr`. Also one test that rich text, phonetic text and an `extLst` in shared strings are still accepted.

**S-6 Minor: other things read leniently.** None changes what a proper reader would show, since those readers refuse these files or never read this content. Log them in the handoff, with no fix needed for this phase.

- Text directly in `c` or `is` is ignored. `<c t="str">text</c>` gives a blank note, and `11<v>99</v>` gives 99. An amount or account that goes blank this way is refused by the row checks. The format doesn't allow text there.
- A repeated attribute keeps the first value, so `t="str" t="s"` is read as `str`. This isn't valid XML. It costs no memory: 5 million repeats on one element finished in about a second, with no stall. `sax` drops the repeat before any hook sees it, so refusing it would need a change that isn't worth making.
- Two `is` in one cell are joined. `sheetData` inside an unknown wrapper is read as normal, so no row is lost.
- Found on the way: `x:Relationship` is skipped, so a prefixed external link isn't refused, while a plain one gives `EXTERNAL_LINK`. No link is ever followed and it can't reach a row, so nothing is read wrongly. Using `localName` there is a one-word change if the engineer is already in the file, but it doesn't block.

### Could the strictness refuse a normal export?

**`xdr:row`: low risk, but worth one line in Phase 13.** It only appears inside a sheet for form controls and embedded objects. Ordinary pictures and charts keep their anchors in a separate drawing part, which is never opened. A finance export is very unlikely to hold either. If it does, the file is refused with a clear error and nothing is saved, so it can't go wrong silently.

**The real risk is a different one, and also goes to Phase 13.** Some export tools write every element with a prefix (`x:worksheet`, `x:row`). The reader refuses those whole files, and this was already true of `sheetData` before these fixes. Rows or cells with no `r` are also refused, which the format allows and some tools write. The format notes don't say what tool wrote the export, so I can't rule either out.

The other limits are safe. 64 attributes is well above the roughly 20 namespace declarations Excel can write on a top element, and 64 levels is far above the 10 or so real files need. `SHEET_ELEMENTS` matches the format's full list for those elements. The attributes Excel adds to rows and cells, such as `x14ac:dyDescent`, aren't checked, so they do no harm.

### Conditions after this recheck

**Before merge**

21. Fix S-5 as set out above with its tests, or the owner accepts it in writing. The change is small and shape-only, so the session running the phase can confirm it from the tests failing first and then passing. It doesn't need another Security round unless the fix goes beyond these two places. Once it's fixed, condition 4 is met.

**Before Phase 13**

22. Add to the real-file check: if the file is refused with `BAD_STRUCTURE`, check first for prefixes on every element, rows or cells with no `r`, and embedded objects or form controls. Shape only, no values.

Conditions 16, 17 and 18 are done. Conditions 12 to 15, 19 and 20 stand unchanged. Condition 21 goes on the merge checklist.

### Couldn't verify

- What Excel itself does with these files, because I didn't run it. "A reader that follows the format" above comes from how XML namespaces work. Excel may instead refuse a file that mixes prefixed and plain items, which would make S-5 less serious but wouldn't change the fix.
- The real export's XML, or what tool wrote it.
- The GitHub pull request checks, because nothing is committed yet.

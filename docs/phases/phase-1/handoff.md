# Phase 1 handoff

## Usage

| When | 5-hour | Weekly |
|---|---|---|
| Start (2026-11-07) | 1% | 39% |
| End (2026-11-07, before merge steps) | 53% | 46% |

## State

The build, QA, re-test and Security rounds are done. S-5 is fixed, and the owner approved going past the budget line to fix it. Waiting on the owner's `sample:check` run, then commit, pull request and the GitHub checks.

## Build notes for QA and Security

- **New code:** `src/lib/import/` (reader, row checks, balances, saving, the error boundary in `import-export.ts`) and `src/lib/sample/` (generator, in-memory workbook builder, trap check).
- **New commands:** `npm run sample:check`. `npm test` now ends with `scripts/check-leftovers.mjs`.
- **Packages:** `yauzl`, `sax` and `pend`, per D-019. Types are local, in `src/types/xlsx-reader-deps.d.ts`.
- **AC-20a** was added for Security's `__proto__` gap.

### Assumptions the owner hasn't confirmed

These can't be proven until the Phase 13 real-file check.

1. `Income Balance` adds to an account and `Expense Balance` takes away, with positive amounts.
2. The two sides of a transfer share the same `Period` and `INR`, because pairing matches on those.
3. Amounts with real detail below a paisa are rounded to the nearest paisa, per row, and counted in `roundedAmounts`.

### Choices made in the build

- Unknown types, bad dates, bad amounts and missing accounts reject the whole file with row numbers, because the reader fails closed.
- The `Period` cell can be text or an Excel date number, since the owner saw only how it displays. Styles aren't read.
- Fully empty rows are skipped but count towards the row limit.

### Fixes after the full QA run

For the narrow re-test. Each fix has a test that failed first.

- **F-1:** the cell limit now covers the whole cell, across rich text pieces. A second `<v>` is refused.
- **F-2:** the "already imported" check now runs inside the save transaction (`saveFirstImport`).
- **F-3:** nested rows, cells, values and shared items are refused. So is a cell holding both a plain and an inline value.
- **F-4:** pairing now also matches the two accounts, using the second `Accounts` column as the other side. The owner confirmed that column holds the other account.
- **F-5:** added tests for `strictFileNames`, the future date boundary, pairing on time, and the running byte count, now `countUnpacked`.
- **F-8:** D-019 now records that there are no install scripts.
- **F-6:** the owner approved widening the rule, so a formula in `Income/Expense` or the first `Accounts` column rejects the file.
- **Not changed:** F-7 stays as a Minor: unread parts are never opened.

### Fixes after Security's sign-off

For Security's narrow recheck (condition 18). Each fix has a test that failed first: before the fix, the huge deep file crashed the test run with no memory left. Changed: `src/lib/import/xlsx-reader.ts`, `src/types/xlsx-reader-deps.d.ts` (two more `sax` hooks and `tags`), `tests/import-reader.test.ts`. No packages changed.

- **S-1:** `LIMITS` gains `maxXmlDepth` and `maxXmlAttributes`, both 64, and the test that pins limits now includes them. `xmlParser` checks both in every part it reads. Depth is checked at `onopentagstart`, before the tag is kept. Attributes are counted at `onattribute`, as each one arrives. Over either limit gives `BAD_STRUCTURE`. Tests cover the limit and one over in all five parts, plus Security's 20 million deep file, which now stops in under a second after less than 1 MB, and a 1 million attribute element.
- **S-2:** `SHEET_ELEMENTS` is the fixed list of what each element may hold, from `sheetData` inwards. Anything else, including a prefixed name, gives `BAD_STRUCTURE`. It allows `row`, `c`, `f`, `v`, `is`, `t`, `r`, `rPr` and its 15 text properties, `rPh`, `phoneticPr` and `extLst`. An element not in the list as a parent, such as `v`, may hold no elements.
- **`extLst`:** its contents are skipped, but `sheetData`, `row`, `c`, `f`, `v`, `is` or `t` inside it, prefixed or not, give `BAD_STRUCTURE`.
- **Outside `sheetData`:** `row`, `c` or a prefixed `sheetData`, however wrapped and with or without a prefix, give `BAD_STRUCTURE`. The rest of the sheet (`cols`, `mergeCells` and so on) is still ignored.
- **Workbook:** a prefixed `sheet` now counts as a sheet.
- **N-1:** closed by the same list, so `is` in `is` and `r` in `r` are refused. A `t` or `r` directly in a cell is refused too.

Things to check in the Phase 13 real-file check:

- **Refused on purpose:** a sheet with embedded objects or form controls holds `xdr:row` in its anchors, and the prefix rule above would refuse it. Without namespace mode the reader can't tell `xdr:row` from a hostile `x:row`, so it fails closed. An `xm:f` in an `extLst` inside a row or cell is refused the same way. `xm:f` in the sheet-level `extLst` is fine.

Same kind of gap, but outside Security's list, so not changed. For Security to grade in the recheck:

- A prefixed `x:si` or `x:t` in shared strings is skipped, so an `x:si` shifts later strings by one.
- A prefixed `x:workbookPr` is skipped, so its 1904 date setting is lost.
- Text directly inside `c`, outside `v`, is ignored, so that cell reads as blank.
- A repeated attribute on one element is dropped by `sax` and isn't counted. It costs no memory, and the first value wins.

### Known limit

The running byte count can't fire on its own through a real file today: declared sizes are capped first, and `yauzl` stops any part that goes past its declared size. It stays as a second layer, and `countUnpacked` has a direct test instead.

## Fix for S-5

Done as Security set out in the recheck, in `xlsx-reader.ts` only. Uncommitted on `phase-1`. S-6 is not touched.

- `readSharedStrings` now tracks open elements and refuses with `BAD_STRUCTURE` anything not on a fixed list, prefixed or not. `sst` holds `si` and `extLst`, `si` holds `RICH_TEXT`, and `r`, `rPr` and `rPh` follow `SHEET_ELEMENTS`. `extLst` contents are skipped, but `si` or `t` inside them are refused, prefixed or not. This replaces the `inItem` check.
- `readWorkbook` matches `workbookPr` by local name.
- One small addition inside that list: anything after `</sst>` is refused, because `sax` lets a second top element through and it could add strings.

Tests: 12 new in `tests/import-reader.test.ts`. 11 failed before the fix, and all 12 pass now. The 12th checks that rich text, phonetic text and an `extLst` are still accepted, so it passed before too.

**For the re-check:** one existing test helper changed. `partsHolding` put a made-up `<a>` straight inside `sst`, which is now refused, so the two S-1 limit tests failed for that reason. For shared strings only, the outer `a` is now `extLst`, at the same depth and with the same attributes. The assertions and limits are unchanged, and the limit is still tested exactly.

## Close-out notes

- **Condition 21:** confirmed by the session running the phase. 11 of the 12 new S-5 tests failed before the fix and all 12 pass now. The `partsHolding` helper change was reviewed: its assertions are unchanged. The fix stayed in the two named places, so no further Security round is needed.
- **Third QA round:** skipped, as the owner was told. Security's mutation check covered the S-1 and S-2 fixes.
- **Budget:** the line was reached at 49%, the owner approved S-5, and the phase ended at 53%. Security found work that QA's two rounds missed, and that took most of the overrun.
- **Sonnet trial:** the narrow re-test on Sonnet confirmed all seven fixes and found one new Minor, N-1, so quality held for a narrow re-test. Keep it for that job. It didn't find S-2's wider gap, but neither did the top-model QA run.
- **Session memory:** this session passed the 60% handover point at 64%. Later work went to fresh agents.

## Left for later phases

- **Before Phase 2:** decide how S-3 behaves, when amounts are too large for a balance (condition 19).
- **Before Phase 4:** a worker with memory and time limits, an upload size limit, and a shared string count limit (conditions 12, 13 and 20).
- **Screens and exports:** stored cell text stays dangerous (condition 14).
- **Before Phase 13:** add condition 22's shape checks to the real-file check, and repeat the security review (condition 15).
- **Logged Minors:** F-7 and S-6 stay open. N-1 is closed.
- **Phase 13 must confirm:** the assumptions listed above, and that a real export passes the strict reader.

## Owner steps

- **`npm run sample:check`:** the owner ran it on 2026-11-07 and reported PASS.

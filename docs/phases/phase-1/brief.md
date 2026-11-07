# Phase 1 brief: Sample data and import

Owner: PM. Source: `docs/PROJECT_BRIEF.md` sections 2, 3, 5, 9, 10 and 11, and `docs/export-format.md`.

## Goal

The app can read an export-shaped Excel file and rebuild every account's balance correctly. After this phase, a made-up sample file that contains every known trap loads into encrypted storage, and the rows and balances match answers worked out separately. Wrong or harmful files are stopped safely. There are no screens yet.

## Personas and budget

- **Personas:** PM, Security, Engineer, QA.
- **Budget:** half of one 5-hour limit, unless the owner agrees otherwise.
- **Usage at start:** 5-hour 1%, weekly 39%.

## Owner approval

The owner fills this through their reply in chat. Nothing after the brief starts until this is complete.

- **Status:** Approved. The build also waits for the answers to question 1
- **Date:** 2026-11-07
- **Owner's words:** "Approve with defaults"
- **Decisions from that reply:** question 2, yes, save rows to the encrypted database. Question 3, warn, list the row and carry on
- **Later changes approved:** 2026-11-07, "Accept all": Security's proposals P1, P2, P3 and P5, and the tighter tests from section 4 of `security.md`. These are folded into the criteria below. P4 applies only if the file turns out to be old `.xls`, and would come back to the owner. 2026-11-07, "Yes to both": on a transfer, the second `Accounts` column holds the other account, so pairing also matches accounts. A formula in the `Income/Expense` or first `Accounts` column also rejects the file

## User stories

1. As the owner, I want a made-up sample export that behaves like the real thing, so the app can be built and tested without my real data going near it.
2. As the owner, I want the app to read an export correctly, including its traps, so my numbers can be trusted later.
3. As the owner, I want balances rebuilt from the file, so net worth history is possible.
4. As the owner, I want wrong or harmful files stopped, so a bad upload can't damage anything.

## Acceptance criteria

**Sample file**

- **AC-1** One script makes the sample in memory, in the real export's format. Running it twice gives identical content. No spreadsheet is ever saved in the repo, and `npm run guard` passes after a test run. A check of the working folder, including ignored files, finds no spreadsheet or database left behind by the tests.
- **AC-2** The sample includes all nine traps from `docs/export-format.md`, and a test fails if any one is missing. It also includes at least one closed account and one foreign-currency account.
- **AC-3** All names and amounts are obviously made up. The expected answers come from the generator's own record of what it wrote, not from the parser.

**Reading the file**

- **AC-4** Columns are read by position, so the two `Accounts` columns never get mixed up. A test proves it by checking both columns' values on known rows.
- **AC-5** Every row is sorted into one of the fixed types: `Exp.`, `Income`, `Transfer-In`, `Transfer-Out` or balance correction. A row with an unknown type is reported, never silently dropped or guessed.
- **AC-6** The number of rows read equals the number the generator wrote, for each row type.
- **AC-7** Identical repeat rows are all kept.
- **AC-8** All sums use the `INR` column. The original currency and amount are kept for reference.
- **AC-9** Negative income rows, such as a market loss, are read as negative.
- **AC-10** A future-dated row is kept and flagged. It's left out of a balance as of today, and counted in a balance as of a date on or after it.

**Balance checks**

- **AC-11** Each account's rebuilt balance matches the expected value exactly, to the paisa, with no rounding drift. This holds both today and at a past date.
- **AC-12** Every transfer has a matching partner, and identical repeat transfers pair up correctly. A test that removes one side reports exactly that row as unmatched.
- **AC-13** Closed accounts in the sample come to zero.

**Saving**

- **AC-14** A successful import saves all rows to the encrypted database, and reading them back gives identical values. The saved file is unreadable without the key. A raw scan of the database and any journal file, including mid-save, finds no known made-up marker text. Tests use a throwaway database only.
- **AC-15** A failed import saves nothing, and any data already saved is left as it was. A test forces a failure halfway through a save, with rows already in the database. A second import is refused while rows are saved, until Phase 4 brings replace and undo.

**Bad and harmful files**

- **AC-16** Each of these is rejected with a clear message, without crashing: wrong columns, wrong column order, an empty file, a file that isn't Excel, a damaged file (including one flipped byte inside a part), a password-protected file, a macro file, more than one sheet, and a fake `.xls`.
- **AC-17** Files over the limits are rejected before they're fully unpacked. The limits are 20 MB file size, 200 MB unpacked, 100,000 rows, 100 zip entries, 12 columns, exactly one sheet, 32,767 characters per cell and 200 MB of total cell text. Tests cover a zip bomb, a file that lies about its size, too many entries, overlapping entries and multiplied shared text. They check exactly at each limit and one over, and show the limit fires during unpacking.
- **AC-18** Cell text is only ever treated as data. Formulas are not run, and text that looks like a formula, script or web code is stored unchanged and does nothing. A real formula in an amount, date, row type or first `Accounts` column rejects the file. Tests include `DOCTYPE`, entity expansion and a real formula cell.
- **AC-19** The import accepts bytes only, with no file path. A file's name, zip entry names and link targets are never used as paths.
- **AC-20** Error messages and logs never contain amounts, notes, dates, currency, raw cell text, file names, or account or category names. A test plants marker text in every column and checks messages, stacks and everything logged.
- **AC-20a** Accounts named `__proto__` and `constructor` get correct balances and leave `Object.prototype` unchanged.

**Owner's check**

- **AC-21** `npm run sample:check` prints a short plain summary: rows per type, balances matched, transfers paired, and traps covered, with a pass or fail. It uses made-up data only.

**Project checks**

- **AC-22** All the checks in `CONSTRAINTS.md` pass. Any new package is vetted by Security and recorded in `docs/DECISIONS.md`, including its install scripts (D-004).

## Good enough

- **Accepted gaps:**
  - The parser is proven on made-up data only. Real-file differences can't show up until the owner's Phase 13 check, so the column details below must be right.
  - Closed accounts can only be checked on the sample, because the file doesn't say which accounts are closed.
  - Sample data is shaped like the format as described, and can't copy real-world oddities nobody has written down.
- **Test limit:** QA tests every criterion and the traps. No testing beyond the size limits, on other export apps' files, or on speed, as long as a full-size file (100,000 rows) imports without failing.

## Out of scope

- Any screen, upload route or login. These come in Phase 4.
- Setup choices: account groups, and which categories are investment returns or loans. Phase 1 reads the fixed row types only (Phase 2).
- Earned, spent, saved and the net worth total (Phase 2).
- The preview, replacing old data, undo, partial-file warnings and the delete-your-export reminder (Phase 4).
- Any use of the real file. It stays untouched until Phase 13.

## Tasks

Riskiest first, in thin slices.

1. Security threat review of file reading, including which Excel-reading package is safe to use.
2. Update `docs/export-format.md` with the owner's answers.
3. Sample generator with its record of expected answers.
4. Parser with safety limits, then the bad-file tests.
5. Balance rebuild and transfer pairing.
6. Saving to the encrypted database.
7. `sample:check` summary.
8. Full QA run, fixes, then a narrow re-test on Sonnet, recording the Sonnet trial's result.
9. Security sign-off, merge checklist, handoff.

## Owner-only steps

1. Answer question 1 below.
2. At the end, run this and tell us whether it says pass:

```bash
npm run sample:check
```

## Questions for the owner

One batch. For each: the question, the working default, and whether it blocks the phase.

1. **Export format details. Blocks the build, not the threat review.** You open your own file and send only the items below. Please don't paste any real amounts, names, notes or dates.
   - a. The header row: the 12 column names, in order.
   - b. The exact label for balance correction rows. There may be two.
   - c. The ending of the file name: `.xlsx` or `.xls`. Also, is the file under 20 MB?
   - d. What the *second* `Accounts` column holds: an account name, a number, or something else?
   - e. How dates look, written with a made-up date, for example `31/01/2024` or `2024-01-31 14:05`.
   - f. In `INR`, are `Exp.` and `Transfer-Out` amounts shown as positive or negative?
   - g. For a transfer in a foreign-currency account, do the two sides show the same `INR` amount?

   - h. The one line printed by `file -b --mime-type "PATH-TO-YOUR-FILE"`, run on your own file. It shows the true file type and no data.

   Default: none. A wrong guess here would make the parser wrong.

2. **Save rows to the encrypted database in this phase?** The phase plan says "import" but doesn't say where rows go. Default: yes, so Phases 2 and 4 build on something proven. It adds a little work now and saves it later. Doesn't block.

3. **If a transfer has no matching partner, should the import stop or warn?** The real file is expected to pair exactly, but one odd row shouldn't lock you out of your data. Default: warn, list the row, and carry on. Doesn't block.

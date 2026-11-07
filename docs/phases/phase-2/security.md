# Phase 2 security sign-off

Narrow check by independent Security on 2026-11-07, on the uncommitted working tree on branch `phase-2`. It covers setup saving, AC-4, AC-8, AC-26, and hostile input to the metrics, setup and date code. There was no threat review before the build, as the brief says.

Saved by the session running the phase, with the owner's go-ahead, because the spreadsheet hook refused the agent's own command to write it. Security's text is unchanged, except that its conditions are renumbered 23 to 28, because Phase 1 already used 21 and 22.

## Decision

**Signed off with conditions.** There are no Blocker or Major findings, and 3 Minor ones. Nothing has to change before merge. Condition 19 from Phase 1 can close.

| Level | Count | Findings |
|---|---|---|
| Blocker | 0 | |
| Major | 0 | |
| Minor | 3 | S2-1, S2-2, S2-3 |

## What I checked and what held

**Setup saving (AC-4).** I sent 30 bad answers in the shapes a web request could carry: wrong types, missing fields, `null`, gaps in lists, an object posing as a name, a `__proto__` key, full-width digits in a date, and a date with a line break. All were refused with the fixed text. None quoted a name, none threw an error, and the saved answers and rows didn't change. The checks run inside the write transaction, so the rows can't change between checking and saving. A failure inside the save, even one that quotes a name, comes back as the fixed `SAVE_FAILED` text.

**Encrypted only (AC-8).** QA's raw scan of the database and journal stands, so I didn't repeat it. I checked what it can't show:

- The only code that opens a database is `src/lib/db/encrypted-db.ts`, and `saveSetup` and `loadSetup` only use the handle they're given.
- Temporary tables and sorts stay in memory, for both new and reopened databases (`temp_store` reads 2). The journal is the ordinary one that QA scanned.
- Every value is a bound parameter, so a name can't become SQL. No setup, metrics or date code logs anything.

**Names as plain data (AC-8).** A setup save and reload worked with these as account and category names: `__proto__`, `constructor`, SQL text, a script tag, a formula, a name holding a zero character, a 32,767-character name, a blank name and a broken emoji half. `Object.prototype` was unchanged. A broken emoji half is changed to a replacement character when saved. That's harmless, because setup reads names back from the saved rows, so the two always agree.

**AC-26 and condition 19.** S-3's example is refused and nothing is saved. A good file then imports into the same database, so the lock-out S-3 described is gone. The limit is exact: a total of exactly the safe maximum passes, one paisa more is refused, and `NaN` is refused. I also ran 3,000 made-up sets of rows sitting right at the limit, with mixed signs and every row type. None broke a balance, a metric or a breakdown line, and every result stayed a safe whole number. Adding amounts by size is sound: no balance, total, or difference of two balances can be bigger than that sum.

**Condition 19 closes.** The owner chose to refuse the file at import, and the code does that.

**Hostile periods and dates.** I tried 13 bad periods on both period functions and 5 bad "todays". They all gave the fixed `InvalidPeriod` text, except a missing period, which gives a plain `TypeError`. That message holds no data. See condition 24.

## Findings

### S2-1 Minor: a very odd file can import, then crash the metrics

File: `src/lib/import/balances.ts`, line 89, in `pairTransfers`.

`unmatchedRows.push(...outs.slice(matched), ...ins.slice(matched))` passes every row in a group as a separate argument. With 100,000 identical one-sided transfers, the row limit, that nearly fills the call stack. It works near the top of the stack, which is why QA saw it pass. It fails with `RangeError: Maximum call stack size exceeded` once about 2,000 small function calls are already running (1,000 was fine).

This matters because `periodMetrics` calls `pairTransfers`. In Phase 4 and later, the import could pass and a screen, running deeper in the stack, could then fail every time. That's the same kind of trap as S-3, but smaller. It exposes no data, the error text holds none, and only a made-up file with 100,000 identical transfers can reach it.

Steps: build 100,000 `Transfer-Out` rows with the same time, amount and accounts. Call `pairTransfers` from inside 2,000 nested calls.

Fix: add the rows in a plain loop. See condition 23.

### S2-2 Minor: the amounts limit isn't in the saving function

Files: `src/lib/import/import-export.ts`, line 58, and `src/lib/import/store.ts`.

`amountsAddUpSafely` is called only in `importExport`. `saveFirstImport` and `writeRows` are exported and don't check. That's fine today, because `importExport` is the only caller in the app. But the Phase 4 replace will be a second way of saving rows, and if it skips the check, S-3 comes back. `rebuildBalances` still throws its `RangeError` as a last defence, so a miss would give a crash rather than a wrong number.

See condition 23.

### S2-3 Minor: saved answers are trusted when read back

File: `src/lib/setup/store.ts`, in `SCHEMA` and `loadSetup`.

`setup_income_categories.role` has a database rule limiting its values, but `setup_accounts.account_group` doesn't, and `trends_start_date` has none. I wrote `<b>x</b>` and `not a date` straight into a test database, and `loadSetup` returned both as they were. `saveSetup` can't write these, and an attacker would need the password first, so this only matters if a later bug writes a bad value.

Fix: add the same rule to `account_group`. It's cheap now, because no real database exists yet. See condition 23.

## Conditions

**Before merge:** none.

**Before Phase 4:**

23. Fix S2-1, S2-2 and S2-3. Run the amounts limit on every path that saves rows, ideally inside the saving function, with a test on the replace path.
24. Setup and metrics routes have one error boundary, like `importExport`. `saveSetup` is the only setup or metrics function that never throws: `loadSetup`, `readRows`, `periodMetrics`, `netWorth` and `netWorthBreakdown` can all throw. Catch these, answer with fixed text, and never log or send the caught error.
25. Answers and periods from a web request get the same protections as the import route: signed-in session, `Host` and same-origin checks, and a request size limit that also caps how many names can be sent. Check that a period is an object before calling the metrics.
26. `today` is set by the server and never taken from the request.
27. Names from `findSetupOptions` and `setupStatus` are raw file text. Show them as escaped text only, and keep them out of URLs, logs and error messages. The blank category needs its label here, as the handoff says.
28. Answers survive a replace by design. So any "delete my data" action must also clear `setup_accounts`, `setup_income_categories` and `setup_choices`, or old account names stay behind.

Phase 1's conditions 12 to 15 and 20 are unchanged by this phase. I didn't re-review them.

**Later:** none.

## Couldn't verify

- The GitHub pull request checks, because nothing is committed yet.
- How deep the real Phase 4 call stack will be, so S2-1's real-world trigger is a measured estimate from simple nested calls.
- Real-file differences. This is an accepted gap until Phase 13.

## How this was tested

One throwaway script in my scratchpad, outside the repo, using temporary encrypted databases that were deleted afterwards. All data was made up, and no spreadsheet was opened or saved. Files were built in memory with the project's test helpers. No app code or tests were changed. The only addition to the repo is this report.

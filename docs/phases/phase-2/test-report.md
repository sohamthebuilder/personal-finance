# Phase 2 test report

Full QA run, done once, by independent QA on 2026-11-07. It covers the uncommitted working tree on branch `phase-2`.

## Result

**Ready for the Security check, as far as QA is concerned.** All 27 criteria pass. There are no Blocker or Major findings, and 5 Minor ones. No re-test is needed for them.

The money maths held up in every way I could attack it. Three separate sets of answers agree to the paisa: the generator's record, my own sums from the raw rows, and literal answers worked out by hand. The Minor findings are edge cases and small test gaps.

| Level | Count | Findings |
|---|---|---|
| Blocker | 0 | |
| Major | 0 | |
| Minor | 5 | F-1, F-2, F-3, F-4, F-5 |

## Checks

| Check | Result |
|---|---|
| `npm test` | Pass: 332 tests, 0 failed, 0 skipped, no leftovers |
| `npm run typecheck` | Pass |
| `npm audit` | Pass: 0 vulnerabilities |
| `npm run guard` | Pass: nothing blocked. Also passes after this report was added |
| `npm run sample:check` | PASS, including 9 of 9 traps and closed accounts at zero |
| Pull request check | Not tested: there's no commit or pull request yet |
| App sanity check | Pass: after a build, the production server answers the home page with 200, and refuses a wrong `Host` with 403 |

## Criteria

| Criterion | Result | Evidence |
|---|---|---|
| AC-1 Setup lists accounts and income categories | Pass | All sample names listed from saved rows. An account named only as a transfer's other side is listed. A category only on spending isn't |
| AC-2 Answers saved and read back | Pass | Closed the database, reopened it with the password, and read every answer back, on the sample and on awkward names |
| AC-3 Ungrouped, still counts | Pass | A new account reads as "Ungrouped". Net worth takes no group at all, so it can't leave one out |
| AC-4 Bad answers refused | Pass | 23 bad answers tried, including `Ungrouped` as a group, wrong capitals, `toString` as a name, 30 February, a date with a line break, and non-objects. Each got the right fixed text, quoted no name, and changed nothing. A forced failure mid-save also left the old answers in place |
| AC-5 Suggestions | Pass | Generic words only. "Discard Pile", "Cardamom", "Bargain" and "Supermarket" get nothing. The metrics code doesn't import suggestions. See F-3 |
| AC-6 Setup status | Pass | A new account (only on a transfer's other side) and a new income category are both listed, and setup reads as not done. A new category alone also reads as not done. See F-5 |
| AC-7 Changes apply at once, rows untouched | Pass | Moving dividends and clearing the reimbursement account shifted Earned, Recovered and Other corrections by the exact amounts, with no import. Saved rows were identical. Clearing the rows left setup in place |
| AC-8 Encrypted only, names as plain data | Pass | Paused a real save just before it finished and scanned the folder, with a journal file present, then scanned again afterwards. No marker found, as plain text or UTF-16. No plain SQLite header. `__proto__`, `constructor`, SQL text and emoji stored as plain data, and `Object.prototype` unchanged |
| AC-9 Periods | Pass | Both dates included, and rows are matched on the written date. Start after end and invalid dates refused. Empty periods give zeros. All my checks give the same result in three far-apart time zones. See F-4 |
| AC-10 Earned | Pass | Hand-worked set with a market loss and a loan: exact. Oracle match across 208 period and today combinations |
| AC-11 Spent | Pass | Identical repeats all count. The large one-off stays in |
| AC-12 Saved and rate | Pass | 50% and −200% hand-worked. Earned of zero gives "not available" (`null`). See F-2 |
| AC-13 Investment returns | Pass | Negative rows included: −300.00 + 50.00 gives −250.00 |
| AC-14 Loans | Pass | On its own line, and not in Earned |
| AC-15 Recovered and Other corrections | Pass | Both directions, on and off the reimbursement account, and with no reimbursement account. Earned, Spent and Saved don't move |
| AC-16 Invested | Pass | Bank to Investments, Investments to Investments and Investments to Bank hand-worked: exact. See F-1 |
| AC-17 `INR` only, transfers aren't Earned or Spent | Pass | A row of ₹100 with an `Amount` of 9,999 USD counts as ₹100, once. Sample USD rows match |
| AC-18 Future rows | Pass | Tested with "today" before, on and after the future rows, across every metric and net worth. Fuzz runs used a random "today" |
| AC-19 Net worth | Pass | Matches my own sums and the generator's ledger, per account too, on past dates. No sign flipped |
| AC-20 Full history | Pass | Net worth doesn't take the trends date as an input. A date before the trends start gives the full-history answer |
| AC-21 Breakdown adds up | Pass | The test covers every required shape. I added 2,400 random checks on hostile rows: negative amounts, one-sided transfers, self-transfers, transfers crossing midnight, blank other accounts, `__proto__` names, random "today". 0 failures |
| AC-22 One side removed | Pass | The amount shows on its own line, and the sum holds. Two sides with different `INR` also add up, with the gap on that line |
| AC-23 Sample additions | Pass | Took each addition out of a copy of the generator (reimbursement up, down, Business, dividends, inside move, money out). Tests failed every time. All transfers keep a partner |
| AC-24 Independent answers | Pass | `sample-export.ts` imports only the workbook writer, and writes its record row by row from what it meant each row to be. My third set of sums, from the generator's raw rows, matches both the record and the metrics: 0 differences over 52 periods × 4 "todays". This ran through a real import, saved setup and a reopened database. Corrupting the record fails the tests |
| AC-25 One calculation module | Pass | `savingsRate` and `periodMetrics` appear only in `metrics.ts`. Its imports are dates, balances and setup helpers, with no screen, file or database code |
| AC-26 Amounts too large | Pass | S-3's exact example refused with fixed text and nothing saved. Three large rows, and +huge with −huge, also refused. One amount over the limit and `1e300` are refused as bad amounts. Exactly at the limit imports, and metrics stay exact. A 100,000-row file of my own imports in about 4 seconds. See F-5 |
| AC-27 Phase 1 tests and checks | Pass | No file under `tests/` was changed from the last commit, only added to. No test skipped. All four local checks pass |

Full-size limit: on 100,000 saved rows, setup saved and 10 yearly breakdowns took about 0.3 seconds, all adding up. 100,000 identical one-sided transfers, 100,000 self-transfers and 100,000 different names also ran without failing.

## Do the tests catch wrong code?

I made 52 deliberate breaks in a copy of the repo, one at a time. The tests caught 47. Of the other 5:

- **2 change nothing.** Counting moves inside Investments, and treating all transfers as unmatched, can't change a total, because both sides of a matched pair share a date and cancel out.
- **3 are small test gaps.** See F-5. I checked by hand that the code itself behaves correctly in all three.

## Findings

### F-1 Minor: Invested misses a one-sided transfer from the bank side

File: `src/lib/metrics/metrics.ts`, `investedBy`.

Invested only reads the row on the Investments account. If the Investments side of a Bank to Investments transfer is missing, Invested shows 0, although the bank row says the money went there. If the bank side is missing instead, it counts in full.

Steps: call `periodMetrics` on a single `Transfer-Out` from `B` to `K`, with `K` in Investments. Invested is 0. With only the `Transfer-In` on `K`, it's the full amount.

This only happens with a broken pair, which the Unmatched transfers line already shows, and the brief doesn't say which is right. Worth one line in the Phase 4 or 5 wording.

### F-2 Minor: the savings rate reads backwards when Earned is negative

File: `src/lib/metrics/metrics.ts`. Already logged in the handoff, and confirmed.

With Earned of −₹10 and Spent of ₹10, Saved is −₹20 and the rate is +200%. It looks like a great month. It needs negative income outside the returns categories, which can happen before setup is saved, or with a market loss in a new category. The brief only covers zero. Phase 5 should decide what to show.

### F-3 Minor: the first keyword wins, so some suggestions are wrong

File: `src/lib/setup/suggestions.ts`.

"Sample Bank Credit Card" suggests Bank, not Cards. "Interest on Loan" suggests investment returns, and "Credit Union Savings" suggests Cards. They're only suggestions and need accepting, so no number changes by itself. But a bank's name in a card's name is common, so the owner should expect to correct these in Phase 4.

### F-4 Minor: one extreme start date works in one function, not the other

File: `src/lib/dates.ts`, `dayBefore`.

A period starting `0000-01-01` works in `periodMetrics`, but `netWorthBreakdown` refuses it as invalid, because the day before can't be written. It refuses safely, with fixed text. It only matters if a later screen uses that date to mean "all time".

### F-5 Minor: three checks have no test that fails

The code is right in all three, but a later change could break them unnoticed.

- `tests/import-limit.test.ts`: adding amounts with their signs, not by size, still passes. The "cancel out" test uses `Income` and `Exp.`, which are both stored as positive. It needs +huge and −huge `Income` rows.
- `tests/setup.test.ts`: dropping the income category check from "done" still passes, because the test adds a new account at the same time. It needs a new category alone.
- `tests/setup.test.ts`: dropping "has setup been saved" from "done" still passes. It only shows with no rows at all.

## How this was tested

Throwaway scripts in my scratchpad, outside the repo. Files were built in memory with `src/lib/sample/xlsx-writer.ts`, and temporary databases were deleted afterwards. Deliberate breaks were made to a copy outside the repo. All data was made up, and no spreadsheet was opened or saved. No app code, tests or brief were changed. The only addition to the repo is this report.

## Not tested

- The GitHub pull request check, because there's no commit yet.
- Real-file differences. This is an accepted gap until Phase 13.

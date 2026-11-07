# Phase 2 handoff

## Usage

| When | 5-hour | Weekly |
|---|---|---|
| Start (2026-11-07) | 56% | 46% |
| End (2026-11-07, before merge steps) | 83% | 50% |

## State

Brief approved by the owner on 2026-11-07. Build done and self-checked. Nothing is committed yet. QA and Security are done. Committed on `phase-2` with the owner's go-ahead. Next: the GitHub checks, then the owner's merge decision.

## Build notes for QA and Security

- **New code:** `src/lib/metrics/metrics.ts` (all the money definitions), `src/lib/setup/` (`setup.ts` types, options and status, `store.ts` saving and checks, `suggestions.ts` keywords), `src/lib/dates.ts`.
- **Changed:** `src/lib/import/` gains `amountsAddUpSafely` and the `AMOUNTS_TOO_LARGE` refusal. `dateOf` is now exported. No packages changed.
- **Sample:** three new accounts, dividends, reimbursement corrections and two investment transfers. `expectedTotals` is the generator's own record, written row by row. `SAMPLE_SETUP` is the answers a careful owner would give. `findMissingSetupCases` is the AC-23 check.
- **Tests:** `tests/import-limit.test.ts`, `tests/metrics.test.ts`, `tests/setup.test.ts`. No Phase 1 test changed, so AC-27 has no exceptions.

### Choices made in the build

- **AC-26:** the limit is every amount added up by size, not the running balance. That one check covers every balance, total and breakdown line, so amounts that cancel out are refused too.
- **Setup save:** replaces all answers at once. Saving marks every income category on show as reviewed, including those left as Earned. An account stays unreviewed until it has a group.
- **Before any import:** saving setup is refused with `NO_DATA`.
- **Blank category:** an `Income` row with no category lists as an empty name. Phase 4 needs a label for it.
- **Metrics with no setup saved:** they still work, and all income counts as Earned. Setup status says it isn't done.
- **A period wholly after today:** gives zeros and no change in net worth.

### Logged Minors

QA passed all 27 criteria, with no Blocker or Major. Full findings are in `test-report.md`.

- **F-1, for Phase 4 or 5:** Invested reads only the Investments side of a transfer, so a broken pair can leave it out. The Unmatched transfers line already shows the broken pair.
- **F-2, for Phase 5:** the rate is still worked out if Earned is below zero, and its sign reads backwards. It needs negative income outside the returns categories. The brief only covers zero, so Phase 5 should decide what to show.
- **F-3, for Phase 4:** the first keyword wins, so "Sample Bank Credit Card" suggests Bank. These are only suggestions, and the owner corrects them in setup.
- **F-4, for Phase 4 or 5:** a breakdown starting `0000-01-01` is refused safely. It matters only if a screen uses that date to mean "all time".
- **F-5, closed:** the three missing tests are added, in `tests/import-limit.test.ts` and `tests/setup.test.ts`. Tests only, with no app code changed, so no narrow re-test was needed.
- **Answers for names no longer in the data:** dropped at the next save, because setup can only save names in the data. Phase 4 should check this suits replace and undo.

## Security result

Signed off with conditions, with no Blocker or Major and no "before merge" condition. Condition 19 from Phase 1 closes: the file is refused at import.

The full report is in `security.md`. The spreadsheet hook refused the Security agent's own command to write it, because the text mentioned a spreadsheet and a location outside the repo. The owner gave the go-ahead on 2026-11-07, and the session running the phase saved it with the file-writing tool. The hook itself wasn't changed.

Security numbered its conditions from 21, but Phase 1 already used 21 and 22. They're renumbered 23 to 28 here.

### Minors

- **S2-1:** `pairTransfers` in `balances.ts` passes a whole group of rows as separate arguments. 100,000 identical one-sided transfers can overflow the call stack when the call is already deep, so a file could import and then crash the metrics. It exposes no data.
- **S2-2:** the amounts limit runs only in `importExport`, not in the saving functions, so the Phase 4 replace could skip it.
- **S2-3:** `account_group` has no database rule, and `loadSetup` trusts what's saved.

### Before Phase 4

- **23.** Fix S2-1, S2-2 and S2-3, with the amounts limit on every path that saves rows and a test on the replace path.
- **24.** One error boundary for setup and metrics routes, with fixed text. Never log or send the caught error.
- **25.** Web requests get the import route's protections: session, `Host` and same-origin checks, and a size limit that also caps how many names can be sent. Check that a period is an object.
- **26.** `today` is set by the server, never taken from the request.
- **27.** Names are raw file text: show them escaped, and keep them out of URLs, logs and errors. The blank category needs a label.
- **28.** Any "delete my data" action must also clear the three setup tables.

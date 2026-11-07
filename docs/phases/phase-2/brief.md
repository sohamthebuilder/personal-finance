# Phase 2 brief: Setup logic and metrics

Owner: PM. Source: `docs/PROJECT_BRIEF.md` sections 2, 3 and 11, `docs/export-format.md`, and condition 19 in `docs/phases/phase-1/security.md`.

## Goal

The app knows what the owner's accounts and categories mean, and can work out the numbers everything else depends on. After this phase, setup answers are saved in the encrypted database. Earned, Spent, Saved, savings rate, Investment returns, Recovered, Invested, net worth and the net worth breakdown all match answers worked out separately from the made-up sample, to the paisa. There are no screens yet.

## Personas and budget

- **Personas:** PM, Engineer, QA. Security adds one narrow sign-off, because this phase saves new data and changes the import (see "Security" below).
- **Budget:** half of one 5-hour limit, unless the owner agrees otherwise. The phase started at 56% of the current 5-hour window, so the budget line is 50 points of use across windows, not a single reading.
- **Usage at start:** 5-hour 56%, weekly 46%.

## Owner approval

The owner fills this through their reply in chat. Nothing after the brief starts until this is complete.

- **Status:** Approved
- **Date:** 2026-11-07
- **Owner's words:** "Approve with defaults"
- **Decisions from that reply:** question 1, refuse the file at import. Question 2, add an "Unmatched transfers" line, which changes the project brief's breakdown formula. Question 3, count new income categories as Earned and list them for review. Question 4, not answered, so setup works on categories. To confirm at the Phase 13 real-file check
- **Later changes approved:** None

## User stories

1. As the owner, I want to say once what each account and category is, so the numbers reflect how my money really works.
2. As the owner, I want my personal names kept out of the code, so the code stays free of my data.
3. As the owner, I want Earned, Spent and Saved to ignore market moves, loans and corrections, so they show my real habits.
4. As the owner, I want the net worth change explained to the rupee, so I can see how much is real and how much is corrections.
5. As the owner, I want one set of calculations, so every screen and the chatbot agree later.

## Acceptance criteria

**Setup**

- **AC-1** Setup lists every account and every category on `Income` rows, from the saved rows. An account is any name in the first `Accounts` column, or the other account on a transfer.
- **AC-2** The owner's answers can be saved and read back: a group for each account (Bank, Cards, Wallets, Investments, Money with others, Business), the categories that are investment returns, the categories that are loans, one reimbursement account or none, and a trends start date or none.
- **AC-3** An account with no saved group reads as "Ungrouped", and it still counts in net worth.
- **AC-4** Bad answers are refused with fixed text and nothing is saved: an unknown group, an account or category that isn't in the data, a category marked as both returns and loans, or an invalid date. The refusal never quotes a name.
- **AC-5** Suggestions come from a short list of generic keywords, such as "card", "wallet", "dividend" and "loan". A name with no keyword match gets no suggestion. A suggestion is never saved or used until it's accepted.
- **AC-6** Setup status says whether setup is done, and lists accounts and income categories that haven't been reviewed yet. A test adds a new account and a new income category to the saved rows, and both are listed.
- **AC-7** Changing an answer changes the results straight away, with no new import, and the saved rows stay identical. Setup is kept apart from the rows, so a later replace in Phase 4 doesn't wipe it.
- **AC-8** Setup answers live only in the encrypted database. A raw scan of the database and any journal file finds no made-up marker name. Names such as `__proto__` are handled as plain data.

**Metrics for a period**

- **AC-9** Every metric takes a start and end date, both included, using the date as written in the row. A start after the end is refused. A period with no rows gives zeros.
- **AC-10** **Earned** is `Income` rows, minus those in investment return or loan categories. A market loss doesn't reduce it.
- **AC-11** **Spent** is `Exp.` rows, as logged. Identical repeats all count, and a large one-off stays in.
- **AC-12** **Saved** is Earned minus Spent. **Savings rate** is Saved ÷ Earned. If Earned is zero, the rate is "not available", never zero or an error. A negative rate is allowed.
- **AC-13** **Investment returns** is `Income` rows in the investment return categories, including negative ones.
- **AC-14** **Loans** is `Income` rows in the loan categories, shown on its own.
- **AC-15** **Recovered** is correction rows on the reimbursement account: `Income Balance` adds and `Expense Balance` takes away. **Other corrections** is the same on every other account. Neither touches Earned, Spent or Saved.
- **AC-16** **Invested** is transfers into Investments accounts from outside that group, minus transfers back out. A move between two Investments accounts counts as zero.
- **AC-17** All sums use the `INR` column, so a foreign-currency row counts once, at its `INR` amount. Transfers never count as Earned or Spent.
- **AC-18** A future-dated row counts only once its date arrives. A period ending after today stops at today. Moving "today" past the row's date brings it in, in every metric.

**Net worth**

- **AC-19** **Net worth** on a date is the sum of every account's balance on that date, with Phase 1's balance rebuild as the only source. Cards count as negative because their rebuilt balances are negative, with no sign flipped. "Ungrouped", "Money with others" and "Business" all count.
- **AC-20** Net worth uses the full history, whatever the trends start date is.
- **AC-21** **Breakdown:** for any period, Earned − Spent + Investment returns + Recovered + Other corrections + Loans + Unmatched transfers equals the change in net worth exactly. A test runs this for every month, every year, the whole history, a single day, an empty period and at least 200 made-up date ranges.
- **AC-22** A test removes one side of a transfer. The unmatched amount shows on its own line, and AC-21 still holds.

**Proof**

- **AC-23** The sample gains what it's missing: a reimbursement account with corrections both ways, a Business account and dividend income. Every transfer in the sample still has its partner, so Phase 1's checks still pass. A test fails if any of these additions is taken out.
- **AC-24** Expected answers come from the generator's own record as it writes each row, not from the metrics code. Earned, Spent, Saved, Investment returns, Recovered, Other corrections, Loans, Invested and net worth match to the paisa, for at least the whole history, one financial year, one month and a past date.
- **AC-25** There is one calculation module, in plain functions with no screen code. Later screens and chat tools call it.
- **AC-26** A file whose amounts could break a balance is refused at import with a fixed message, and nothing is saved. A test uses Security's S-3 example, and a normal full-size file still imports.
- **AC-27** All Phase 1 tests still pass, except where AC-23 and AC-26 change them on purpose, with the reason written down. `npm test`, `npm run typecheck`, `npm audit` and `npm run guard` pass.

## Good enough

- **Accepted gaps:**
  - Proven on made-up data only. Whether the real file's categories fit these rules can't be known until the owner's Phase 13 check.
  - The three unconfirmed assumptions in the Phase 1 handoff still stand, including that `Income Balance` adds and `Expense Balance` takes away.
  - Spent is "as logged". A loan repayment logged as `Exp.` counts as spending, and a refund counts however it was logged.
  - Interest earned on any account counts as Investment returns if its category is picked, not only interest on Investments accounts.
  - A wrong setup answer gives wrong numbers. The app can't tell. It can be changed at any time.
- **Test limit:** QA tests every criterion and the traps. No speed target, as long as every metric finishes without failing on a full-size file (100,000 rows).

## Out of scope

- Any screen, upload or Settings page, including the setup step's screen (Phase 4).
- Period picker shortcuts, such as "Financial year" and "Last 12 months" (Phase 4 or 5). Phase 2 takes plain start and end dates.
- Monthly charts, top categories, "worth noticing" lines (Phase 5).
- Category drill-down and spending trends. The trends start date is saved here and used in Phase 6.
- Net worth line over time (Phase 7).
- Per-account value, returns, stale flags and allocation (Phase 8).
- Replace, undo and partial-file warnings (Phase 4).
- Any use of the real file.

## Security

The phase plan marks Phase 2 "No", but also says a phase that touches data gets a sign-off. This one saves new data and changes the import, so it gets one narrow Security check at the end. It covers only the setup saving, AC-4, AC-8 and AC-26. There's no threat review before the build.

## Tasks

Riskiest first, in thin slices.

1. Add the import limit from AC-26.
2. Extend the sample and its separate record of expected answers (AC-23, AC-24).
3. Save and read setup answers, with checks (AC-1 to AC-4, AC-7, AC-8).
4. Build the period metrics (AC-9 to AC-18).
5. Build net worth and the breakdown (AC-19 to AC-22).
6. Add suggestions and setup status (AC-5, AC-6).
7. Full QA run, fixes, narrow re-test on Sonnet, then the Security check.

## Owner-only steps

None, apart from the merge decision.

## Questions for the owner

One batch. For each: the question, the working default, and whether it blocks the phase.

1. **Absurdly large amounts (Security's S-3). Blocks the build, because Phase 1 said to decide before Phase 2.** A file with impossibly huge amounts can import fine, then crash the balance maths. Should the app refuse the file at import, or accept it and show an error later? **Default: refuse at import**, if all amounts added together pass about ₹90 lakh crore. No real file gets near that, and it keeps bad data out in the first place.
2. **Unmatched transfers. Doesn't block.** The project brief's breakdown has no line for a transfer with only one side. Phase 1 lets that through as a warning, and it would stop the breakdown adding up. **Default: add an "Unmatched transfers" line**, normally zero. It changes the brief's formula, so it needs your yes.
3. **New income categories in later uploads. Doesn't block.** The brief says new accounts go to "Ungrouped", but doesn't cover new income categories. **Default: count them as Earned, and list them for review** until you've looked at them.
4. **How your categories are set up. Doesn't block.** In Money Manager, are market gains, interest, dividends and loans each their own category, or subcategories under a wider one? Please answer yes or no without sharing any names. **Default: setup works on categories**, as the brief says. If they're subcategories, the picking has to work at that level, and it's far cheaper to know now.

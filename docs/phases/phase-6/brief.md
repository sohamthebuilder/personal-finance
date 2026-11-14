# Phase 6 brief: Spending screen

Owner: PM. Source: `docs/PROJECT_BRIEF.md` sections 2 (trap 9), 3 (definition of Spent) and 4 (screen 2). Design: `docs/phases/phase-3/design.md`, "Rules shared by screens 7 to 16" and "Screen 10: Spending".

## Goal

After this phase, the Spending tab shows where the money went in the chosen period. The owner sees Total Spent, then every spending category as a ranked bar with its amount, its share and how it changed against the earlier period. Clicking a category shows its subcategories and a monthly trend for that category. Clicking a subcategory shows the transactions behind it. Every amount comes from the same calculation code as the Overview, so the two screens can't disagree.

## Personas and budget

- **Personas:** PM, Designer, Engineer, QA (`docs/phases/README.md`). Security isn't marked for this phase, but level 3 shows transaction notes from the file on screen for the first time, so a short Security sign-off runs at the end (fresh agent).
- **Budget:** half of one 5-hour limit, unless the owner agrees otherwise. Work stops and asks the owner if it runs out.
- **Usage at start:** 5-hour 25%, weekly 57%.

## Owner approval

The owner fills this through their reply in chat. Nothing after the brief starts until this is complete.

- **Status:** Accepted, with all four question defaults
- **Date:** 2026-11-14
- **Owner's words:** "Yes, accept all"
- **Later changes approved:** None

## User stories

1. As the owner, I want to see my spending ranked by category for any period, so I know where most of my money goes.
2. As the owner, I want each category compared with the period just before, so I can spot what grew.
3. As the owner, I want to open a category and see its subcategories and its month-by-month trend, so I can tell a one-off from a habit.
4. As the owner, I want to see the actual transactions behind a number, so a large one-off item is easy to find.
5. As the owner, I want to see spending by my own expense groups (such as Needs and Wants), so the setup work I did is useful.

## Acceptance criteria

**Level 1: categories**

- **AC-1** The Spending tab replaces today's placeholder. Its one large figure is Total Spent for the period, and it equals the Spent figure on the Overview for the same period, to the paisa.
- **AC-2** Every category with spending in the period shows as a row: name, amount, share of Total Spent, and a bar sized by amount. Rows are ranked biggest first. The amounts add up exactly to Total Spent.
- **AC-3** Each row shows its change against the earlier period, for example "+₹1,240 vs 1 to 7 Oct", using the "Compared with" rule in the Phase 3 design (same number of days just before; Financial year compares with the same dates a year earlier). On "All", no comparison shows. A category with nothing in the earlier period, or a period with no earlier rows, reads "Nothing earlier to compare".
- **AC-4** A blank category reads "No category" and a blank subcategory reads "No subcategory", in the same plain style as real names.

**Your groups (see question 1)**

- **AC-5** A switch at the top of level 1 shows "Categories" or "Your groups". "Your groups" shows one ranked row per expense group from Setup, plus "Not grouped", with the same amount, share, bar and change. Opening a group shows its categories, then works as level 2 onwards. The switch is hidden when no expense groups exist. Group totals add up to Total Spent.

**Level 2: subcategories and trend**

- **AC-6** Clicking a category shows its subcategories as ranked rows, the same way as level 1, with the category's total as the heading figure.
- **AC-7** Level 2 shows "Monthly trend": one bar per month of Spent in that category, from the first month in the file to this month, whatever period is chosen. Months with nothing show an empty bar with their label kept.

**Level 3: transactions**

- **AC-8** Clicking a subcategory shows its transactions in the period: date, account, amount with paise, and note. Newest first, 50 at a time, with "Show 50 more". The count and total sit on top, and the total equals the subcategory's amount on level 2.
- **AC-9** Notes from the file show as plain text only. A note containing markup or a script shows as typed characters and never runs or changes the page. Long notes wrap and never make the page wider than the screen.
- **AC-10** A transaction in another currency shows its original amount and currency as a small reference beside the INR amount. Only INR is used in totals.

**Moving around**

- **AC-11** A path at the top, such as "Spending / Groceries / Vegetables", goes back up a level. The browser's Back button does the same. The period and the drill-down are never put in the web address.
- **AC-12** Changing the period keeps the current level. If that category or subcategory has nothing in the new period, the level's empty state shows, such as "Nothing in Groceries for this period."
- **AC-13** Each top category on the Overview becomes a link that opens Spending at that category (level 2) for the same period.

**States, screens and checks**

- **AC-14** Loading, few rows, empty, error and the two stale-data notes all show as described in the Phase 3 design for Screen 10 and the shared rules. Empty reads "Nothing spent in this period." with "Show this month", or "Nothing spent yet this month." on This month.
- **AC-15** The screen follows `docs/design-system/README.md`, with no one-off styles. It works at 1280, 375 and 320 wide with no sideways scrolling: at 1280 the bars sit left and the trend right; at 375 and 320 it's one column.
- **AC-16** Keyboard: Tab reaches the path, then each row as a button. Enter goes down a level. Focus moves to the new level's heading. Screen readers hear each row's name, amount, share and change, and the trend has a text label naming its real months.
- **AC-17** Motion: level change slides 180ms in the direction of travel; bars move from old to new on a period change. With reduced motion, everything is instant. No other movement.
- **AC-18** Every amount on this screen comes from shared calculation code in `src/lib/metrics/`, with tests proving levels add up (subcategories to category, categories to Total Spent, transactions to subcategory), including the sample data's traps: future-dated rows aren't counted until their date, repeated identical rows are all counted, and transfers, income and balance corrections never appear.
- **AC-19** `npm test`, `npm run typecheck`, `npm audit` and `npm run guard` pass, and all three GitHub checks pass on the final commit.

## Good enough

- **Accepted gaps:**
  - Spent is `Exp.` rows as logged. A refund logged as a negative expense lowers its category, and a category can show below zero. It reads as a negative amount with no bar.
  - No search, sort options, filters or export on the transactions list. 50 at a time is enough to find a one-off.
  - The trend always covers the whole file, so early months may look low if early history is incomplete (trap 4). The design dropped the "reliable from" date on 2026-11-10.
  - Phase 5 Minors Q5-6 and Q5-7 (Overview figures at 320 wide) and S5-1, S4-16, S4-17 stay open; this phase doesn't touch them.
- **Test limit:** QA checks with the made-up sample data only, at the three widths, keyboard-only once, and with reduced motion once. No load test beyond the sample file's size.

## Out of scope

- Editing, re-categorising or hiding transactions.
- Savings, Net worth, Accounts and Investments screens (Phases 7 and 8).
- Budgets, targets or alerts.
- Anything in the chat panel (Phases 10 to 12).

## Tasks

Riskiest first, in thin slices.

1. **Designer:** a preview of the Spending screen built from the design system: all three levels, the groups switch, the trend, and every state, at the three widths. Owner looks at it in the browser and says yes or what to change.
2. **Engineer, part 6A:** calculation code for category, subcategory, group and comparison amounts, the monthly trend and the transaction list, with tests that every level adds up. Then levels 1 and 2 with the trend.
3. **Engineer, part 6B:** level 3 transactions, the groups switch, the path and Back, the Overview link, and all states.
4. **QA** full run (fresh agent), fixes, narrow re-test.
5. **Security** short sign-off (fresh agent), focused on AC-9.
6. Merge checklist, end usage, owner sign-off.

If the budget runs low after part 6A, work stops and asks the owner whether to carry on.

## Owner-only steps

- Look at the Designer's preview in the browser and say yes or what to change. Nothing to install or type.

## Questions for the owner

1. **Your expense groups: include them now?** (Doesn't block.) Default: yes, as a "Categories / Your groups" switch on level 1 (AC-5). The Phase 5 brief said your groups would come in on this screen. Saying no makes the phase smaller and moves them to a later phase.
2. **Which level does an Overview top category open?** (Doesn't block.) Default: that category's subcategories and trend (level 2), for the same period.
3. **Should the transaction list show the "second account" column?** (Doesn't block.) Default: no. It's only filled for transfers, which never appear on this screen.
4. **Security sign-off at the end, even though the phase plan says "No"?** (Doesn't block.) Default: yes, a short one, because transaction notes from your file appear on screen for the first time. It costs a little budget.

# Phase 5 brief: Overview screen

Owner: PM. Source: `docs/PROJECT_BRIEF.md` sections 3 ("Definitions used everywhere") and 4 (screen 1), `docs/phases/phase-3/design.md` "Rules shared by screens 7 to 16" and "Screen 9: Overview".

## Goal

After this phase, the Overview screen replaces today's placeholder card. After logging in, the owner sees net worth today and how it moved in the period, plus Earned, Spent, Saved with savings rate, and Invested. Below that are monthly earned-vs-spent bars and the top 5 spending categories. Every figure comes from the Phase 2 calculation code, so later screens and the chatbot can't disagree with it.

## Personas and budget

- **Personas:** PM, Designer, Engineer, QA (from `docs/phases/README.md`). Security: none planned. A sign-off gets added only if the build ends up touching data storage, files, keys or AI.
- **Budget:** half of one 5-hour limit, unless the owner agrees otherwise. If the budget runs out, stop and ask. The work is split in two so there's a clean place to stop: **5A** (hero, stats card, all states) and **5B** (bars, top categories).
- **Usage at start:** 5-hour 39%, weekly 48% (2026-11-13, 10:06 UTC).

## Owner approval

The owner fills this through their reply in chat. Nothing after the brief starts until this is complete.

- **Status:** Approved
- **Date:** 2026-11-13
- **Owner's words:** First "remove user story 3. rest is good." (worth noticing taken out), then, on the updated brief, "Yes, approve all".
- **Answers:** Question 1, top categories use the names in the file. Question 2, a top category is a plain row until Phase 6.
- **Later changes approved:** None

## User stories

1. As the owner, I want my net worth today and how it changed in the chosen period on one screen, so I know where I stand straight after logging in.
2. As the owner, I want Earned, Spent, Saved (with savings rate) and Invested for the period, so I can see whether I saved this month without doing any sums.
3. As the owner, I want earned-vs-spent bars by month and my top 5 categories, so I can spot trends and where the money goes.

## Acceptance criteria

**Figures**
- **AC-1** Net worth shows today's figure whatever the period, labelled "Net worth". Beside it are the change over the period (from the net worth breakdown), the range line and a small line of month-end net worth for the last 12 months. On the sample file all of these match the Phase 2 calculation code exactly.
- **AC-2** The stats card shows Earned, Spent, Saved with savings rate, and Invested for the period, and each matches `periodMetrics` on the sample file for This month, Last 12 months, Financial year, All and one Custom range.
- **AC-3** The savings rate follows the table in design.md: "Saved · 44%" above zero, "Saved · −12%" for a negative rate, and "Saved · no rate" with the right help line when Earned is zero or below zero (F-2).
- **AC-4** Money uses Indian grouping with no paise, a real minus sign, and is never shown by colour alone. Chart axes use the short form (`₹1L`).

**Charts and categories**
- **AC-5** "Earned and spent by month" shows the months design.md sets for each period: the last 12 months for This month and Last 12 months, the period's months for Financial year and Custom, and years for All when it covers more than 24 months. Each bar matches the calculation code. A month where Earned is zero or below still shows its axis label.
- **AC-6** Hovering over or focusing on a month shows its exact Earned and Spent in a tooltip. Arrow keys move between months, and the chart is one Tab stop with a text label for screen readers.
- **AC-7** "Top categories" lists the 5 biggest spending categories in the period, biggest first, each with its amount. A blank category reads "No category". With fewer than 5, fewer rows show.

**States**
- **AC-8** Loading shows a skeleton of the hero, the four stats and the two charts, with no shimmer and none at all for loads under 200ms.
- **AC-9** Few rows: when This month has fewer than 10 rows, the line "It's early in November, so these figures are small so far." shows in the stats card, with the real month's name.
- **AC-10** No rows: figures read ₹0 and the rate reads "no rate", the bars still show earlier months, and Top categories reads "Nothing spent yet this month." For other periods it reads "Nothing in this period." with a "Show this month" link that works.
- **AC-11** Error: the shared note "This screen couldn't load. Your data is safe." with Try again, and nothing technical shows.
- **AC-12** Stale: the old-upload note (more than 30 days, with the real date and an Upload link, dismissed until the next login) and the "changed in another window" note with Reload. Numbers don't change until Reload.
- **AC-13** First visit after the first upload only: the numbers roll up from zero once. The delete-the-export note shows as on screen 6.

**Period, motion and layout**
- **AC-14** Changing the period updates every figure. Numbers roll 500ms and bars move 400ms. With reduced motion everything shows at once. The hero's small line never animates. The chosen Custom dates show on the range line (Phase 4 note Q4-4).
- **AC-15** The screen works at 1280, 375 and 320 wide as design.md sets out, including "₹18,42,350" staying on one line at 320. The 320px custom-date layout from the Phase 4 note gets fixed too.
- **AC-16** The screen follows `docs/design-system/README.md`. Any new part, such as the skeleton, bars, tooltip or small line, is added to the system through its "Changing the system" steps, not to this screen alone.
- **AC-17** With the app locked, the Overview and any new route it uses return no figures. This uses the same gate as every Phase 4 route.

## Good enough

- **Accepted gaps:**
  - The Phase 2 gap stays: a loan or investment gain logged as income counts in Earned and raises the savings rate.
  - F-1 stays: a broken transfer pair can leave Invested short. It shows in the Unmatched line on the Savings screen (Phase 7), not here.
- **Test limit:** figures get checked on the generated sample file and small hand-built cases. QA opens the screen in a real browser at 1280, 375 and 320, in light and dark mode. No real file at any point.

## Out of scope

- The "worth noticing" lines. The owner took them out of this phase on 2026-11-13, so the Overview has no Worth noticing section.
- The Spending screen (Phase 6). Top categories don't open anything yet (see question 3).
- The net worth breakdown screen and savings rate by month (Phase 7).
- Account balances and the allocation bar (Phase 8).
- The chat panel (Phase 12).
- Any change to how Earned, Spent, Saved, Invested or Net worth are defined.

## Tasks

Riskiest first, in thin slices.

**5A**
1. Designer: a preview of the Overview at its three widths and main states, plus the design system additions (skeleton, bars, tooltip, small line), for the owner's yes.
2. Engineer: one server-side "overview" function that pulls together the hero, stats, months and top categories from the Phase 2 code, behind the lock gate. Tests against the sample file come first.
3. Engineer: hero and stats card, the savings-rate states, few rows and no rows, error, stale notes, first-time roll-up, skeleton.

**5B**
4. Engineer: monthly bars with tooltip and keyboard, top categories, period motion.
5. QA (fresh agent): full run against AC-1 to AC-17, then one narrow re-test after fixes.
6. Merge checklist and owner sign-off.

## Owner-only steps

- Look at the Designer's preview in the browser and say yes or what to change. Nothing to install or type.

## Questions for the owner

1. **Top categories: file categories or your groups?** (Doesn't block.) Default: the categories as named in your file. Your own expense groups from Setup come in on the Spending screen.
2. **What should a top category do before the Spending screen exists?** (Doesn't block.) Default: a plain row for now. Phase 6 turns it into a link to that category.

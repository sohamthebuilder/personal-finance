# Phase 6 handoff

## Usage

| When | 5-hour | Weekly |
|---|---|---|
| Start (2026-11-14, 04:13 UTC) | 25%, resets 07:20 UTC | 57% |
| After the preview (2026-11-14, 05:03 UTC) | 35%, resets 07:20 UTC | 59% |
| After the build (2026-11-14, 05:29 UTC) | 55%, resets 07:20 UTC | 61% |
| After the full QA run (2026-11-14, 05:40 UTC) | 68%, resets 07:20 UTC | 63% |
| Start of fixes, fresh session past budget (2026-11-14, 05:42 UTC) | 70%, resets 07:20 UTC | 63% |
| End, after re-test and Security (2026-11-14, 05:48 UTC) | 80%, resets 07:20 UTC | 65% |

## Brief (PM, 2026-11-14)

`brief.md` drafted on branch `phase-6` (from `main` at ba3b964). Owner accepted it on 2026-11-14 ("Yes, accept all"), with all four defaults: groups switch in, Overview opens level 2, no second-account column, short Security sign-off at the end.

## Preview (Designer, 2026-11-14)

`previews/spending.html` builds on the approved Overview preview's shell. The Preview menu in the corner opens every state. Web-address shortcuts for QA: `#l2`, `#l3`, `#l12,l3`, `#groups`, `#gl2`, `#nogroups`, `#all`, `#few`, `#none`, `#empty`, `#empty,l2`, `#loading`, `#error`, `#old`, `#changed`, `#dark`.

### Added to the Phase 3 design (approved 2026-11-14: "Yes, approve all")

- **Level 1 has a trend too:** "Spent by month" for all spending, so the right column isn't empty. Levels 2 and 3 show the category's trend ("Groceries by month"). At level 3 the trend stays on the category, so it doesn't jump.
- **Long trends scroll inside their card.** The file has 68 months, too many for a phone. Bars keep at least 7px apart, the chart opens at the latest month, and the axis stays still.
- **No change reads "Same as 1 to 7 Oct".** Changes in spending are neutral grey, not green or red: more spending isn't a gain.
- **Shares below level 1 name their parent:** "36% of Groceries".
- **Groups path:** Spending / Needs / Groceries / Vegetables. The switch is hidden below level 1, when there are no groups, and on an empty level.

### Design system (approved 2026-11-14: "Yes, approve all")

New parts, no new colours: `.path`, `.ranks`/`.rank`, `.txns`/`.txn`, `.chart--scroll` with `.chart-split`, `.seg--2`, `.grid__side`, `.enter--back`. README, gallery and change log updated, previews synced.

### For the Engineer

- **Layout:** `.grid` with hero (`span-7`), trend (`span-5 grid__side`), then the list card (`span-7`). Narrow: hero, trend, list.
- **Hero:** label "Spent" / "Spent on Groceries", display figure, change line, then range line (plus "9 transactions" at level 3). Empty level: ₹0 and no change line.
- **Rows:** biggest first. Bar width is amount ÷ the level's largest amount. A row at or below zero has no bar and no share. `aria-label` reads name, amount, share and change.
- **Change:** "+₹1,240 vs 1 to 7 Oct", "−₹1,180 vs …", "Same as …", or "Nothing earlier to compare" (no earlier amount, or the period starts before the file). "All" shows none.
- **Transactions:** newest first, 50 at a time, "Show 50 more" with "Showing 50 of 160"; focus moves to the first new row. A blank note reads "No note". Another currency adds "Paid 420.00 THB" under the amount.
- **Moving:** each step down adds a history entry with no change to the web address. The path's links and Back go up. Focus goes to the list card's heading. A period change keeps the level.
- **Motion:** level change uses `.enter` (forward) or `.enter .enter--back` (back), 180ms. A period change rolls the hero and row amounts and moves bars from old widths, matched by name. Reduced motion: instant.
- **Trend keyboard:** the chart area takes focus. Left and right arrows step through months and read each one in a polite live region. The hidden summary names the first and last months, the highest month and this month so far.
- **Text from the file** (names, notes, accounts) is plain text only. The preview's test note `<b>Tomatoes</b> … <script>…` must show as typed.

### Checked

1280 light, 375 light, 320 dark: no sideways page scroll. Every preview state opened. Transactions add up to the subcategory to the paisa. Back, the path and "Show 50 more" work. A period change keeps the level and rolls the figures.

This session's memory is at 56%, so the build should run in a fresh Engineer agent.

## Build (Engineer, 2026-11-14)

6A and 6B are both built. Nothing is committed.

### What was built
- **Calculations (6A):** `src/lib/metrics/spending.ts` holds every Spending figure: lines by category, subcategory or expense group with the earlier period's amount, totals, Spent by month, and the transaction list. All of it starts from one new shared helper, `spentRows` in `metrics.ts`, which is the same rule as Spent in `periodMetrics` (`Exp.` rows in the period, up to today). `spendingByCategory` (the Overview's top 5) now uses it too, so the two screens can't disagree. `src/lib/period.ts` gains `comparisonDates` and `comparisonLabel` for the "Compared with" rule.
- **Screen builder:** `src/lib/spending/spending.ts` (`buildSpending`) works out one level at a time: top (categories or groups), a group, a category, or a subcategory's transactions, plus the trend (whole file, first month to this month; level 3 keeps its category's trend).
- **Routes:** `POST /api/spending` (one level for the session's period; the level comes in the request body) and `POST /api/spending/open` (the Overview's link, remembered in server memory and used once). Both sit behind the usual gate and session check.
- **Screen (6A and 6B):** `/spending` page (`src/app/spending/page.tsx`) and `src/app/ui/spending.tsx`, with wording in `src/app/ui/spending-words.ts`. The Spending tab in the sidebar and tab bar is now a link. `/spending` is a return screen after log in.
- **Overview:** each top category is now a `.rank` row button that opens Spending at that category (level 2) for the same period.
- **Design system:** `src/app/system.css` copied from `docs/design-system/system.css` (the approved Phase 6 parts). No new styles.

### Which file covers each AC
| AC | Code | Tests |
|---|---|---|
| 1, 2, 6, 18 | `lib/metrics/spending.ts`, `metrics.ts` (`spentRows`), `lib/spending/spending.ts` | `tests/spending.test.ts`: every period on the sample, categories, groups, subcategories and transactions all add up to the paisa and match the Overview's Spent; future rows, identical repeats, transfers/income/corrections |
| 3 | `period.ts` (`comparisonDates`, `comparisonLabel`), `spending-words.ts` (`changeText`) | both test files |
| 4 | `spending-words.ts`, `format.ts` | `tests/spending-ui.test.ts` |
| 5 | `lib/spending/spending.ts`, `ViewSwitch` in `ui/spending.tsx` | `tests/spending.test.ts` "Your groups" |
| 7 | `monthlySpending`, `Trend` in `ui/spending.tsx` | `tests/spending.test.ts`; browser |
| 8, 9, 10 | `spendingTransactions`, `Transactions` in `ui/spending.tsx` | `tests/spending.test.ts`, `tests/spending-ui.test.ts`; browser |
| 11, 12, 16, 17 | `ui/spending.tsx` (history, path, period effect, focus, roll, `.enter`) | source checks in `tests/spending-ui.test.ts`; browser |
| 13 | `api/spending/open`, `ui/overview.tsx` | browser |
| 14, 15 | `ui/spending.tsx` | browser |
| 19 | | checks below |

### Different from the brief, or worth knowing
- **"Nothing earlier to compare"** shows on every row when the earlier period starts before the file's first row, as in the preview. A row shows it too when it had no rows at all in the earlier period. A row whose earlier rows add up to ₹0 shows a real change.
- **"Same as …"** is used when the change rounds to ₹0, since the screen shows whole rupees.
- **Overview top categories** now look like Spending's ranked rows (chevron, hover). There was no preview for this link, so I reused `.rank`, the system's "rows that open". The Designer may want to glance at it.
- **The groups switch** redraws the list at once (the segment's slide doesn't play), as in the preview.
- **A group that disappears** (Setup changed in another window) answers 409 and the screen goes back to the top level.
- **Test lists updated, nothing weakened:** `tests/metrics.test.ts` allows `spending.ts` in `src/lib/metrics/` (AC-18 asks for it there; its "no screen, file or database code" check still runs on it), and `tests/start-screen.test.ts` lists the two new routes.
- **Not added:** a server test for the two new routes' 401 when locked. They use the same `withSessionForm` as every other route.

### Checks
`npm test` 544 passed, 0 failed (33 new). `npm run typecheck` clean. `npm audit` 0 vulnerabilities. `npm run guard` 353 files, nothing blocked. No `style="..."`.

### Browser check
Ran the dev server in the built-in browser with a throwaway HOME in my scratch folder (made-up sample, the test password from `tests/support/app-helpers.ts`, plus three made-up rows: a `<b>…<script>` note, a very long note and a THB row). The throwaway data and the temporary launch entry were removed afterwards; `.claude/launch.json` is unchanged.
- 1280: hero and list left, trend right; Last 12 months Spent ₹2,67,007; Financial year ₹79,797, the same as the Overview.
- Levels 1 → 2 → 3, path links, browser Back (web address never changed), Enter on a row, focus on the list heading, groups path "Spending / Needs / Made-up Food".
- Period change at level 2 kept the level; This month showed "Nothing in Made-up Food for this period." and ₹0 with no change line.
- Overview top category opened Spending at that category; Back went to Spending's first level.
- 375 and 320: one column, no sideways page scroll, the trend scrolls inside its card and opens at the latest month. The markup note showed as typed, the long note wrapped, "Paid 420.00 THB" showed under the amount.
- "Show 3 more" on 53 rows, focus moved to the first new row. Trend arrow keys filled the live region and tooltip. No console or server errors.

### For QA
- The sample's "today" is 2026-06-15, so on today's date This month is empty. Use Last 12 months, Financial year or All.
- Not checked by me: light mode, reduced motion, the error and old-upload notes, "changed in another window", and the 180ms slide by eye (the pane's screenshots caught the page mid-paint).
- Running the app safely needs a throwaway HOME, which `launch.json` can't set by itself. I added a temporary entry that starts `npm run dev` through `/usr/bin/env HOME=<scratch folder> APP_PORT=3100`, then removed it.

## Budget stop after QA (2026-11-14)

Full QA (fresh agent): 18 of 19 criteria pass. AC-17 fails on Q6-1 (Blocker): every level change grows all bars from zero over 400ms, where only the 180ms slide is allowed. Q6-2 (Minor): "Paid 420 THB" should read "Paid 420.00 THB". Q6-3 (Minor): at 1280, Tab reaches the trend before the list. Details in `test-report.md`. Reduced motion still needs one check with the Mac's real setting.

The phase has used 43 points of one 5-hour limit (25% to 68%), close to its budget of 50, and this session's memory is at 59%. Work stopped to ask the owner before fixes.

### Next steps, in a fresh session

1. Engineer (fresh agent): fix Q6-1, and Q6-2 and Q6-3 if cheap. Nothing is committed yet; the work is on branch `phase-6` in this worktree.
2. Narrow re-test (QA, fresh agent, Sonnet), including reduced motion with the real setting.
3. Security short sign-off (fresh agent), focused on AC-9 and the new `/spending` return screen and `spendingOpen` session field.
4. Merge checklist, end usage, owner sign-off. Commit, push and merge only when the owner asks.

### Fixes after QA (Engineer, 2026-11-14)

- **Q6-1 (Blocker), fixed.** Root cause: when a level mounts, another layout effect (the trend's) can make the browser style the new bars at 0 width before `Rank` sets their width, so the width transition played. Now a newly mounted `Rank` switches its bar's transition off, sets the width, flushes the style, then gives the transition back. Only a width change on a row that stays (a period change) moves over 400ms; a level change shows bars at full width at once with only the 180ms slide. Reduced motion is unchanged (the global rule turns all transitions off). No CSS change, so `system.css` (app and design system) is untouched and the Overview's `.rank` rows behave as before (its `CategoryRow` was not changed). File: `src/app/ui/spending.tsx` (`Rank`).
- **Q6-2 (Minor), fixed.** The other-currency note now shows two decimals and grouping with the code kept: "Paid 420.00 THB", "1,000.00 USD", "1,234,567.50 IDR". Grouping is in threes (the international style) since the amount isn't in rupees; anything that isn't a number stays as written. Files: `src/lib/metrics/spending.ts` (`originalAmount`), `tests/spending.test.ts` (existing check tightened to exactly "420.00 THB", new test for grouping and decimals; both failed first).
- **Q6-3 (Minor), skipped.** Moving the trend after the list in the page order keeps 1280 the same, but below 1040 the screen stacks in page order, so the trend would drop below the list at 375 and 320. Keeping the mobile look needs CSS `order`, which puts the visual order and the Tab order out of step on mobile instead. That is a Designer call, not a cheap fix. AC-16 passes as it is.
- **Checks:** `npm test` 545 of 545 pass, `npm run typecheck` clean, `npm audit` 0 vulnerabilities, `npm run guard` 353 files, nothing blocked.
- **Not checked by me in the browser:** the Q6-1 movement by eye. Re-test: level change (row, path link, Back) shows bars at once; period change still moves bars over 400ms; reduced motion is instant.

## Re-test, Security and merge check (2026-11-14)

The owner chose to go past the budget ("Fixes in a fresh session"). The phase used 55 points of one 5-hour limit (25% to 80%), 5 over the budget of 50.

- **Narrow re-test (QA, Sonnet):** Q6-1 fixed (bars at full width at once on every level change; period change still moves them over about 400ms). Q6-2 fixed ("Paid 420.00 THB"). Q6-3 still open, Minor. AC-16 still passes. No new Blocker or Major. Details at the end of `test-report.md`.
- **Reduced motion:** passed by simulation, not with the Mac's real setting (it is off, and QA didn't change system settings; the browser pane has no emulation). QA added the app's own reduced-motion rule to the page: level and period changes were instant.
- **Security (short sign-off):** signed off, nothing needed before merge. See `security.md`.

### Open Minors, for later
- **Q6-3:** at 1280, Tab reaches the trend before the list. Fixing it changes the phone layout, so the Designer needs to decide.
- **S6-1:** a very long currency text from the file could make the transaction list wider than a phone screen. Found by reading the code, not tried.
- **S6-2:** category names stay in browser history after log out. No amounts or notes.
- **S6-3:** no test proves the two new routes answer 401 after log out.

### Merge checklist
- [x] The owner's approval of the brief is recorded (brief, "Owner approval")
- [x] Every criterion has a result, and no Blocker or Major is open (19 of 19 after the re-test)
- [ ] All checks pass on the final commit: local checks pass (545 tests, types, audit, guard); the three GitHub checks run once the pull request exists
- [x] Every "before merge" security condition is met (there are none)
- [x] Every owner-only step is done (preview approved 2026-11-14)

The owner asked to commit and push ("Yes, commit and push", 2026-11-14). Merge still waits for the owner.

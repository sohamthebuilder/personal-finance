# Phase 6 test report: Spending screen

QA, fresh agent, 2026-11-14. Branch `phase-6`, uncommitted build. Tested against `brief.md` AC-1 to AC-19, the approved preview `previews/spending.html`, the "Preview" and "Build" sections of `handoff.md`, and `docs/design-system/README.md`.

## How it was tested

- **App:** dev server (`npm run dev`) on 127.0.0.1:3100 in the built-in browser, started through a temporary `launch.json` entry with `HOME` pointed at a throwaway folder in the QA scratchpad. The real data folder was never touched. The entry and the folder were removed afterwards; `launch.json` is unchanged.
- **Data:** only made-up data. The generated sample (`makeSample()`) written straight into a new encrypted database, with the sample's own setup answers (groups Needs and Wants), plus six made-up rows: a note holding `<img onerror>`, `<b>` and `<script>`, a 444-character note with no spaces, a 420 THB row, rows on 3 Oct and 3 Nov 2026, and a row with a blank category. Password: the existing made-up one in `tests/support/app-helpers.ts`.
- **Add-up check:** a script in the page called `POST /api/spending` for every category, subcategory, group and transaction list, and compared the totals to the paisa. It ran for Last 12 months, Financial year and All.
- **States:** the error, slow load and old-upload states were made by wrapping the page's `fetch` in the browser (the server was not changed). "Changed in another window" was made by raising the version number in `/api/status` replies.
- **Reduced motion:** the pane can't switch the system's reduced-motion setting. It was copied in the page: `matchMedia` answered "reduce" and the stylesheet's own reduced-motion rule was added. Real-setting check still owed (see AC-17).
- **Light mode:** set with the pane's colour-scheme switch.

## Checks

| Check | Result |
|---|---|
| `npm test` | 544 passed, 0 failed, no leftovers |
| `npm run typecheck` | Clean |
| `npm audit` | 0 vulnerabilities |
| `npm run guard` | 353 files checked, nothing blocked |
| Sideways scroll | None at 1280, 375 or 320, including level 3 with the long note |
| Console | No errors from the app. (One error was caused by QA's own reduced-motion test and went away on reload) |
| One-off styles | No `style="…"` in `spending.tsx` or `overview.tsx`. Every class used exists in `system.css`, and `src/app/system.css` matches `docs/design-system/system.css` exactly |

## Results by criterion

| AC | Result | Evidence |
|---|---|---|
| AC-1 | Pass | Spending's Total Spent equals the Overview's Spent: All ₹21,14,921 on both screens. The API's Total Spent equals the sum of its categories to the paisa on Last 12 months (₹2,67,734.43), Financial year (₹80,524.76) and All (₹21,14,921.40) |
| AC-2 | Pass | One row per category with name, amount, share and bar, biggest first. Rows add up to Total Spent to the paisa on all three periods. A ₹10 row reads "Under 1% of spent" |
| AC-3 | Pass | This month: "+₹210 vs 1 to 14 Oct" (₹510 now, ₹300 then). Last 12: "vs 15 Nov 2024 to 14 Nov 2025". Financial year: "vs 1 Apr to 14 Nov 2025" (same dates a year earlier). Custom Nov 2023: "vs 2 to 31 Oct 2023". All: no change line. A category with nothing earlier, and Custom Mar 2023 (earlier period before the file), read "Nothing earlier to compare". Changes are neutral grey, as approved |
| AC-4 | Pass | "No category" and "No subcategory" show in the same plain style as real names, on rows, path and heading |
| AC-5 | Pass | "Your groups" on Financial year: Needs ₹68,203, Wants ₹12,312, Not grouped ₹10, adding up to ₹80,525. Every group's categories add up to the group (API check). Path reads "Spending / Needs / Made-up Food / Groceries". Switch hidden below level 1 and on an empty level. Hidden-with-no-groups checked only by `tests/spending.test.ts`, not in the browser |
| AC-6 | Pass | Level 2 shows subcategories as ranked rows, "54% of Made-up Food", with the category total as the heading figure. Subcategories add up to their category to the paisa for every category on three periods |
| AC-7 | Pass | "Made-up Food by month": 45 months, Mar 2023 to Nov 2026, the same whatever the period. Empty months keep their place ("Oct 2026: nothing spent" read by arrow keys). Level 3 keeps the category's trend |
| AC-8 | Pass | Level 3: date, account, amount with paise and note, newest first. "Showing 50 of 56" with a button for the rest; after it, 56 rows and focus on the first new row. Count and total on top ("₹1,241 · 3 transactions") equal the level 2 row. Every subcategory's transactions add up to the paisa on three periods |
| AC-9 | Pass | The markup note showed as typed characters. No `img`, `b` or `script` element was made, and the test's `onerror` and script never ran (`data-pwned` stayed unset). The 444-character note wrapped inside its card at 1280, 375 and 320, with no sideways scroll |
| AC-10 | Pass | The THB row shows ₹1,050.00 with "Paid 420 THB" under it. Only the INR amount counts in totals. See Q6-2 for the format |
| AC-11 | Pass | The web address stayed `/spending` through every level, path click, Back and period change. The level is kept in the browser's history entry, not the address. Path links go up (clicking "Needs" from level 3 goes up two levels), and Back goes up one level at a time |
| AC-12 | Pass | At level 2 (Made-up Travel), changing to This month kept the level and showed ₹0 and "Nothing in Made-up Travel for this period." |
| AC-13 | Pass | Overview "Made-up Food" (All) opened Spending at level 2 for All. "No category" (This month) opened level 2 for "No category". Back from there goes to Spending's first level. The Overview rows are buttons labelled "Made-up Food, ₹4,64,219. Open in Spending" |
| AC-14 | Pass | Slow load (2s): the skeleton in the screen's shape. Few rows: This month with 2 rows. Empty: Custom May to Jun 2023 shows ₹0, "Nothing spent in this period." and "Show this month", which switched to This month. Error: "This screen couldn't load. Your data is safe." with Try again, matching the preview's error state; Try again loaded the level. Old upload: "Your last upload was 1 Jul 2026, so recent months may be missing." with Upload and Dismiss. Changed: "Your data changed in another window." with Reload. Both notes checked in light mode at 1280. "Nothing spent yet this month." not seen in the browser (the test data had November rows); its wording is checked by `tests/spending-ui.test.ts` |
| AC-15 | Pass | 1280: hero and list on the left, trend on the right. 375 and 320: one column, hero then trend then list, the trend scrolling inside its card. Dark and light both checked. No one-off styles (see Checks) |
| AC-16 | Pass | Tab reaches the path ("Spending"), the switch and every row as a button. Rows read e.g. "Made-up Food, ₹4,64,219, 22% of spent" and "Made-up Food, ₹500, 98% of spent, +₹200 vs 1 to 14 Oct". Enter on a row went down a level and moved focus to "By subcategory". The trend has a label naming Mar 2023 to Nov 2026, the highest month and this month so far, and arrow keys fill a polite live region. See Q6-3 for the tab order |
| AC-17 | **Fail** | The level slide is right: 180ms, from 8px right going down and 8px left going up. A period change moves bars from their old widths (matched by name) and rolls the figures. But on every level change, all bars also grow from zero over 400ms. That is extra movement, and the approved preview doesn't do it. See Q6-1. Reduced motion (copied in the page): level change and period change had no animations and the figures jumped straight to the new values |
| AC-18 | Pass | Every Spending figure comes from `src/lib/metrics/spending.ts` and the shared `spentRows`. `tests/spending.test.ts` checks every level adds up on five periods, and the traps: future-dated rows, identical repeats, and no transfers, income or corrections. All pass |
| AC-19 | Pass (local) | The four local checks pass (see Checks). The three GitHub checks can't run until the work is committed and pushed |

**Total: 18 Pass, 1 Fail.**

## Findings

| ID | Level | What happens | Steps | Expected | Screen / file |
|---|---|---|---|---|---|
| Q6-1 | Blocker | On every level change, going down or going back, every bar on the new level starts at zero width and grows to full size over 400ms. AC-17 allows only the 180ms slide on a level change and says "No other movement". The approved preview shows the bars at full width at once. The code means to do that ("A new row shows its bar at once"), but the bar's width transition still plays. A small fix, but it fails a criterion | Last 12 months, level 1. Click Made-up Food, or press Back from it. Watch the bars: measured 0 → 287 → 406 → 448 → 473px across about 400ms | Bars appear at their final width while the level slides in. They move only on a period change | `Rank` in `src/app/ui/spending.tsx` (bar width set in `useLayoutEffect`) with `.rank .meter > span` transition in `system.css` |
| Q6-2 | Minor | The other-currency note shows the amount exactly as typed in the file ("Paid 420 THB"), not in the approved preview's format ("Paid 420.00 THB"). Big amounts would show without grouping, e.g. "Paid 1000 USD" | Level 3 of a subcategory with a THB row | "Paid 420.00 THB", as in the preview | `spendingTransactions` in `src/lib/metrics/spending.ts` (`original`) |
| Q6-3 | Minor | At 1280, Tab goes hero → trend chart → switch → rows. The trend sits on the right of the screen but comes before the list on the left. AC-16 only asks for path then rows, so this passes, but the jump right then back left may surprise a keyboard user | Spending at 1280. Tab from the header | Path, switch, rows, then the trend, or the order agreed with the Designer | Grid order in `src/app/ui/spending.tsx` |

No Major. Q6-1 needs fixing before merge. After the fix, a narrow re-test should cover bar movement on level change and period change, and reduced motion.

## Extra checks asked for

- **Overview top categories as `.rank` rows:** compared with the approved `phase-5/previews/overview.html` at 1280. The rows are a little taller, have a chevron, and the bar stops before the chevron. They match Spending's rows and read as clickable. They don't look out of place. Not a finding, but the Designer may still want a look, as the Engineer suggested.
- **Log in returns to `/spending`:** from Spending, Log out, then log in with the made-up password: the app opened `/spending`.
- **Locked routes:** not re-tested in the browser. Both new routes use the same `withSessionForm` gate as every other route (code read).

## App sanity check

Log in, Overview, Spending at all three levels, groups, path, Back, period changes (This month, Last 12 months, Financial year, All, Custom), Show more, Overview link, Upload and Settings links present, Log out. No crashes, no errors from the app in the console or the server log.

## Narrow re-test (2026-11-14)

QA, fresh agent, one round. Same method as the full run: dev server on 127.0.0.1:3100 with a throwaway HOME in the QA scratchpad, made-up sample data plus one made-up THB row (420 THB, Made-up Home / Rent). Bar widths were sampled every frame and every 8ms in the page right after the click, on `.rank .meter > span`. The throwaway data and the temporary launch entry are removed; `launch.json` is unchanged.

| Finding | Result | Evidence |
|---|---|---|
| Q6-1 (was Blocker) level change | Fixed | Last 12 months. Open Made-up Food (1 to 2): the new bars were at 624 and 425px in the first frame they existed, no growth. Open Groceries (2 to 3): no bars. Path link (3 to 2, 2 to 1) and browser Back (2 to 1): bars at their final widths (624/484/273/184) in the first frame, nothing grew afterwards. Only the 180ms slide moves. |
| Q6-1 period change | Fixed (still moves) | Last 12 months to Financial year and back: bars glide from old to new width, 624/484/273/184 to 621/382/135/31 over about 350 to 400ms, easing out. (The glide begins about 0.9s after the click here, when the new figures arrive; that is the dev server's load time, not a delay in the bars.) |
| Q6-2 (was Minor) | Fixed | Level 3 of Made-up Home / Rent reads "Paid 420.00 THB". Grouping for big amounts: not driven in the browser (no big foreign row made); covered by the Engineer's new unit test ("two decimals and grouping, and keeps its currency code"), which passes. |
| Q6-3 (Minor) | Still open, Minor | At 1280, Tab from Log out goes path, trend chart, rows. AC-16 still passes: path before rows, Enter on a row goes down a level, and focus lands on the new level's heading ("Transactions"). Needs a Designer decision, as the Engineer said. No extra round. |
| AC-17 | Pass | Both Q6-1 cases and reduced motion below. |

**Reduced motion.** Not tested with the real Mac setting: `defaults read com.apple.universalaccess reduceMotion` has no value (setting off), and I must not change system settings. The browser pane has no reduced-motion emulation. What I did instead:
- **CSS rule read:** `system.css` has `@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }`. `spending.tsx` also checks `matchMedia("(prefers-reduced-motion: reduce)")` before it rolls figures.
- **Simulated in the page:** I added that same rule, un-wrapped, as a style tag in the throwaway session. Level change (back to the top level) and period change (Last 12 months to Financial year) then jumped to the final widths in one step, and the bar's computed transition duration was 0s.
- **Not covered:** the real media query switching on, and the JavaScript `reducedMotion()` branch. Both are small and read in code. Result: Pass by simulation, not by the real setting. The owner can turn on Reduce motion in System Settings and open Spending if they want that last confirmation.

No new Blocker or Major. Q6-3 stays Minor.

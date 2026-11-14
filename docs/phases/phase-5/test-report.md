# Phase 5 test report: Overview screen

QA, fresh agent, 2026-11-13. Branch `phase-5`, uncommitted build. Tested against `brief.md` AC-1 to AC-17, design.md "Rules shared by screens 7 to 16" and "Screen 9" (Worth noticing ignored, as the owner removed it).

## How it was tested

- **App:** production build (`npm run app`) on 127.0.0.1:3123, in the built-in browser. `HOME` pointed at a throwaway folder in the QA scratchpad, so the real data folder was never touched. Deleted afterwards.
- **Data:** only made-up data, sent to the app in memory (no spreadsheet file written): the generated sample (`makeSample()`), and small hand-built files made with `tests/support/import-helpers.ts`. The password was the existing made-up one in `tests/support/app-helpers.ts`, so no new test values were needed.
- **Expected figures:** worked out separately by calling `periodMetrics`, `netWorth`, `netWorthBreakdown` and `spendingByCategory` directly, then compared with what the screen shows.
- **Old upload:** the server clock was moved 40 days ahead by a QA-only preload script. No app code was changed.
- **Limit:** the browser pane runs animation frames only a few times a second (and not at all while hidden), so roll and bar timings couldn't be measured. Start and end values were checked, and the 500ms/400ms durations were read from `overview.tsx`.

## Checks

| Check | Result |
|---|---|
| `npm test` | 503 passed, 0 failed, no leftovers |
| `npm run typecheck` | Clean |
| `npm audit` | 0 vulnerabilities |
| `npm run guard` | 322 files checked, nothing blocked |
| Console and security policy | No console messages, no policy errors, on load, period changes and every state. The policy is strict (`default-src 'none'`, nonce scripts and styles) |
| Sideways scroll | None at 1280, 375 or 320, including a 47-month Custom range |

## Results by criterion

| AC | Result | Evidence |
|---|---|---|
| AC-1 | Pass | Net worth ₹32,28,767 on every period (matches `netWorth`). Changes match `netWorthBreakdown`: +₹8,06,015 (Last 12), +₹3,82,460 (FY), +₹32,28,767 (All), +₹9,35,655 (Custom). Range lines are correct. The 12 small-line points match month-end `netWorth` (₹25,18,849 to ₹32,28,767). See Q5-2 for the change line's contrast |
| AC-2 | Pass | Earned, Spent, Saved and Invested match `periodMetrics` for This month (₹0), Last 12 months (₹10,71,699 / ₹2,65,683 / ₹8,06,015 / ₹2,06,336), Financial year, All, and Custom 1 Apr to 30 Sep 2024 (₹12,14,350 / ₹2,78,695 / ₹9,35,655 / ₹1,69,289) |
| AC-3 | Pass | "Saved · 75%", "57%" and "98%" above zero. Earned zero gives "Saved · no rate" with "…because nothing was earned in this period." Earned −₹2,000 gives "no rate" with "…because Earned is below zero in this period." A negative rate wasn't reachable with Earned above zero on the test data (code path covered by `overview-ui.test.ts`) |
| AC-4 | Pass | Indian grouping and no paise everywhere. Negative figures use the real minus (U+2212), e.g. "−₹2,000". Gains carry "+", so colour is never the only sign. Axes read ₹1L, ₹2L, ₹2.5L, ₹20L, ₹25K |
| AC-5 | Pass | Last 12 and This month: Dec to Nov. FY: Apr to Nov. Custom: its own months (also over 24, as the owner chose). All over 24 months: FY23 to FY27. All 12 monthly bars and the FY24 bar match `periodMetrics`. A month with Earned below zero has no bar and keeps its "Nov" label. See Q5-1 for long ranges |
| AC-6 | Pass | Hover shows "Apr 2026, Earned ₹1,56,022, Spent ₹23,966" and the other bars dim. The chart is the only Tab stop in the content. Arrow keys step through all 12 months, and the current one reads "Nov 2026 so far". It has a text label and a live region. See Q5-4 |
| AC-7 | Pass | Top 5, biggest first, matching `spendingByCategory` on every period. A blank category reads "No category". Three categories gave three rows. Plain rows, no links |
| AC-8 | Pass | A 1.5s load showed 20 skeleton blocks in the hero, stats, chart and category shapes, with no animation. Nothing showed at 120ms, and a fast load shows no skeleton |
| AC-9 | Pass | With 4 rows in November: "It's early in November, so these figures are small so far." in the stats card |
| AC-10 | Pass | Sample on This month (no rows): ₹0 everywhere, "no rate", bars still show Dec to Jul, and "Nothing spent yet this month." Custom Jan to Feb 2023 (no rows): "Nothing in this period." and "Show this month", which switched the screen and the header picker to This month |
| AC-11 | Pass | With the overview request forced to fail (reply text held a fake path): "This screen couldn't load. Your data is safe." and Try again, with nothing technical. Try again loaded the figures |
| AC-12 | Pass | 40 days on: "Your last upload was 13 Nov 2026, so recent months may be missing." with an Upload link to /upload. Dismiss hid it, the server stopped sending it, and it came back after log out and log in. Undo in a second tab showed "Your data changed in another window." with Reload, and the figures stayed put until Reload. See Q5-5 |
| AC-13 | Pass | On the first visit, the delete-the-export note shows. The server sends the roll-up only once (`server.test.ts`, run in `npm test`. After the first visit the API sent `rollUp: false`). With a roll-up reply, the figures and the hero started from ₹0 and rolled up. The real first visit couldn't be watched, because the page reloads after login |
| AC-14 | Pass | Every figure, bar and category changes with the period. Numbers pass through in-between values (roll). With reduced motion, the values went straight from old to new. The small line has no animation, and CSS drops all transitions under reduced motion. Custom dates show on the range line ("1 Apr to 30 Sep 2024"). Timings come from the code (see "Limit" above) |
| AC-15 | Pass | 1280: hero 5 and stats 7 columns, bars 7 and categories 5. 375 and 320: one column in order, with bars labelled every second month at 375. At 320 the display figure is 36px and "₹32,28,767" stays on one line (37.8px tall). The 320 Custom dialog puts the year on its own row, not cut off. Light and dark checked at all three widths. See Q5-1 and Q5-3 |
| AC-16 | Pass | `docs/design-system/system.css` and `src/app/system.css` match. The skeleton and the Overview helpers are logged in the README change log, and the skeleton is in the gallery. Bars, tooltip and small line use the existing chart parts. See Q5-2, a gap in the system itself |
| AC-17 | Pass | Locked: `POST /api/overview`, `POST /api/overview/old-note` and `GET /api/status` all returned 401 with an empty body |

**Total: 17 Pass, 0 Fail.**

## Findings

| ID | Level | What happens | Steps | Screen / file |
|---|---|---|---|---|
| Q5-1 | Major | With a long Custom range, the month labels pile on top of each other and can't be read, and Spent bars get hidden behind Earned bars. At 47 months, all 24 labels overlap their neighbours at 320, at 375 too, and the labels overlap even at 1280. Labels also have no year, so "Jan … Jan … Jan" can't be told apart once a range spans years | Custom, 1 Jan 2023 to 13 Nov 2026, on the sample. Look at "Earned and spent by month" at 1280, 375 and 320 | Overview bars, `src/app/ui/overview.tsx` (`Bars`), `barBuckets` in `src/lib/overview/overview.ts` |
| Q5-2 | Major | In light mode, a zero or negative change on the Net worth hero ("+₹0", "−₹3,749") is drawn in `ink-2`, a dark ink, on the espresso hero. Contrast is about 2.9 to 1, under the 4.5 to 1 needed, so a fall in net worth is hard to read. Only `.delta--up` has a hero colour. Dark mode is fine | Light mode. This month on the sample (+₹0), or any period where net worth fell | Hero, `docs/design-system/system.css` (`.card--hero .delta`) |
| Q5-3 | Minor | At 320, "₹10,71,699" in the Earned tile is 5px wider than its box and touches the divider. A crore-sized figure would run past it | 320 wide, Last 12 months on the sample | Stats card, `.stat .figure` |
| Q5-4 | Minor | The chart's screen-reader label gives the period ("Earned and spent by month, 1 to 13 Nov 2026") while the chart shows the last 12 months, Dec 2025 to Nov 2026 | This month, then read the chart's label | `src/app/ui/overview.tsx` (`Bars` label) |
| Q5-5 | Minor | After an undo in another window, Reload refreshes the figures but leaves the old "Your data is updated … Undo" note on screen until the next page load. That note comes from Phase 4 | Two tabs. Undo in tab 2, then Reload in tab 1 | Shell note above the Overview |

No Blocker. Q5-1 and Q5-2 need fixing before merge, or the owner's written acceptance.

## Narrow re-test (2026-11-14)

QA, fresh agent. Re-tested Q5-1 to Q5-5 only, in the real app (production build, built-in browser) on a throwaway `HOME` with the made-up sample and the existing made-up password. A temporary launch entry set `HOME` and the port, and was removed afterwards, along with the throwaway data. The real data folder was never touched. For Q5-5 a small made-up file (40 sample rows) was sent as an update, and undone.

**Checks:** `npm test` 511 passed, 0 failed, no leftovers. `npm run typecheck` clean. `npm audit` 0 vulnerabilities. `npm run guard` 322 files, nothing blocked.

| ID | Result | Evidence |
|---|---|---|
| Q5-1 | Fixed | Custom 1 Jan 2023 to 13 Nov 2026 (47 months), measured from the page. 1280: labels "Jan 23, Jul, Jan 24, Jul, Jan 25, Jul, Jan 26, Jul", smallest gap 32px. 375: "Jan 23, Jan 24, Jan 25, Jan 26", gap 30px. 320: same four, gap 16px. No overlapping labels, no sideways scroll. In all 47 slots at every width Earned and Spent sit side by side inside their own slot (0 overlaps, 0 outside). Tooltip reads "May 2026" style (month and full year). Custom still shows months only. Last 12 at 375: "Jan, Mar, May, Jul, Sep, Nov" (every second month). See Q5-7 |
| Q5-2 | Fixed | Hero change line is `rgb(205,187,173)` (rail ink 2) in light and dark. Contrast 10.2 to 1 on the espresso `#1A0E08`, 5.5 to 1 on the darkest glow `#7A2306`. Checked flat (+₹0, This month) and falling (−₹3,02,797 after the test update, also flat-class). Readable in a light-mode capture. Rising stays green |
| Q5-3 | Fixed | At 320 the stat figures are 16.8px and "₹49,49,888" fits. A crore-sized "₹1,07,16,990" typed into a tile measured 108.8px in a 112px box, one line. The hero figure at 320 with a crore value is 229px of 256px. See Q5-6 for a negative crore figure |
| Q5-4 | Fixed | Label on This month and Last 12: "Earned and spent by month, Dec 2025 to Nov 2026. Use the left and right arrow keys to hear each month." Custom reads "Jan 2023 to Nov 2026" |
| Q5-5 | Fixed | Tab 1 on the Overview showed "Your data is updated … Undo". Undo in tab 2. Tab 1 showed "Your data changed in another window. Reload". After Reload the old Undo note was gone and replaced by "Your data is back to how it was." with Dismiss. The figures were the restored ones |

### New findings

| ID | Level | What happens | Steps | Screen / file |
|---|---|---|---|---|
| Q5-6 | Minor | At 320, a negative crore-sized figure in a stat tile is wider than its box ("−₹1,07,16,990" is 119px in 112px, about 7px into the tile's padding). Positive crore figures fit. Unlikely with real data this size | 320 wide. Put "−₹1,07,16,990" in the Saved tile (done by editing the page text, as the sample has no crore values) | `.stat .figure` |
| Q5-7 | Minor | At 320 with a 47-month range the bars are 1.6px wide with a 0.5px gap, so they are hard to tell apart. They don't overlap, and the owner chose months for long ranges. Last 12 months at 375 now starts its labels on January, so December has no label | 320, Custom 1 Jan 2023 to 13 Nov 2026 | Overview bars |

**Result:** Q5-1 to Q5-5 all Fixed. No Blocker or Major open. Q5-6 and Q5-7 are Minor: log them in the handoff, no further test round.

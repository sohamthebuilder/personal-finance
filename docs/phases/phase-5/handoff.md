# Phase 5 handoff

## Usage

| When | 5-hour | Weekly |
|---|---|---|
| Start (2026-11-13, 10:06 UTC) | 39%, resets 13:50 UTC | 48% |
| After the preview (2026-11-13, 12:34 UTC) | 47%, resets 13:50 UTC | 49% |
| After the build (2026-11-13) | 58%, resets 13:50 UTC | 51% |
| After the full QA run, budget stop (2026-11-13, 15:52 UTC) | 21% in the new window (the first window ran out during QA), resets 20:30 UTC | 54% |
| Resume (2026-11-14) | 0% | 54% |
| End, after fixes, re-test and Security sign-off (2026-11-14, 02:35 UTC) | 20%, resets 07:20 UTC | 57% |

## Brief (PM, 2026-11-13)

`brief.md` written. The owner took out user story 3 ("worth noticing"), then approved the rest with the two default answers: "Yes, approve all". Recorded under "Owner approval". Next: Designer preview.

## Preview (Designer, 2026-11-13)

`previews/overview.html` starts from the Overview preview approved in Phase 3 (`phase-3/previews/overview-period.html`). The Preview menu in the corner opens every state. Usage after the preview: 5-hour 47%, weekly 49%. This session's memory is at 47%, so the build should run in a fresh Engineer agent.

### What changed from Phase 3
- **Worth noticing taken out**, as the owner asked. At 1280 the layout is now hero 5 + stats 7, then bars 7 + top categories 5. At 375 and 320 it's one column in that order.
- **New states in the menu:** Loading (skeleton for 1.6s in the preview), first visit after the first upload (figures and bars roll up from zero once, with the "Your data is in…" note from screen 6), Earned below zero ("Saved · no rate" and its help line, with no Earned bar for that month and its axis label still there), "Your data changed in another window" with Reload, and "This screen couldn't load. Your data is safe." with Try again.
- **Top categories** are plain rows, using the file's category names (owner's answers).

### Design system (approved)
- **New part `.skel`**, the loading skeleton: blocks at the real shape (`--label`, `--figure`, `--display`, `--line`, `--spark`, `--chart`, `--row`) in `sunk`, or `rail-line` on the hero. No new colours, no shimmer, no movement apart from a 140ms fade in. Added to `system.css`, `README.md` (Components and Change log) and `gallery.html`, and synced.
- **Small fix (Q4-9):** at 380px or less, `.date-row` puts the year on its own row, so the Custom dialog no longer cuts the year off to "202…". The preview's dialog now uses `.date-row`, as the app does.

### For the Engineer
- `src/app/system.css` must be copied again from `docs/design-system/system.css`. A test keeps the two the same, so `npm test` fails until it's copied.
- Show the skeleton only when the load takes 200ms or more. Its wrapper gets `aria-busy="true"` and a "Loading" label.
- Motion as in design.md "Rules shared by screens 7 to 16": numbers roll 500ms, bars 400ms, the hero's small line redraws with no movement, and with reduced motion everything shows at once. The roll-up from zero happens only on the first visit after the first upload.
- The preview uses `style="..."` in places. The app can't (D-010), so use the build helper classes.

### Checked
In the browser at 1280, 375 and 320, light and dark: no sideways scroll, and every state's figures settle on the right values. Nothing shows in the console.

**Owner approval, 2026-11-13:** "Yes, approve all". That covers the Overview preview, the new `.skel` part and the `.date-row` fix. The build starts now, in a fresh Engineer agent.

## Build (Engineer, 2026-11-13)

5A and 5B are both built. Nothing is committed. Usage after the build: 5-hour 58%, weekly 51%.

### What was built
- **Server:** `src/lib/overview/overview.ts` has `buildOverview` (hero, small line, stats, rate state, few rows, bars, top 5) and `overviewFor` (reads the database, old-upload date, version). Every figure comes from `metrics.ts`. One new Phase 2 function, `spendingByCategory`, uses the same rows and dates as `periodMetrics`, and a test proves it adds up to Spent.
- **Routes:** `POST /api/overview` (figures for the session's period, plus `rollUp` once after the first upload) and `POST /api/overview/old-note` (dismiss until next login, in memory). `GET /api/status` now also returns the data version, so "changed in another window" can be spotted without counting as use. All of them sit behind the existing gate and `requireSession`.
- **Screen:** `src/app/ui/overview.tsx` replaces the placeholder in `src/app/page.tsx`. Wording and chart numbers are in `src/app/ui/overview-words.ts`. The period picker now follows the server's period, so "Show this month" updates the header too.
- **Design system:** the preview's inline spacings became classes (`.hero__*`, `.stat--wide`, `.card__head`, `.card__title`, `.cat-row`, `.sr-only`) at the end of `system.css`. Same values. Logged in the README as a small fix, synced, and copied to `src/app/system.css`. Bar sizes use SVG attributes. Meter widths and the tooltip's position are set from script (D-010).

### Which file covers each AC
| AC | Code | Tests |
|---|---|---|
| 1, 2, 5, 7 | `lib/overview/overview.ts`, `metrics.ts` | `tests/overview.test.ts` (sample file and hand-built rows) |
| 3, 4, 9, 10, 11, 12 (wording) | `ui/overview-words.ts`, `ui/overview.tsx` | `tests/overview-ui.test.ts`, `tests/overview.test.ts` |
| 6, 8, 14, 16 | `ui/overview.tsx` | `tests/overview-ui.test.ts` (source checks). Needs the browser |
| 12 (old-upload rule), 13, 17 | routes above, `session.ts` | `tests/overview.test.ts`, `tests/server.test.ts` (roll-up once, 401 when locked, version on status) |
| 15 | system classes | Browser only |

### Different or not done
- **Not checked in a real browser.** I had to hand over before my context ran out. QA needs to check 1280, 375 and 320 in light and dark, the 320px Custom dialog, the bar tooltip and keys, the motion, and that the CSP blocks nothing.
- **Custom over 24 months:** the build first showed financial years. The owner chose "Months, as approved" (2026-11-13), so Custom now always shows months (`barBuckets` in `src/lib/overview/overview.ts`, test in `tests/overview.test.ts`).
- **Year bars** are financial years ("FY27"), as in the preview.
- **The roll-up from zero** is remembered in server memory. A restart before the import note is dismissed would roll once more. That's minor.
- **Loading:** the skeleton shows for the first load, Try again and Reload. A period change keeps the old figures on screen and rolls them to the new ones.
- Test lists updated, with no checks weakened: `start-screen.test.ts` route list (+2 routes), and `server.test.ts` (placeholder text replaced by Overview checks).

### Checks
`npm test` 503 passed, 0 failed. `npm run typecheck` clean. `npm audit` 0 vulnerabilities. `npm run guard` nothing blocked.

### For QA
- The sample's "today" is 2026-06-15, and June has only a future-dated row. So This month on the sample looks like the no-rows state.
- In the browser, the period comes from the header picker. Every change refetches `/api/overview`.
- To see "changed in another window", change the data in a second window, then focus the first window.

## Budget stop after QA (2026-11-13)

Full QA (fresh agent): all 17 criteria pass, with Q5-1 and Q5-2 Major and Q5-3 to Q5-5 Minor (`test-report.md`). The phase has now used more than half of one 5-hour limit (39% to past 58% in the first window, then 21% in the next), so work stopped to ask the owner before fixes.

**Proposed fixes:**
- Q5-1: on long Custom ranges, thin the month labels so they never overlap, show the year on January labels, and put Earned and Spent side by side with no overlap. Custom still always shows months.
- Q5-2: the hero's flat or falling change line uses the hero's own light secondary ink (`rail-ink-2`, an existing token). It's a small design system fix.
- Q5-3 to Q5-5 (Minor, cheap): fit crore-sized figures at 320, name the chart's real months in its screen-reader label, and clear the old Undo note on Reload.

**Then:** narrow re-test (Sonnet), Security sign-off (the new routes send figures), merge checklist.

**Owner, 2026-11-13: "Pause for now".** Work is paused. Nothing is committed, on branch `phase-5`. To pick up in a fresh session:
1. Fixes (Engineer, fresh agent): Q5-1 to Q5-5, as proposed above. Record Q5-2 as a small fix in the design system change log, and copy `system.css` into the app again.
2. Narrow re-test (QA, fresh agent, Sonnet): Q5-1 to Q5-5 only.
3. Security sign-off (fresh agent): the new routes `/api/overview` and `/api/overview/old-note`, the change to `/api/status`, and the new session fields.
4. Merge checklist, end usage, owner sign-off. Commit, push and merge only when the owner asks.

**Owner, 2026-11-14: "resume".** Fixes Q5-1 to Q5-5 start now, as proposed, in a fresh Engineer agent.

## Fixes after QA (Engineer, 2026-11-14)

All five findings fixed, as the owner approved. Nothing committed, on branch `phase-5`.

- **Q5-1 (long Custom ranges):** Custom still always shows months. The month labels' spacing is now picked from the chart's measured width (`labelStep`): every 1, 2, 3, 4, 6 or 12 months (then whole years), so no two labels touch, and labels line up on January (`labelsShown`). A Custom range over more than one calendar year shows the short year on each January ("Jan 25"); other months stay "Feb". Last 12 months and the rest keep plain labels. Earned and Spent now sit side by side with a gap in every slot and get thinner on long ranges (`barLayout`), never covering each other or the next month. The tooltip keeps "Jan 2025". Files: `src/lib/overview/overview.ts` (`barBuckets`), `src/app/ui/overview-words.ts`, `src/app/ui/overview.tsx` (`Bars`).
- **Q5-2 (hero contrast):** design system small fix, `.card--hero .delta { color: var(--rail-ink-2); }` (existing token), with `.delta--up` still `rail-gain`. The real minus stays. Contrast on the hero's espresso `#1A0E08`: 10.2 to 1 (was 2.9), and 5.5 to 1 even on the darkest glow `#7A2306`. The rail tokens are the same in both themes, so this holds in light and dark. Logged in the README change log, synced to previews, copied to `src/app/system.css`.
- **Q5-3 (crore figures at 320):** design system small fix, each `.stat` is a size container and `.stat .figure` is `min(var(--t-figure), 15cqi)` on one line. At 320 the figure is 16.8px: "₹10,71,699" is 93px and "₹1,07,16,990" 109px in a 112px box. At 375 it is 20.9px (almost unchanged) and at 1280 the usual 26px. Logged in the README change log.
- **Q5-4 (chart label):** the label now names the bars shown, e.g. "Earned and spent by month, Dec 2025 to Nov 2026. Use the left and right arrow keys to hear each month." (`chartLabel`).
- **Q5-5 (old Undo note):** Reload now also refreshes the server-drawn part of the page (`router.refresh()`), so the Phase 4 data note shows the new state, and the note is keyed on its kind and data version so it starts over when the data changes. Files: `src/app/ui/overview.tsx`, `src/app/page.tsx`.

**New wording:** "Jan 25"-style axis labels on multi-year Custom ranges; the chart label's month span ("Dec 2025 to Nov 2026") replaces the period line. Nothing else.

**Tests:** 8 new (`tests/overview.test.ts` Q5-1 year labels; `tests/overview-ui.test.ts` label spacing at 1280/375/320 for 3 to 120 months, January alignment, bar layout, chart label, the two CSS rules, Reload refresh). The AC-6 source check now looks for `chartLabel(...)`, whose wording is tested directly. No test weakened.

**Checks:** `npm test` 511 passed, 0 failed. Typecheck clean. Audit 0 vulnerabilities. Guard 322 files, nothing blocked. No `style="..."`.

**Browser:** checked in the built-in browser on the synced Phase 5 preview (uses the new `system.css`): hero flat-change colour is `rail-ink-2`; stat figure sizes and widths as above at 320, 375 and 1280; bars chart box widths (256, 311, 505) and real label widths ("Jan 25" 38.9px) used in the tests. Not checked in the running app: starting it safely needs a throwaway `HOME`, which `launch.json` can't set, so the React chart (Q5-1), the screen-reader label (Q5-4) and Reload (Q5-5) are covered by tests only.

**For QA to re-test (narrow):** Q5-1 Custom 1 Jan 2023 to 13 Nov 2026 at 1280, 375, 320 (labels apart, "Jan 23…Jan 26", side-by-side bars, tooltip "Jan 2025"); Q5-2 light mode hero with +₹0 or a fall; Q5-3 Last 12 at 320 (Earned tile), plus a crore figure; Q5-4 chart label on This month; Q5-5 two tabs, update or undo in tab 2, Reload in tab 1. Also glance at Last 12 at 375 (labels every second month as before).

## Finish (2026-11-14)

Fixes Q5-1 to Q5-5 done (Engineer). Narrow re-test (Sonnet): all five Fixed, no Blocker or Major. New Minors Q5-6 (a negative crore figure overflows its tile at 320) and Q5-7 (bars 1.6px wide on a 47-month range at 320; Last 12 at 375 has no December label), logged with no further round. Security (fresh agent): signed off with no conditions; S5-1 Minor (the status poll runs harmless schema statements each time) for later. S4-16 and S4-17 from Phase 4 stay open. Checks: 511 tests, typecheck, audit 0, guard clean. `.claude/launch.json` gains a `previews` entry (a local server for design previews, bound to 127.0.0.1).

**Merge checklist (shown to the owner)**
- [x] The owner's approval of the brief, the preview and the design system changes is recorded, as is the later choice "Months, as approved".
- [x] Every criterion (AC-1 to AC-17) has a result: 17 Pass in `test-report.md`.
- [x] No Blocker or Major open. Q5-1 and Q5-2 fixed and re-tested.
- [x] `npm test`, `npm run typecheck`, `npm audit`, `npm run guard` pass.
- [x] Security signed off with no "before merge" conditions.
- [x] No owner-only steps beyond reviewing the preview.
- [x] The three GitHub checks pass on pull request #12 (2026-11-14).
- [x] Owner sign-off in chat, 2026-11-14: "Yes, sign off". Commit, push and merge only when the owner asks.

**Owner, 2026-11-14: "Yes, merge".** Pull request #12 merged into `main`.

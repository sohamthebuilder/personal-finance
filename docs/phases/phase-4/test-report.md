# Phase 4 test report, Part 4A (QA, full run, 2026-11-08)

Independent QA in a fresh agent. Everything ran on a made-up HOME in the scratch folder. The real data folder was never touched and still doesn't exist. Only made-up passwords were used.

## Summary

- **1 Blocker, 0 Major, 7 Minor.**
- The Blocker is visual and small: in the "Choose a period" dialog on wide windows, the day, month and year pickers overlap and the year sticks out of the dialog.
- Everything else in Part 4A worked as specified: create password, log in, slow-down, Locked, log out, Back, delete my data, the wipe command, the font and the address checks.

## Results per criterion

| AC | Result | Evidence |
|---|---|---|
| 1 Screens match spec, light/dark, 1280/375/320 | **Fail** | Screens 1, 2, 3, 14, the shell and Settings match their wording, states and keyboard order, in light and dark, with no sideways scroll at 1280, 375 and 320. But the Custom period dialog breaks at 1280 (Q4-1) |
| 2 Owner approved previews 2, 3, 14 | Pass | Recorded in the brief's "Owner approval", "Later changes approved" |
| 3 Session on every page and route, header checks, size limits | Pass | No session: `/settings`, `/settings/delete`, `/upload`, `/overview`, `/fonts/OFL.txt`, `/_next/static/` all go back to `/` (303); `/api/status`, `/api/period`, `/api/logout`, `/api/delete` give 401. Missing Origin, cross-site, wrong Host: 403. 5 KB body: 413. Chunked: 411. `Next-Action`: 403. CSP, `Referrer-Policy: no-referrer`, `no-store` on every reply |
| 4 File text as plain text only | Pass (4A scope) | 4A shows no file text. No `innerHTML` or `dangerouslySetInnerHTML` in `src/`, no inline `style=` in served pages. The test with HTML-like names belongs to 4B |
| 5 Fixed error wording, nothing logged | Pass | Every error seen used the design's words. The app's output held only start-up lines: no password, token or error text |
| 6 test, typecheck, audit, guard | Pass | 425 of 425 tests, typecheck clean, 0 vulnerabilities, guard "nothing blocked". No new packages. Re-run after the password list changed (see below): same result |
| 7 Password rules, server repeats them | Pass | Server refused: too short, 257 characters, `aaaa…`, `abcdefghijklmnop`, `123456789012345`, reverse run, `abcabc…`, a listed password in any case. 14 emoji (28 code units) refused as too short, so it counts characters. Spaces kept. Mismatch and no tick refused by the server too |
| 8 Field handling, POST forms | Pass | Page-only errors kept the text, hidden. After a server reply the fields were empty. All forms `method="post"`, spell check and auto-correct off, delete field `autocomplete="off"`. No password in any address, log or browser storage |
| 9 Key in memory, cookie, lock, Back | Pass, plain-Chrome part Not tested | Cookie is exactly `pf_session=…; Path=/; HttpOnly; SameSite=Strict`, not readable by the page. New token each log in; old and planted tokens give 401. Log out sends `Clear-Site-Data: "cache"` and an expired cookie. Restart shows "The app restarted, so it's locked." Back after log out and after a lock showed only the Locked or Log in screen, in the built-in browser. Plain Chrome wasn't used (see "Not tested"). 15-minute idle wasn't waited out |
| 10 Slow-down on the server, one count | Pass | 3 free tries, then "Too many tries. Try again in 30 seconds." with a live countdown and the button off; the next wait was 60. The correct password sent during a wait was refused. Wrong tries on Delete my data raised the wait on log in too. 5 wrong tries on Delete locked the app |
| 11 Server picks the start screen | Pass | `/?screen=shell`, `/?step=shell`, `/settings`, `/upload` never skipped a step at the upload or summary step. Every row of the start-up table seen: no files, files, marker (finished on start), salt missing ("Some of the app's files are missing…"). Create password refused once a database exists |
| 12 Delete my data | Pass | Wrong password: "That password isn't right. Nothing was deleted." Correct password plus tick removed the database and salt, kept an unrelated file, and ended on Create password with "Everything in the app is deleted." A planted marker was finished at start-up |
| 13 Forgotten-password wipe | Pass | Panel wording matches. `npm run wipe`: refused while the app ran; lists exact files; `delete` (lower case) stops; `DELETE` removes only the app's files and counts the other file without naming it; second run says nothing to delete; refuses without a terminal or a full HOME. "Copied" couldn't be seen: the built-in browser blocks the clipboard, and the failure line showed correctly with the command still selectable. See Q4-6 |
| 14 Local font | Pass | 30,024-byte woff2, SHA-256 matches D-024, `OFL.txt` beside it, loaded from `/fonts/google-sans-flex.woff2`. ₹ comes from the font, weights 400 to 700 render differently. `fonts.css` uses no `@import` or `local()`. Only that exact font path passes without a session (query, other case, encoded dot all refused) |
| 15 No Google font hosts, local requests only | Pass | No `fonts.googleapis.com` or `fonts.gstatic.com` in `src/`, `public/` or `.next/`. Every request in the browser went to 127.0.0.1. `/gallery.html` and preview paths give 404 |
| 16 Shell | Pass, with Q4-1 | Header has period, Upload, Settings, Log out. Sidebar collapses to 72px with "Expand sidebar" tooltip. Narrow: tab bar, Upload icon, More menu with Settings and Log out. Period sent in the request body to `/api/period`, never in the address; it opens on This month after log in. Overview placeholder says it arrives in the next phase |

## Findings

| Id | Level | What | Where |
|---|---|---|---|
| Q4-1 | **Blocker** | In "Choose a period" at 1280 wide, each day, month and year picker is 164px wide inside a 420px dialog, so they overlap, the day and month arrows are hidden, and the year ends 17px outside the dialog. Cause: the dialog sits inside the header, so the header's `.top .picker { width: 164px }` rule also hits the date pickers. Fine at 375 and 320. Fails AC-1 | Screen 7 Custom dialog |
| Q4-2 | Minor | After a server refusal on Create password (for example "too easy to guess"), focus drops to the page body instead of the password field. The field is still switched off at the moment focus is moved | Screen 1 |
| Q4-3 | Minor | Reloading during a wait shows the Log in screen with no countdown until another try is made. The server still refuses correctly | Screens 2, 3 |
| Q4-4 | Minor | After choosing a Custom period, the picker reads "Custom" and the chosen dates show nowhere. The range line comes with the dashboards (Phase 5) | Screen 7 |
| Q4-5 | Minor | design.md says the narrow period picker is 132px, but the design system's own CSS makes it fill the row (as built). The two documents disagree | Design docs |
| Q4-6 | Minor, for Security | The screen shows `npm run wipe`, not Decision 9's quoted script path. It only works from the project folder, and in another folder with its own `wipe` script it would run that instead. The handoff already asks Security to rule on this | Screen 2 panel |
| Q4-7 | Minor | The Locked reason is kept for the whole app: a window whose session was replaced by a log in elsewhere later shows "You're logged out." Single-owner app, so unlikely | Screen 3 |
| Q4-8 | Minor | If the wipe prompt gets end-of-input (Control-D) instead of a line, Node prints a "Detected unsettled top-level await" warning with code lines. Nothing is deleted | `scripts/wipe-data.ts` |

## Checks run

- `npm test` (425 passed, twice), `npm run typecheck`, `npm audit` (0), `npm run guard`, `npm run build` (all routes built).
- Built app run with `HOME` set to a scratch folder and `APP_PORT=3411`, restarted three times.
- Built-in browser: create password with every error state, log in, wrong tries and waits, forgot panel and Copy, Locked after restart, log out, Back twice, light and dark, 1280, 375 and 320, keyboard order on screens 1, 2, 14 and the shell (wide and narrow), period picker and Custom dialog, network list.
- `curl`: header, size, session, font-path and crafted-address checks; cookie and log-out headers.
- To reach the shell, the made-up database was moved to later steps with the engineer's test helper (`tests/support/app-helpers.ts`), run outside the app. The app itself offers no such path.
- The wipe script was run through `script` to give it a terminal, on the scratch folder only.

## Not tested

- **Plain Chrome Back check (condition 51):** done in the built-in browser only. The owner's own Chrome wasn't used. Someone still needs to record it in plain Chrome.
- **15-minute idle lock and clock going backwards:** not waited out live; covered only by the engineer's fake-clock tests.
- **Two password checks at once, NFKC folding, delete cut short after the marker ("Some files couldn't be deleted yet"):** unit tests only.
- **Copy, done ("Copied"):** the built-in browser blocks the clipboard.
- **Note:** the common-password list changed from the 40-line starter list to the 5,348-line SecLists cut (D-025) during this run. The browser checks used the starter list. Tests and guard were re-run on the new list and passed. Its contents weren't reviewed here.

## Narrow re-test (QA, Sonnet, 2026-11-09)

Fresh QA agent. Built app on a made-up HOME in the scratch folder (port 3411), made-up passwords only. Nothing committed, no app code changed.

| Item | Result | Evidence |
|---|---|---|
| Q4-1 Custom dialog pickers | **Pass** | 1280: pickers are 102, 132 and 122px, side by side inside the 420px dialog (430 to 850), no overlap. 375 and 320: two rows of three, all inside the dialog, page width equals window width (no sideways scroll) |
| Q4-2 Focus after refusal | **Pass** | Create password with a listed password: focus in Password, field on and empty, "too easy to guess" shown. Delete my data with a wrong password: focus in the password field, field on and empty, "That password isn't right. Nothing was deleted." |
| Q4-3 Reload during wait | **Pass** | After 4 wrong tries, a reload showed "Too many tries. Try again in 27 seconds." with Log in switched off. It switched back on when the wait ended |
| Q4-4 Custom range shown | **Pass** | Picked 1 Apr 2024 to 30 Jun 2024: card shows "1 Apr to 30 Jun 2024", picker reads "Custom". This month shows "1 to 9 Nov 2026" |
| Q4-8 Control-D at wipe prompt | **Pass** | Run through `script` on the scratch HOME: prints "Nothing was deleted.", no Node warning, both app files still there |
| AC-7 with new list | **Pass** | Server refused (TOO_COMMON) five words taken from the list (lines 3, 500, 2000, 5000, 5349), each in lower and UPPER case, plus "CorrectHorseBatteryStaple", 16 a's, `abcdefghijklmnop`, `abcabc...`. Too short and 257 characters still refused with their own errors. A made-up unlisted 31-character phrase with spaces was accepted |
| Condition 44, list file | **Pass** | `common-passwords.txt` is 94,740 bytes, SHA-256 `c3fe0385...a14d1`, both match D-025. 5,350 lines = 2 comment lines + 5,348 entries, all 15 to 158 characters. `common-passwords.LICENSE` is beside it. Guard passes on it unchanged. Tests cover a listed word, repeated character, repeated unit and a run (part of the 432 passing) |
| Checks | **Pass** | `npm test` 432 of 432, `npm run typecheck` clean, `npm run guard` nothing blocked (170 files), `npm audit` 0 vulnerabilities |

**Original Blocker Q4-1 is closed. No Blocker or Major is open.**

### New findings

| Id | Level | What |
|---|---|---|
| Q4-9 | Minor | At 320 wide, chosen values in the dialog's pickers are cut ("30" shows as "3(", "2024" as "Yea" when empty and "202..." when filled). No overlap or sideways scroll, so Q4-1 passes. The engineer already noted this for the Designer. Needs a design-system change |
| Q4-10 | Minor, not reproduced | Once, after the first wait ended, typing the correct password and pressing Return gave a second wait (59 seconds) instead of logging in. A second try after that wait worked. I couldn't repeat it and can't rule out that my typing arrived before the page was ready. Worth a look if it shows up again |

Q4-5, Q4-6 and Q4-7 from the first run are unchanged and still open as Minor, as the handoff says.

### Not tested

- Plain-Chrome Back check (condition 51), the 15-minute idle lock, and Copy on the wipe panel, as before.
- Search for every list word: only five lines, in two cases, plus the 4A rules were tried. The full list was checked only by size, hash and format.
- Dark mode and light mode were not re-compared. This run used the dark theme only.

## Back after log out in the owner's browser (condition 51, AC-9), 2026-11-09

The owner ran it in their own browser, which is Brave (built on Chrome), on a made-up HOME with a made-up database at the shell step and the test password from `tests/support/app-helpers.ts`. After logging in, opening a page and logging out, Back showed only the Locked screen. No app page or figure came back. **Pass.**

- **Q4-11 (Minor):** the first Back showed the Locked screen without its password field. A second Back showed it with the field. Nothing private showed. For Security to note at sign-off.
- The browser extension couldn't run this check: Brave labels pages it opens as `Sec-Fetch-Site: cross-site`, and the front gate correctly refuses them with 403. A typed address works.
- The first try ended on the placeholder upload screen, which has no Log out (as approved for 4A), so the database was moved to the shell step for the second try.

## QA, Part 4B (2026-11-11)

Fresh QA agent on `phase-4b` (uncommitted work). The production build ran on a made-up HOME in a scratch folder with a made-up password. Data came from the repo's own made-up test helpers (`tests/support/import-helpers.ts`), built in memory and sent over HTTP or handed to the page's file field from memory. No spreadsheet file was written, and the spreadsheet hook and data guard were left alone. Large set for AC-27: 60 accounts (three with an HTML name, a 300-character unbroken name and a direction-changing character), 40 income and 40 expense categories with 3 subcategories each, 300 rows. Browser: the built-in browser pane at 1280, 375 and 320, light and dark.

### Checks run

`npm test` 475 passed, 0 failed. `npm run typecheck` passed. `npm audit` 0 vulnerabilities. `npm run guard` 248 files, nothing blocked. No failing lines.

### Results per criterion

| AC | Result | Evidence |
|---|---|---|
| AC-1 | Pass | By eye: screens 4, 5 (all 3 parts), 6, 8 (stage 1 and review), the reminder note, Settings Setup and Your data. No sideways scroll at 1280, 375 or 320 on any of them (page width measured). Light and dark both shown. Wording matches `design.md`. Keyboard: groups open and close with Enter and Space and report `aria-expanded`; pickers open with Enter, arrows move, Enter picks; Esc clears search; Options menu arrows and Esc back to Options; dialogs start on the safe button and trap focus; screen 8 focus starts on Cancel. See Q4B-1 and Q4B-2 |
| AC-2 | Pass | Owner approval section records the yes for screens 2, 3, 14 (2026-11-08) and the redrawn 5, 8 and 13 (2026-11-10) |
| AC-3 | Pass | With no session, every POST route (`upload`, `update/upload`, `update/rows`, `update/confirm`, `update/cancel`, `undo`, `summary/confirm`, `start-over`, `note/dismiss`, `setup`, `period`, `logout`, `delete`) gave 401; `/upload`, `/settings`, `/settings/delete` gave 303; `/api/status` 401. Cross-site `Origin` on `/api/setup` 403, no `Origin` on upload 403. CSP and `Referrer-Policy: no-referrer` on Settings. Over-size setup form 413 (in tests) |
| AC-4 | Pass | HTML, long and direction-changing names show as text on screens 5, 8 and Settings. A group named `<script>x</script>` sent over HTTP comes back escaped; tab title stays "Personal Finance". No `innerHTML` or `dangerouslySetInnerHTML` in `src/`. No names in the server log. Layout issue with the long name: Q4B-1 |
| AC-5 | Pass | Seen: the BAD_AMOUNT text with "Rows 3, 4 and 3 more." and the "Nothing was saved…" line; every group-name error; "Setup couldn't be saved. Nothing was changed."; "Your data changed in another window." with Reload. No `console.*` in `src/`; server log has 6 lines, no errors |
| AC-6 | Pass | All four checks pass. No new packages |
| AC-17 | Pass | Code read: worker with 768/64/4 MB limits, 60 s end, `env: {}`, bytes transferred. Tests for gate size limit, memory, timeout and no temp file ran and passed. Junk bytes give `NOT_EXCEL`; wrong content type 400. Limits not pushed by hand |
| AC-18 | Pass | Row refusal by eye on screen 4. `ALREADY_IMPORTED` and the same-file note covered by tests that ran (not seen by eye) |
| AC-19 | Pass | By eye with the large set: Part 1 of 3, 2 of 3, 3 of 3; Continue with 15 ungrouped shows "Choose a group." on each, opens Needs a group and focuses the first empty picker; income and expenses optional; Back to setup keeps saved answers; summary lines add up (₹82,230 = all income − all spending, and the six group totals add to it) |
| AC-20 | Pass | By eye: New 5, Changed 0, Removed 300, net worth after and change, new account (Ungrouped), new income and expense categories (Not grouped), removed-names line, partial-file warning with "Most of your current accounts aren't in this file."; Replace stays off until ticked |
| AC-21 | Pass | Replace, then Undo from the note dialog and from Settings; data and groups came back. Raw database in the made-up HOME holds no made-up name in plain text. Reminder note shows after the first import and after the update (Undo and Dismiss) |
| AC-22 | Pass | After replace, Settings listed only the 5 accounts in the new file; Undo brought all 60 back with their groups. Test for condition 36 ran |
| AC-23 | Pass | Settings: Ungrouped first and allowed; add group, move a category, Save, reload keeps it; save bar states; stale save from a second tab refused with the Reload note and controls off; "Leave without saving?" on sidebar links and Log out |
| AC-24 | Pass | Covered by tests that ran (amounts limit on replace and first import; `today` from the server). Not probed by hand |
| AC-27 | Pass | 60 accounts, 40 + 40 categories with subcategories: folds by keyboard, search narrows ("fund 4" gives 2 matches, "yacht" gives the no-match line with Clear search), no sideways scroll at 1280, 375, 320 |
| AC-28 | Pass | By eye: add, rename, remove (dialog "Its 1 category goes back to Not grouped."), the four name errors, the 12-group limit line, same name allowed in income and expenses. Over HTTP the server refuses control characters, line breaks, tabs, 41 visible characters, a name that only differs by a no-break space, bad indexes and unknown account groups. Gaps in Q4B-5 |
| AC-29 | Pass | Tests that ran cover income in several groups and the breakdown. Summary figure checks out by hand with all income counted as Earned |

Totals: 19 Pass, 0 Fail, 0 Not verified.

### Findings

**Q4B-1 Minor. A very long unbroken name overlaps the picker or is cut off.**
Steps: upload a made-up file with an account named "Made-up" followed by 300 "W"s, open screen 5 (or Settings Setup) and find its row. At 1280 the name runs under the group picker and past the card's right edge. At 375 and 320 it is cut off at the screen edge. The page itself doesn't scroll sideways. The name span is 4,316px wide; it doesn't wrap. Real names this long are unlikely.

**Q4B-2 Minor. Closing the screen 5 "Remove group" dialog with Esc puts focus on the group row, not the Options button.**
Steps: screen 5 part 2, add a group, put a category in it, focus its Options button, Enter, Down, Enter (Remove), then Esc. Focus lands on the group's row. The Undo dialog does return focus to the button that opened it.

**Q4B-3 Minor. A search that matches only a group name says "0 matches" while showing groups.**
Steps: screen 5 part 3, add groups G10, G11 and G12 with no categories, type "g1" in Find a category. The three groups show, and the count reads "0 matches".

**Q4B-4 Minor. Undo from Settings shows no note on Settings.**
Steps: after an update, Settings, Your data, Undo, Undo update. The page reloads on Settings Setup with no message. "Your data is back to how it was." appears only on Overview afterwards.

**Q4B-5 Minor. The group-name checks let through names that look empty or look the same.**
Steps (POST `/api/setup` with a live session and the current version): a name that is only a zero-width space is saved; "Café" written two ways (one letter vs letter plus accent) is saved as two groups; a name with a right-to-left override character is saved. The page uses the same check. Owner-typed only, so low risk.

**Q4B-6 Minor. Accounts inside a group sort as text, not by number.**
Steps: screen 5, Needs a group: "Made-up Deposit 16, 24, 32, 40, 48, 56, 8". `design.md` sets no order, so this is a note only.

### Not verified by eye

- Screen 4 loading stages and drag-over border, and screen 8's same-file note, "Show 50 more" and Changed rows with "was ₹…" (the made-up update had no changed rows). These are covered by tests that ran.
- Screen 5 parts 2 and 3 in dark mode (switching theme needs a reload, which would have lost the unsaved answers). Part 1, screens 4, 6 and 8, the note and Settings were seen in dark mode.
- Reduced motion and timing of the animations.

### Re-test (Sonnet, 2026-11-11)

Fresh QA agent, narrow re-test of Q4B-1 to Q4B-5. Production build rerun on a new made-up HOME with a made-up password and the same in-memory made-up data (60 accounts, 40 + 40 categories); no spreadsheet file written. Built-in browser pane for the screens; HTTP probes for Q4B-5.

Checks: `npm test` 478 passed, 0 failed. `npm run typecheck` passed. `npm audit` 0 vulnerabilities. `npm run guard` 248 files, nothing blocked. No failing lines.

| Item | Result | Evidence |
|---|---|---|
| Q4B-1 | Pass | A 300-character unbroken account name now wraps on screen 5 (part 1) and Settings Setup. 1280: ends before the picker, no overlap. 375 and 320: sits above the picker, inside the card. Page width equals the window at 1280, 375 and 320, light and dark (both on 320 and 1280 screen 5; Settings measured at 1280 light/dark, 375 light, 320 dark). Group names are capped at 40 characters, so a 300-character group name can't be saved; not tried |
| Q4B-2 | Pass | By keyboard: Options, Enter, Down, Enter opens "Remove “Work”?" with focus on Keep group. Enter on Keep group and Esc both returned focus to that group's Options button |
| Q4B-3 | Pass | Three empty groups G10, G11, G12 and a search for "g1" shows those three groups and reads "3 matches" (checked on part 2, income; part 3 uses the same screen) |
| Q4B-4 | Pass | Update, then Settings, Your data, Undo, Undo update: Settings shows "Your data is back to how it was." Dismiss clears it, and it stays gone after reload |
| Q4B-5 | Pass | Over HTTP: a zero-width-space-only name gives NAME_EMPTY 400. "Café" written both ways gives NAME_TAKEN 400. A right-to-left override character gives NAME_NOT_PLAIN 400. Control characters, line break and tab still 400. 40 and 41 emoji limits, bad indexes, unknown group and extra-key cases behave as before |

Regression look: screens 5 and 13 at 375 look right (header, tabs, group cards, pickers stacked under names, bottom nav). No new findings.

Totals: 5 Pass, 0 Fail. Q4B-6 stays a note. Not tried: a 300-character group name (the 40-character limit stops it).

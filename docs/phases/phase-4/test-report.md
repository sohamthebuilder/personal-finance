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

# Phase 4 handoff

## Usage

| When | 5-hour | Weekly |
|---|---|---|
| Start (2026-11-08) | 22% | 76% |
| After the 4A build and font (2026-11-08) | 63% | 81% |
| After QA and fixes, budget stop (2026-11-08) | 89% | 84% |
| 4A finish session start (2026-11-09, 06:17 UTC) | 1% | 85% |
| 4A end, after Security sign-off (2026-11-09, 06:35 UTC) | 18% | 87% |

## State

Brief written by the PM on 2026-11-08 and shown to the owner. The owner approved it on 2026-11-08 with all five defaults, in their words "Yes, approve". Part 4A is running in this session. Nothing is committed.

**Previews, 2026-11-08.** The Designer made `previews/login-locked-delete.html` for screens 2, 3 and 14, with every state in the preview menu. No sideways scroll at 1280, 375 and 320. Checked in light and dark. Waiting for the owner's yes, together with:
- A design system addition: `.cmd` (command box with Copy), `--font-code` (the Mac's own code font, nothing downloaded), and `copy` and `trash` icons. Logged in the change log as waiting.
- Two lines of new wording not in `design.md`: the Log in line "Enter your password to open the app." and the heading "Start again without your password" on the forgotten-password panel. The forgotten-password text is split into three numbered steps, keeping its words.

Security's threat review is running as a fresh agent.

**Security threat review, 2026-11-08.** Done as a fresh agent, in `security.md`: ready to build with conditions. 0 Blockers, 7 Majors, 6 Minors, build conditions 40 to 53 (4A) and 54 to 58 (4B). No new npm dependency. Two open points for the owner:
- The 4A try-out ends at a placeholder upload screen, with no shortcut to fill in data (S4-6, condition 52).
- S4-13: AC-18 says a re-upload shows `ALREADY_IMPORTED`, but screen 8 shows "This file matches your current data". PM proposal: keep `ALREADY_IMPORTED` only on the first-upload route, and use screen 8's note on update. This changes AC-18's wording, so it needs the owner's yes.

Usage after the review: 5-hour 33%, weekly 77%. This session's memory is at 47%, so the build runs in a fresh Engineer agent.

**Owner approval, 2026-11-08:** "Yes, approve all". That covers the three previews, the design system addition, the two new lines of wording, the placeholder upload screen at the end of 4A, and AC-18's new wording. Building Part 4A starts now.

## Build, Part 4A (Engineer, 2026-11-08)

Built in a fresh Engineer agent. Nothing is committed. No new npm packages.

### What was built

- **Login and safety core** (`src/lib/auth/`): password rules and a starter common-password list, one shared session store, the slow-down, auto-lock, the server-chosen start screen, Delete my data. `src/lib/data-files.ts` names the data folder and every file in it, for the app and the wipe script alike. `src/lib/setup/progress.ts` works out the first-time step from what's saved.
- **Front gate** (`src/lib/security/gate.ts`, used by `server.ts`): existing checks, then server actions, then size, then session. `server.ts` also sets `umask 077`, makes the data folder `0700`, finishes a cut-short delete, writes the run file, starts the 30-second lock timer, and closes the database on Control-C.
- **Routes** (`src/app/api/`): create password, log in, log out, delete, finish delete, period, status.
- **Screens**: 1 Create password, 2 Log in (with the forgotten-password steps and Copy), 3 Locked, a placeholder upload screen, 7 the shell with a placeholder Overview, a small Settings page with "Delete my data", 14 Delete my data. `src/app/ui/` holds the pieces.
- **Wipe**: `npm run wipe` runs `scripts/wipe-data.ts`.
- **Font wiring**: `src/app/fonts.css` points at `/fonts/google-sans-flex.woff2` only. The file isn't there yet, so the Mac's own font shows (checked in the browser: it looks right).
- **Design system**: `system.css` copied into the app unchanged (a test keeps the two the same). Small fix, no change to the look: a "Build helpers" block at the end of `system.css` holds the previews' inline spacings as classes (`.sprite`, a few spacing classes, `.steps`, `.with-glyph`, `.meter` step widths, `.menu`, `.date-row`), plus no underline on links styled as buttons. The change log has a line for it.
- **Tests**: `tests/auth-password`, `auth-session`, `start-screen`, `gate`, `delete-wipe`, `app-source`, and new end-to-end checks in `tests/server.test.ts`. The server test now runs the app on a made-up HOME in the temp folder.

### Conditions 40 to 53

| # | Met | How it's tested |
|---|---|---|
| 40 | Yes | `gate.test.ts`: Next-Action refused, no length, chunked, over-size (4 KiB and 16 KiB), every page and route without a session (found from the files). `app-source.test.ts`: no `"use server"`. `server.test.ts` repeats size and server-action checks on the running app |
| 41 | Yes | `auth-session.test.ts`: exact cookie text, new token each log in, planted token refused, expired on log out. `server.test.ts` checks the real headers |
| 42 | Yes | `auth-session.test.ts` with a fake clock: idle lock with no request, status check isn't use, clock going backwards locks |
| 43 | Yes | `auth-password.test.ts`: é two ways, full-width letters, lone surrogate refused, over 1,024 refused before hashing |
| 44 | **Partly** | Rules tested (listed, repeated character, repeated unit, runs). The list is a short hand-written starter, not SecLists, because downloading needs your yes. See "Not done" |
| 45 | Yes | `auth-session.test.ts`: correct password refused during a wait with no hashing, second check refused while one runs, one count across log in, Locked and delete, 5 wrong deletes lock |
| 46 | Yes | `start-screen.test.ts` (every row of the start-up table and every step), `gate.test.ts` and `server.test.ts` (crafted addresses such as `/?screen=shell`) |
| 47 | Yes | `delete-wipe.test.ts`, all on a made-up HOME: siblings and link targets survive, running app refused, stale run file cleared, half-done delete finishes, safe twice, DELETE needed |
| 48 | Yes | `start-screen.test.ts`: folder `0700`, files owner-only, a linked folder refused. `umask` set in `server.ts` |
| 49 | Yes | `gate.test.ts`: only the exact font path, no query or other spelling. `app-source.test.ts`: `public/` may hold only the font and `OFL.txt` |
| 50 | Yes | `app-source.test.ts`, plus a scan of the build in `server.test.ts` |
| 51 | **Needs a recorded check** | `Clear-Site-Data` and the `pageshow` handler are in, and tested. In the built-in browser, Back after log out showed the Locked screen. The recorded check in plain Chrome is for QA |
| 52 | Yes | No seed route, flag or setting (`start-screen.test.ts` lists every route and scans for settings and web-address reads). The shell is tested only with made-up databases built by `tests/support/app-helpers.ts` |
| 53 | Yes | `server.test.ts` captures the app's output through a wrong log in, a too-common password and a wrong delete, and checks no password or token appears. No route logs anything |

### Not done, or different

- **Common-password list (Decision 7)**: `src/lib/auth/common-passwords.txt` is a short starter list I wrote. The SecLists list needs a download, which needs your yes. Then: keep lines of 15 or more, record source, licence and SHA-256 in `DECISIONS.md`, and put the licence beside it.
- **Wipe command**: the screen shows `npm run wipe`, as in the approved preview, not Decision 9's `node '<path>/scripts/wipe-data.ts'`. It holds no path, so there's nothing to quote. It must be run from the project folder, which is where the app's Terminal window already is. Security should confirm this at sign-off.
- **In-app delete keeps the run file**, because the app is still running. The wipe script removes it.
- **Marker order**: screen 14 writes the marker before ending the session (Decision 9), so a failed marker write leaves everything as it was.
- **Spending, Savings and Accounts** in the sidebar are shown but aren't links yet (Phases 6 to 8). Upload and Settings setup are placeholders until 4B.
- **AC-4** (file text as plain text): 4A shows no file text, so there's nothing to test yet. The source test bans `innerHTML` and inline styles in every screen.
- **5 wrong tries on screen 14** lock the app and show Log in, since the design has no Locked line for that case.
- A bug found and fixed on the way: `dataFolder()` used to fall back to the real HOME when given nothing. It no longer has a default, and a test pins it.

### Font, done 2026-11-08 (owner said "Yes, download both"; details in D-024)

1. Download Google Sans Flex once from the official `google/fonts` repo, cut it to under 5 MiB keeping ₹ and weights 400 to 700, as `woff2`.
2. Save it as `public/fonts/google-sans-flex.woff2`, with `public/fonts/OFL.txt` beside it.
3. Add a `DECISIONS.md` entry with its SHA-256 and source.
4. Run `npm test` and `npm run guard`. Security checks the file at sign-off.

### Check results

`npm test` 425 passed, 0 failed. `npm run typecheck` passed. `npm audit` found 0 problems. `npm run guard` passed, and passed again on a throwaway copy of the new files. `npm run build` passed.

**App run:** started on a made-up HOME in the scratch folder, never the real data folder (which still doesn't exist). Checked in the built-in browser: create password, the placeholder upload screen, the shell, delete page, Locked after a restart, log out and Back, the period dialog. Light and dark, 1280, 375 and 320 wide with no sideways scroll. Requests went to 127.0.0.1 only.

**After the build, 2026-11-08.** Font added (D-024). `npm test` 425 passed, guard clean. QA's full run started as a fresh agent. The 5-hour use is 63%, close to the 72% stop line, so the owner was asked about the budget and about downloading a fuller common-password list. This session's memory is at 53%; the rest of the phase should continue in a fresh session after QA reports.

**Owner, 2026-11-08: "Yes to both".** Part 4A's budget went up by 20 points (stop line 92%). The fuller common-password list is in (D-025): 5,348 lines from SecLists, MIT licence beside it, guard clean. QA started before this swap, so the narrow re-test must cover AC-7 and condition 44 with the new list.

## Fixes after QA (Engineer, 2026-11-08)

Fresh Engineer agent. Nothing committed. No new packages. Checked in the built-in browser on made-up HOMEs in the scratch folder only.

| Finding | What changed | Test |
|---|---|---|
| Q4-1 Blocker | Design system small fix: the three header picker width rules now read `.top > .picker`, so they reach only the header's own picker, not the date pickers in "Choose a period" (which sits inside the header). Copied into `src/app/system.css`, previews synced, change log line added. No change to the look | `app-source.test.ts` "sizes only the header's own picker". Browser: at 1280 the dialog pickers are 102, 132 and 122px, side by side inside the 420px dialog; 375 and 320 no overlap and no sideways scroll |
| Q4-2 Minor | Create password: after a server refusal, the fields are switched back on (`flushSync`) before focus moves, so focus lands in the field. Same fix on screen 14's delete form, which had the same pattern | Browser: a too-common password leaves focus in Password. No DOM test runner in the repo, so no unit test |
| Q4-3 Minor | The start page passes the server's wait left to Log in and Locked, so a reload mid-wait shows the countdown with Log in switched off | `server.test.ts`: four wrong tries, reload, countdown text and a disabled button. Browser: "Try again in 24 seconds" after reload |
| Q4-4 Minor | New `rangeLine` and `periodDates` in `src/lib/period.ts`, from design.md's "Rules shared by screens 7 to 16" table. The placeholder Overview card shows the range line, and the page redraws after a period change, so a Custom choice shows its dates (for example "1 Apr to 30 Jun 2024"). Phase 5 can reuse both for the hero | New `tests/period.test.ts` (the table, leap day, year ends, single day, All). `server.test.ts` checks a custom range on the page |
| Q4-8 Minor | `scripts/wipe-data.ts`: new `askLine` treats end of input (Control-D) as "not DELETE", so the script ends with "Nothing was deleted." and no Node warning | `delete-wipe.test.ts` "wipe prompt at end of input". Run through `script` with Control-D on a scratch folder: no warning, nothing deleted |

**Left for others:**
- **Q4-5 (owner or Designer):** design.md says the narrow header picker is 132px; the design system makes it fill the row at 480px or less (as built). One document needs to change.
- **Q4-6 (Security at sign-off):** `npm run wipe` vs Decision 9's quoted script path. Unchanged.
- **Q4-7 (no change):** the Locked reason is one value for the app (`store.lastLock`). Not a data or security risk: it only picks which line shows on Locked, and the server still refuses any old session. Making it per window would need a per-browser value, which isn't trivial and isn't in the spec.
- **New, for the Designer:** at 320 wide, the dialog's date pickers have room for about two characters, so a picked "2024" shows as "202…" and "30" as "3…". No overlap or sideways scroll. Fixing it changes the look (for example, smaller padding or the year on its own row), so it goes through "Changing the system".

**Checks:** `npm test` 432 passed, 0 failed. `npm run typecheck` passed. `npm audit` 0. `npm run guard` passed. `npm run build` passed.

**For QA's narrow re-test:** Q4-1 at 1280, 375, 320; Q4-2 on screens 1 and 14; Q4-3 reload during a wait; Q4-4 Custom range line; Q4-8 Control-D; plus AC-7 and condition 44 with the new common-password list (from the earlier note).

## Budget stop and next steps, 2026-11-08

QA's full run found 1 Blocker and 7 Minors (`test-report.md`). The fix run fixed Q4-1 (the Blocker), Q4-2, Q4-3, Q4-4 and Q4-8, and all checks pass (432 tests). Nothing is committed.

Work stopped at 89% of the 5-hour limit, next to the 92% stop line. The window resets at 13:30 UTC on 2026-11-08. This session's memory is at 56%, so Part 4A finishes in a fresh session. It starts from this file, `brief.md`, `security.md` and `test-report.md`, and does:

1. **Narrow re-test** (fresh QA agent, Sonnet): Q4-1 to Q4-4 and Q4-8, plus AC-7 and condition 44 with the new SecLists list.
2. **Back after log out in plain Chrome** (condition 51, AC-9): either the session runs it in the owner's Chrome with made-up data, if the owner agrees, or the owner does it.
3. **Security sign-off** (fresh agent): conditions 40 to 53, the font file (D-024), the password list (D-025), and Q4-6 (`npm run wipe` against Decision 9).
4. **For the owner or Designer:** Q4-5 (narrow picker width: `design.md` against the design system) and the 320px date pickers cutting "2024" to "202…".
5. Merge checklist, end usage, owner sign-off.

**Owner, 2026-11-08: "Yes, pause".** Work is paused until the 5-hour window resets at 13:30 UTC. Part 4A then finishes in a fresh session, using the steps above.

## Finish session, 2026-11-09

- **Narrow re-test** (fresh QA agent, Sonnet): Q4-1 to Q4-4, Q4-8, AC-7 and condition 44 all pass. 432 tests pass. New Minors: Q4-9 (the 320px "202…" dates, same as the Designer note) and Q4-10 (once, a correct log in right after a wait gave a second wait; not repeatable).
- **Back check** (condition 51, AC-9): the owner ran it in Brave. Pass, with Q4-11 Minor (the first Back showed Locked without its field). Details in `test-report.md`.
- **Owner, 2026-11-09:** Q4-5 "Design system wins": `phase-3/design.md` now says the narrow picker fills the row. The 320px dates: "Fix in Phase 5", for the Designer when Phase 5 builds the period display.
- **Security sign-off** (fresh agent): signed off with conditions. No Blocker or Major; conditions 40 to 53 met; font (D-024) and password list (D-025) match. `npm run wipe` is acceptable (Q4-6). Q4-11 needs no change. Two Minors to fix before 4B signs off: S4-14 (a correct log in after a wait briefly shows a false 60-second wait) and S4-15 (wipe panel step 2 should say "in that same Terminal window", needs the owner's yes).
- **Merge checklist** shown to the owner. Open item: checks on the final commit, since nothing is committed and Phase 3 merges first.
- **Owner, 2026-11-09: "Yes, sign off both".** Part 4A is signed off, and the S4-15 wording for step 2 of the wipe panel is approved: "Then, in that same Terminal window, paste this and press Return. It lists what it will delete and asks you to type DELETE." S4-14 and S4-15 get fixed in the 4B session, before 4B signs off. Nothing committed: commit, push and merge wait for the owner to ask, Phase 3 first.

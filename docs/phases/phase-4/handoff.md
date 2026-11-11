# Phase 4 handoff

## Usage

| When | 5-hour | Weekly |
|---|---|---|
| Start (2026-11-08) | 22% | 76% |
| After the 4A build and font (2026-11-08) | 63% | 81% |
| After QA and fixes, budget stop (2026-11-08) | 89% | 84% |
| 4A finish session start (2026-11-09, 06:17 UTC) | 1% | 85% |
| 4A end, after Security sign-off (2026-11-09, 06:35 UTC) | 18% | 87% |
| 4B start (2026-11-10, 13:02 UTC) | 40%, resets 13:20 UTC | 2% |
| 4B finish session start (2026-11-11, 03:54 UTC) | 20%, resets 07:00 UTC | 26% |
| After the setup model build (2026-11-11, 04:12 UTC) | 45%, resets 07:00 UTC | 30% |
| After the full QA run, budget stop (2026-11-11, 05:17 UTC) | 65%, resets 07:00 UTC | 33% |
| 4B end, after fixes, re-test and Security sign-off (2026-11-11, 05:34 UTC) | 84%, resets 07:00 UTC | 35% |
| 4B end, after S4-16 and S4-17 fixed and re-checked (2026-11-11, 05:42 UTC) | 87%, resets 07:00 UTC | 36% |

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

## Part 4B (session started 2026-11-10)

Runs on branch `phase-4b`, cut from `main` at `81187b1` (4A merged as `6afceed`). Budget: half of one 5-hour limit. The 5-hour window reset at 13:20 UTC, just after the start reading, so the stop-and-ask line is 50%.

**Preview, 2026-11-10.** The Designer made `previews/settings-setup.html` for screen 13, with every state in the preview menu: Setup (normal, after a change, saving, saved, couldn't save, changed in another window, no income categories, leaving with changes), Your data (undo available, undo dialog, after undo, undo couldn't finish, nothing to undo) and AI. No sideways scroll at 1280, 375 and 320. Checked in light and dark. No design system change: it uses `.seg`, `.card`, `.pick-rows`, `.picker`, `.list`, `.note` and `.dialog` as they are. Waiting for the owner's yes, together with these points that aren't in `design.md`:
- Card titles "Accounts", "Income categories" and "Paid back and history", with one helper line each on the first two: "The group decides where each account shows and what counts towards net worth." and "Earned is money you worked for. Returns come from savings and investments. A loan isn't income."
- Your data rows: "Last upload" with the date and row count, and under "Undo last update" the line "Goes back to your data from before 2 Nov 2026." (the date of the update).
- The AI choice shows one line until Phase 10: "AI settings arrive in a later phase."
- "Save changes" is always there, switched off until something changes. "Discard" appears after a change.
- No skeleton rows: the server sends the page with its answers already in it, so there's nothing to wait for. The design system has no skeleton yet. Phase 5 adds one for the dashboards.
- Closing the tab or reloading with unsaved changes shows no dialog, because the only one a browser allows there is its own. The "Leave without saving?" dialog covers every link and button inside the app.

**S4-15 wording, approved 2026-11-09.** `phase-3/design.md` (screen 2, Forgotten password) and `previews/login-locked-delete.html` now read "Then, in that same Terminal window, paste this and press Return." The app's panel changes in the build.

## Build, Part 4B (Engineer, 2026-11-10)

Built in an Engineer agent on `phase-4b`. Nothing is committed. No new npm packages.

### Held, by the owner's scope change (2026-11-10)

The owner is changing the setup answers (likely income kinds per subcategory, expense categories in owner-named groups, maybe no reimbursement or reliable-from questions). Not approved yet, so these wait:
- **Screen 5 (setup UI)** and its "Back to setup" button on screen 6. After the first upload the app shows a placeholder at the setup step: "This step arrives once the new setup questions are agreed." The step logic is unchanged (`firstTimeStep`): upload, then setup until answers are saved, then summary, then shell. Screen 5 drops into the `case "setup"` branch of `src/app/page.tsx`.
- **The setup-save route** (screens 5 and 13) and its checks. A test pins that `src/app/api/setup` doesn't exist yet.
- **Any change to the setup data model.** The setup tables are unchanged. The one addition is `ensureSetupSchema()` in `src/lib/setup/store.ts`, which only makes the existing tables.
- **Screen 13 Settings "Setup" page** (preview changes asked for).
- Note for the new model: screen 8's "New income categories" section and the replace step use today's model (one Earned, Returns or Loan choice per income category; new accounts get a group or stay Ungrouped). Both will need to follow the new setup answers.

### What was built

- **Upload worker** (`src/lib/import/read-in-worker.ts`, `parse-worker.ts`): the bytes are handed to a `worker_threads` worker (transfer, not copy), with old space 768 MB, young 64 MB, stack 4 MB, `env: {}`, no `argv`, ended after 60 seconds. The worker only parses. Memory, time and crash failures become `INTERNAL_ERROR`. One read at a time for the whole process (a flag on `globalThis`); a second gets `BUSY`. The worker file is outside `app/` and `public/`, loaded from `process.cwd()`, so the app must run from the project folder (as `npm run start` does).
- **Raw-body reading** (`readFileBody` in `route-helpers.ts`): `application/octet-stream` only, declared length checked before reading, bytes counted again while reading. The gate gives the two upload routes 20 MiB; every other route keeps 16 KiB.
- **Changes to the data** (`src/lib/data/state.ts`, `update.ts`): a data version bumped by every save, last upload date and rows, the saved note (imported, updated, undone), and the undo copy as `undo_*` tables in the same encrypted database, written in the same `BEGIN IMMEDIATE` transaction as the replace. First save, summary confirm, Start over (refused once confirmed), the update review (new, changed, removed, net worth, new accounts and income categories, removed names, partial-file warning worked out on the server), replace (tick, version, answers and amounts checked on the server; removed names leave the live setup tables) and undo. Every change runs through the one-at-a-time chain (`changeFor` in `session.ts`), which also refuses if the session ended while waiting.
- **Pending update**: parsed rows only, on the session, dropped on cancel, lock, log out, a new upload, a stale confirm and after confirm. A lock that drops one sets a flag, so screen 8 says "The app locked before you confirmed…" once.
- **Screens**: 4 First upload (drop area, stages, refusals with row numbers), 6 Summary (every line in the design, Start over dialog), 8 Update upload (stage 1, review with Show 50 more, warning and tick, new accounts and income categories, removed names, Replace and Cancel, same-file note), the reminder note on Overview with Undo and Dismiss, and Settings "Your data" (last upload, Undo last update with the screen 8 dialog or "Nothing to undo yet.", Delete my data). New UI files: `upload-drop.tsx`, `summary-view.tsx`, `summary-actions.tsx`, `update-review.tsx`, `data-note.tsx`, `undo-row.tsx`, `confirm-dialog.tsx`, `role-choice.tsx`, `format.ts`. `TaskFrame` takes `wide`, `Shell` takes a `title`.
- **S4-14**: the try is still counted before hashing, but `waitUntil` is set only in `finish(false)`; a try while a check runs gets the fixed 2-second wait (`BUSY_WAIT_SECONDS`); the log in form has a `sending` ref. Tests in `auth-session.test.ts`.
- **S4-15**: `forgot-panel.tsx` step 2 now reads exactly "Then, in that same Terminal window, paste this and press Return. It lists what it will delete and asks you to type DELETE." No test pinned the old text.

**Full route list** (for condition 58). Open without a session: `GET /`, `POST /api/password/create`, `POST /api/login`, `POST /api/delete/finish`, the font, `/_next/static/`. Session needed: `GET /upload`, `GET /settings`, `GET /settings/delete`, `GET /api/status` (not counted as use), `POST /api/logout`, `/api/delete`, `/api/period`, `/api/upload`, `/api/update/upload`, `/api/update/rows`, `/api/update/confirm`, `/api/update/cancel`, `/api/undo`, `/api/summary/confirm`, `/api/start-over`, `/api/note/dismiss`. All routes go through the gate's default-deny check, and each route calls `requireSession` or `withSessionForm` itself (a test checks this).

### Conditions 54 to 57

| # | Met | Tests (`upload-update.test.ts` unless named) |
|---|---|---|
| 54 | Yes | "refuses an over-size file at the gate, before a byte is read"; "refuses an over-size file in the route without reading the body"; "turns running out of memory into fixed text"; "turns a read that takes too long into fixed text"; "refuses a second upload while one is being read"; "writes no new file to the temp folder or the data folder during an import"; "hands the bytes over to the worker, so none stay behind"; "starts the worker with no environment and the set limits"; "never writes a file from the import or upload code". `server.test.ts` sends a 20 MiB + 1 upload (413) |
| 55 | Yes | "keeps the undo copy encrypted: the raw database and side files never hold the marker name" (checked open and after lock, UTF-8 and UTF-16); "never copies the database with serialize(, VACUUM INTO, ATTACH or .backup(" |
| 56 | Yes | "refuses a replace without the tick when a warning applied"; "works out 'most accounts missing' itself, above half only (ruling 1)"; "refuses Start over once the summary is confirmed (S3-14), and allows it before"; "refuses any save whose data version is stale" (summary, Start over, replace, undo, and a second window's review). `server.test.ts` repeats tick, stale and Start over over HTTP. The setup-save part waits with screen 5 |
| 57 | Yes | Condition 36: "removes a removed account's name from the live tables, keeps it only in the undo copy, and Undo brings it back". 23: "runs the amounts limit on replace and on the first import (AC-24)". 24 and 25: "checks the session in every route but the three open ones, inside one error boundary", plus `gate.test.ts` finding every route. 26: "takes today from the server, never from a request". 27: `server.test.ts` "runs the whole 4A and 4B flow…" uploads names with HTML, a 4,000-character unbroken string and direction-changing characters, and checks they show as escaped text, never in the tab title or the app's output |

Also: AC-18 "shows ALREADY_IMPORTED only on the first-upload route", "says the same file matches on update", "gives row refusals as row numbers only"; AC-11 "stays on setup after the first upload, and on the summary until it's confirmed".

### Not done, or different

- **Held items** above.
- **No browser check this session.** Screens 4, 6 and 8, the note and Settings were checked through the production build's HTML in `server.test.ts`, not by eye. QA should check AC-1 (light and dark, 1280, 375 and 320, keyboard order) in plain Chrome.
- **Changed rows**: the export has no row IDs, so rows equal in every column match first; of the rest, an old and new row with the same time, account and type count as one changed row.
- **Progress lines** on screen 4 have their width set from script after load (D-010), as the design system says.
- **Undo date** shown is the day the update was confirmed (server date).
- **Summary** lists "Ungrouped" as a group when an account has no saved group.
- **Classes**: only existing design-system classes are used. No design-system change.
- The 4A server test no longer uses the placeholder upload screen: it now uploads real made-up files. Setup answers there are still written by `advanceDatabase`, because screen 5 is held.

### Check results

`npm test` 465 passed, 0 failed (includes the production build and the full flow on a made-up HOME). `npm run typecheck` passed. `npm audit` found 0 problems. `npm run guard`: 248 files checked, nothing blocked.

## Previews for the setup change (Designer, 2026-11-10)

Follows the brief's "Requirement change, setup answers (approved by the owner, 2026-11-10)". Nothing in `src/` was touched. Nothing is committed.

### Files changed

- `docs/phases/phase-4/previews/settings-setup.html`: screen 13 redrawn. Setup tab is now Accounts (by group), Income (per subcategory) and Expenses (owner-named groups), with a save bar. "Paid back and history" is gone. Your data and AI tabs, the shell, the leave dialog and the states menu are kept. New menu states: search with matches, search with no match, income search, adding a group, duplicate group name, name too long, renaming a group, group limit reached, removing a group.
- `docs/phases/phase-3/previews/first-time.html`: screen 5 is now three parts, Accounts, Income and Expenses, with the same controls. Every account still needs a group ("Choose a group." and "52 of 60 grouped" kept). Expenses are optional. The reimbursement and reliable-from part is gone. New menu items jump to each part, the account errors, expenses with groups, and no income categories. The rest of the flow (password, upload, summary, overview) still works.
- `docs/phases/phase-3/previews/update-undo.html`: screen 8 review now has "New income subcategories" (three-way choice each) and "New expense categories" (tagged Not grouped).
- `docs/phases/phase-3/design.md`: screens 5 and 13 rewritten, screen 8's new-names part updated, with states, wording, widths, keyboard and motion. "Flow: first time" had no reimbursement or reliable-from line, so it's unchanged.
- Made-up volume in both setup previews: 60 accounts, 31 income categories (most with subcategories, one with mixed kinds), 35 expense categories with subcategories.

### Design system addition (waiting for the owner)

Added to `system.css`, `README.md` (Components, Motion, Change log) and `gallery.html` ("Long lists"), then synced to every preview. `src/app/system.css` was left alone: the Engineer copies it.
- `.folds` / `.fold`: groups that open and close, with a count and chevron, one level only.
- `.search`: search field with icon, Clear button, match count and no-match line.
- `.inline-edit` and `.add-row`: naming a group in place, and the Add button with its hint.
- `.savebar`: the Save changes bar, sticky only while it has something to say.
- Icons `search`, `x`, `plus`.
- Base rule `[hidden] { display: none !important; }`. Before it, a `.btn` with `hidden` still showed (the old screen 13 preview's Discard was always visible because of this).

### New wording for the owner to approve

Screen 5: "Needs a group" · "Find an account" · "Find a category" · "Moved to Cards" · "4 Earned · 1 Returns" (the count pattern) · "Set all to" · "Group your expenses" · "Make groups such as Needs and Wants, and put each category in one. You can do this later in Settings." · "Add a group" · "Up to 12 groups, such as Needs and Wants." · "4 of 12 groups."

Screens 5 and 13: "Nothing matches “yacht”." · "Clear search" · "1 match" / "15 matches" · "Nothing in this group yet." · "New group name" · "Group name" · "Add group" · "Rename" · "Up to 40 characters." · "Give the group a name." · "Use 40 characters or fewer." · "You already have a group called “Wants”." · "“Not grouped” is kept for categories without a group." · "You have 12 groups, the most you can have. Remove one to add another." · "Options for Wants" (screen reader label) · menu "Rename", "Remove" · dialog "Remove “Wants”?" / "Its 9 categories go back to Not grouped. Nothing changes until you save." (screen 5 leaves off the last sentence) / "Keep group" / "Remove group"

Screen 13: "Expenses" · "Make your own groups, such as Needs and Wants, and put each category in one. Subcategories go with their category." · "No unsaved changes." · "You have unsaved changes." · "Try again" on the save button after a failed save. The saved and failed lines are the existing ones, moved into the save bar.

Screen 8: "New income subcategories" · "In Freelance" · "New expense categories" · "These show as Not grouped. You can put them in a group in Settings."

### Checks

Each preview opened in the built-in browser: no console errors; no sideways scroll at 1280, 375 and 320; light and dark; keyboard through search, group rows (Enter and Space), pickers (arrows, Enter, Esc), the Options menu, the name field (Enter, Esc) and the remove dialog (focus starts on Keep group). Every new menu state was opened at 375 with no sideways scroll.

### Waiting for the owner

- Yes or changes on the two redrawn screens (13 and 5), the screen 8 part, the new wording above, and the design system addition.
- Screens 10 and 11 in `design.md`: screen 10's trends line was already updated by someone else; screen 11 is now fixed under the second change below.

### Second change, income groups (Designer, 2026-11-10)

Follows the brief's "Second change, income groups (approved by the owner, 2026-11-10)". Income now works exactly like Expenses, and both are drawn by one shared list builder in the previews, so they can't drift apart.

**Files changed**
- `docs/phases/phase-4/previews/settings-setup.html` (screen 13): the Income card has owner-named groups (made-up: Work, From savings, Family and gifts), "Not grouped" first, Options with Rename and Remove, and Add a group. Earned, Returns, Loan and "Set all to" are gone. New menu states: adding an income group, removing an income group.
- `docs/phases/phase-3/previews/first-time.html` (screen 5): Part 2 is "Group your income", optional, with no suggestions. New menu item: income with groups.
- `docs/phases/phase-3/previews/update-undo.html` (screen 8): "New income categories" are tagged Not grouped, like new expense categories. No choice to make.
- `docs/phases/phase-3/design.md`: screens 5, 8 and 13 rewritten for income groups. Shared rules: a "What Earned means" paragraph (all income rows except balance corrections, with the accepted savings-rate gap). Screen 11: the Investment returns and Loans lines and their help lines are gone, and Earned gets a help line. Screen 12: Returns are worked out from balances, never from income groups. Screen 9 keeps "Earned".
- Design system: `.fold__tools` removed (its only use was "Set all to"), from `system.css` and `README.md`. The gallery's sample fold now reads "Work · 10 categories". Synced. The rest of the earlier addition is unchanged and still waiting for the owner.

**New wording for the owner**
- "Group your income" (screen 5 part 2 title)
- "Make groups such as Work and Savings, and put each category in one. You can do this later in Settings." (screen 5 part 2 lede)
- "Up to 12 groups, such as Work and Savings." (income Add hint)
- "Make your own groups, such as Work and Savings, and put each category in one. Subcategories go with their category." (screen 13 Income line)
- "New income categories" with "These show as Not grouped. You can put them in a group in Settings." (screen 8)
- Screen 11 Earned help line: "All your income, whatever group it's in."
- Withdrawn from the first round: "4 Earned · 1 Returns", "Set all to", "New income subcategories", "In Freelance".

**Design choice to confirm:** income and expense groups are separate lists, each with its own 12-group limit, and a name only has to be unique within its own list.

**Checks:** all three previews opened in the built-in browser. No console errors. No sideways scroll at 1280, 375 and 320, in light and dark, with every group open and every menu state opened. Keyboard: group rows, Options menu (Enter opens, Enter on Rename, Esc cancels and focus goes back to the group row), name field, and the remove dialog. Flows: add an income group, the duplicate check, move a category, it settles, save. On screen 5: add a group, then continue to the summary.

## Build, setup model (Engineer, 2026-11-11)

Built on `phase-4b` in an Engineer agent, to the brief's "Requirement change, setup answers" and "Second change, income groups" and the approved previews of screens 5, 8 and 13. Nothing is committed. No new npm packages.

### What was built

- **Design system:** `src/app/system.css` is now the approved `docs/design-system/system.css`. The `search`, `x` and `plus` icons are in `icons.tsx`.
- **Setup data model** (`src/lib/setup/setup.ts`, `store.ts`, new `group-names.ts`): account groups, plus owner-named income groups and expense groups (separate lists, up to 12 each, names up to 40 characters people see, unique ignoring case and spaces at the ends, "Not grouped" kept). A category's place is saved at category level; subcategories follow it; a category with no saved place reads Not grouped. New tables `setup_groups`, `setup_categories` and `setup_saved` (the "setup answered" marker), all in the encrypted database. The old `setup_income_categories` and `setup_choices` tables (and their undo copies) are dropped: no released build ever saved them. Reimbursement, trends start, Returns and Loan answers are gone, and so are the income keyword suggestions.
- **Phase 2 metrics:** every Income row is Earned. Every balance correction is in Other corrections (Recovered merged in). The breakdown is now Earned, Spent, Other corrections, Unmatched transfers, and still adds up to the change in net worth. The made-up sample and its expected totals follow.
- **Save checks** (`saveSetupAnswers` in `src/lib/data/update.ts`): one at a time through `changeFor`, data version checked before and inside the write, then every check again on the server: shape, known account groups, every account grouped the first time (Ungrouped allowed in Settings), group count, empty, too long, duplicate, "Not grouped", line breaks or control characters, category places in range. Refusals are fixed codes. The page sends positions, not names, so file names never travel back; the version check keeps the lists lined up.
- **Screen 5** (`setup-first.tsx`, `setup-lists.tsx`): Accounts (required, suggestions with the Suggested tag, Needs a group, "52 of 60 grouped"), Income and Expenses (optional), each part skipped when it has no categories. Search, folds, rows that don't jump ("Moved to …"), add, rename (Options menu) and remove (dialog when it has categories), the limit line, "Choose a group." errors that open the group, clear the search and focus the first empty picker. Slots into `case "setup"` in `src/app/page.tsx`.
- **Screen 6:** "Back to setup" opens screen 5 on its last part with the saved answers (`SummaryFlow`). Saving again returns to the summary.
- **Screen 13:** Settings is now Setup, Your data and AI. The Setup tab has the three cards, the save bar (no changes, unsaved changes, Saving…, Saved, couldn't save with Try again), Discard, the stale note with Reload, and "Leave without saving?" for every link and the Log out buttons (`data-leave`) while there are unsaved changes.
- **Screen 8:** new income and new expense categories show with a Not grouped tag and their subcategories, nothing to choose. The Earned, Returns or Loan choice and `role-choice.tsx` are gone. A removed category's place leaves the live table and stays in the undo copy (condition 36). New accounts still go in Ungrouped until chosen, as the approved preview shows.
- **`docs/PROJECT_BRIEF.md` section 3:** Earned is "All income rows, except balance corrections", the breakdown line and the setup step match the brief.

### New route and full route list (condition 58)

New: `POST /api/setup` (screens 5 and 13). Session needed, through `withSessionForm` (live session, 16 KiB form limit counted while reading, one error boundary). The gate's default-deny and 16 KiB limit cover it like every other small route.

Open without a session: `GET /`, `POST /api/password/create`, `POST /api/login`, `POST /api/delete/finish`, the font, `/_next/static/`. Session needed: `GET /upload`, `GET /settings`, `GET /settings/delete`, `GET /api/status` (not counted as use), `POST /api/logout`, `/api/delete`, `/api/period`, `/api/upload`, `/api/update/upload`, `/api/update/rows`, `/api/update/confirm`, `/api/update/cancel`, `/api/undo`, `/api/summary/confirm`, `/api/start-over`, `/api/note/dismiss`, `/api/setup`. The route list test in `start-screen.test.ts` now includes `setup/route.ts`, and `upload-update.test.ts` checks it calls the session check inside one error boundary.

### Tests per criterion

| AC | Tests |
|---|---|
| AC-19 | `setup.test.ts` "answers save, read back, and move the first-time step on", "income and expense groups are optional the first time; every account needs a group"; `server.test.ts` full flow now goes through screen 5 and `/api/setup` over HTTP (Part 1 of 3, suggestions, NEEDS_GROUP, then the summary) |
| AC-23 | `setup.test.ts` "in Settings, Ungrouped is an allowed answer"; `setup-groups.test.ts` "allows Ungrouped, refuses a stale page, and new names from an update read Not grouped"; `server.test.ts` checks the Settings Setup tab |
| AC-27 | `setup-groups.test.ts` "lists 60 accounts and 40 income and 40 expense categories with their subcategories, and saves them all", "fits the largest likely save in the 16 KiB form limit" |
| AC-28 | `setup-groups.test.ts` "add, rename and remove work…", "the server refuses over the limit, too long, empty, the same name twice, Not grouped and line breaks, in each list", "the two lists are separate", "names are stored trimmed…", "the page's checks and the server's are the same function"; `server.test.ts` refuses each over HTTP and shows an HTML-looking group name as escaped text in Settings |
| AC-29 | `metrics.test.ts` "income in several groups, and in none, all counts as Earned", "income groups change no number, and the breakdown has no Returns, Loans or Recovered line", every-correction test; `setup-groups.test.ts` "gives the same numbers whatever the groups, and the breakdown adds up" |
| Condition 56 (setup save) | `setup.test.ts` "refuses a save whose data version is stale"; `server.test.ts` stale version over HTTP (409), 17 KiB body (413), no session (401) |

### Not done, or different

- **No browser check.** Getting past screen 4 needs a made-up export uploaded in the pane, and the spreadsheet hook (rightly) blocks staging a made-up workbook outside the repo, so I didn't work around it. Screens 5, 8 and 13 were checked through the production build's HTML in `server.test.ts` only. QA should check AC-1 and AC-27 by eye (1280, 375, 320, light and dark, keyboard, no sideways scroll).
- **New accounts on screen 8:** the brief's first change says new accounts "still need a group before Replace", but the approved preview and `design.md` screen 8 say "These go in Ungrouped until you choose a group" and the owner can choose later. I followed the approved preview. **Question for the owner/PM** to settle.
- **No loading skeleton** on screens 5 and 13: the server sends the page with its answers in it (as the screen 13 preview notes), so only "Saving…" shows.
- **"Rows settle"** in Settings after Save and Discard; on screen 5 when a part is shown again, a group opens or closes, or the search changes.
- **A group name with a line break or control character** can't be typed (the field drops those characters); the server refuses it with a fixed code. There's no wording for it, because the page can't reach it.
- **Blank subcategories** aren't listed under a category.
- `docs/PROJECT_BRIEF.md` section 2 (row 1 of the format table) still says market moves are "Investment returns". Section 3 is updated as asked; section 2 is for the PM.
- `src/lib/sample/traps.ts` keeps its case names "Reimbursement correction up/down" (they name rows in the made-up sample, which now count as Other corrections).

### Check results

`npm test` 475 passed, 0 failed (includes the production build and the full flow on a made-up HOME). `npm run typecheck` passed. `npm audit` found 0 vulnerabilities. `npm run guard`: 248 files checked, nothing blocked.

## Budget stop, 2026-11-10

**Owner approvals today:** the setup answers change ("Yes, approve"), the income groups change ("Yes, approve"), and the redrawn previews of screens 5, 8 and 13 with the design system addition and new wording ("Yes, approve all"). All recorded in `brief.md` under "Owner approval".

**Usage:** the first 5-hour window ran from 40% to its limit during the first build. In the window that reset at 13:20 UTC, usage went from 3% to 63% by 14:20 UTC. Weekly is 19%. That is past this part's budget of half a 5-hour limit, so work stopped to ask the owner. This session's memory is at 52%.

**Done so far:** everything in 4B except the new setup model (see "Build, Part 4B"): upload, refusals, screens 4 and 6, screen 8, replace, undo, the reminder, Settings Your data, S4-14 and S4-15. Checks passed then: 465 tests, typecheck, audit, guard. Nothing is committed, on branch `phase-4b`.

**Next steps, in a fresh session:**
1. **Build the new setup model (Engineer, fresh agent).**
   - The specs: `brief.md` "Requirement change, setup answers" and "Second change, income groups", and `phase-3/design.md` screens 5, 8 and 13.
   - Setup answers become account groups plus owner-named income and expense groups (category level). Reimbursement, trends start, returns and loans go. Phase 2 metrics count all income as Earned.
   - Copy the approved `docs/design-system/system.css` into `src/app/system.css`.
   - Build screen 5, its save route, screen 6's Back to setup, the screen 13 Setup tab and screen 8's new names part.
   - Tests for AC-19, AC-23, AC-27, AC-28 and AC-29.
   - Update `docs/PROJECT_BRIEF.md` section 3 as the brief says.
2. **Full QA run** (fresh agent): AC-1 to AC-6 and AC-17 to AC-29, including a browser check.
3. **Fixes, then the narrow re-test** (Sonnet).
4. **Security sign-off** (fresh agent): conditions 54 to 58, S4-14 and S4-15.
5. **Merge checklist, end usage, owner sign-off.**

## Fixes after QA, Part 4B (Engineer, 2026-11-11)

QA Minors Q4B-1 to Q4B-5 fixed. Q4B-6 (account sort order) left as a note, as asked.

- **Q4B-1, long names.** Design-system small fix: `.pick-row__name`, `.pick-row__sub` and `.fold__name` get `overflow-wrap: anywhere` in `docs/design-system/system.css`, copied to `src/app/system.css`, sync script run, README change log row added. Checked in the browser on the Settings setup preview with a 307-character name: it wraps inside its row and stops before the picker at 1280, and stays inside the card with no sideways scroll at 375 and 320. Test: `setup-groups.test.ts` "QA Q4B-2 and Q4B-1" (the rule is in both copies). Not checked in the running app.
- **Q4B-2, Esc on Remove group.** "Keep group" or Esc now returns focus to that group's Options button (it has an id now), as on screen 13 and in design.md. Test: same test, source check. Not checked by keyboard in the running app.
- **Q4B-3, search count.** Rule: the count is every row shown plus every group shown because its own name matched. So "g1" with three empty groups reads "3 matches", and it is never "0 matches" while something shows. `matchCount` in `src/app/ui/format.ts`. Test: "QA Q4B-3".
- **Q4B-4, Undo from Settings.** Settings shows the existing note "Your data is back to how it was." when the saved note is `undone`; Dismiss clears it on both pages. No new wording. Test: `server.test.ts` checks Settings after undo and after dismiss.
- **Q4B-5, group names.** In `group-names.ts` (server and page share it): names are NFC-normalised before the length and repeat checks and saved in NFC; the repeat check also ignores invisible characters; a name made only of spaces or invisible ("default ignorable") characters is `EMPTY` ("Give the group a name."); direction-changing characters (U+061C, U+200E/F, U+202A to U+202E, U+2066 to U+2069) are refused as `NOT_PLAIN`, the existing code and wording. Refusing is safer than stripping because the saved name never differs silently from what was sent. The page strips the same characters as you type, as it already did for line breaks, so the owner never meets that error. An older test that saved a name with U+202E now saves it without; the new test checks the refusal. Test: "QA Q4B-5".

Checks: `npm test` 478 of 478 pass, `npm run typecheck` clean, `npm audit` 0 vulnerabilities, `npm run guard` nothing blocked.

## Budget stop, 2026-11-11

**Done this session:** the new setup model (Engineer, see "Build, setup model"), and the full QA run, recorded in `test-report.md` under "QA, Part 4B (2026-11-11)": 19 Pass, 0 Fail, 0 Not verified, no Blocker or Major, six Minors (Q4B-1 to Q4B-6). Owner ruling 2026-11-11: new accounts on an update go in Ungrouped (in `brief.md`).

**Usage:** 5-hour went from 20% to 65% (45 points), close to this part's budget of half a limit, so work stopped to ask the owner.

**Next steps:**
1. Fixes (Engineer): Q4B-1 to Q4B-5. Q4B-6 (sort order) is a note only.
2. Narrow re-test (QA, Sonnet).
3. Security sign-off: conditions 54 to 58 with the full route list, and re-check S4-14 and S4-15.
4. Merge checklist, end usage, owner sign-off.

## Finish, Part 4B (2026-11-11)

The owner said "Carry on now" at the budget stop. Fixes Q4B-1 to Q4B-5 done; narrow re-test (Sonnet) passed all five with no new findings; Security signed off Part 4B with no Blocker or Major (conditions 54 to 58 met, full route list checked, S4-14 and S4-15 fixed). Checks: 478 tests, typecheck, audit 0, guard clean.

**Merge checklist (shown to the owner)**
- [x] Every 4B criterion (AC-1 to AC-6, AC-17 to AC-29) has a result: 19 Pass in `test-report.md`.
- [x] No Blocker or Major open. Q4B-6 (sort order) is a note only.
- [x] Conditions 54 to 58 met; S4-14 and S4-15 fixed and re-tested.
- [x] `npm test`, `npm run typecheck`, `npm audit`, `npm run guard` pass.
- [x] Owner OK on the design system fix: long names wrap inside their row (`overflow-wrap: anywhere`).
- [x] S4-16 and S4-17: the owner asked for them to be fixed first ("Fix S4-16/17 first"). Fixed (479 tests) and re-checked by Security: both Fixed. New Info S4-18 (a few invisible tag characters can follow an emoji or non-Latin letter) doesn't block merge.
- [x] Owner sign-off in chat, 2026-11-11: "Yes, sign off" (covers Part 4B and the name-wrap fix). Commit, push and merge only when the owner asks.

## Fixes after Security, Part 4B (Engineer, 2026-11-11)

Both Minors from the Part 4B sign-off are fixed in `src/lib/setup/group-names.ts`, which the server and the page share. No new wording or codes.

- **S4-16:** a name that isn't well-formed text (a lone surrogate, as only a hand-made request can send) is refused with `NAME_NOT_PLAIN` (`isWellFormed()`).
- **S4-17, length:** each visible character may carry at most 6 accent marks and 32 code units, or the name gets `NAME_TOO_LONG` ("Use 40 characters or fewer."). The largest emoji (family with skin tones) and Indic conjuncts fit; 40 of them still save.
- **S4-17, invisible characters:** zero-width, word-joiner, soft-hyphen, byte-order-mark, filler and other format (Cf) or default-ignorable characters inside a name get `NAME_NOT_PLAIN`. Joiners, variation selectors and tag characters are allowed only inside an emoji or keycap, or after a letter from a script that uses them (for example Bengali or Persian); after a Latin, Greek or Cyrillic letter they are refused.
- **Page:** `setup-lists.tsx` now uses `plainOnly()`, which takes out control, direction, invisible characters and lone surrogates as the owner types (emoji stay whole). The live check runs the same `groupNameProblem`.
- **Tests:** new test "Security S4-16 and S4-17" in `tests/setup-groups.test.ts`. One existing check changed on purpose: `"Fo​od"` next to `"Food"` was `NAME_TAKEN` and is now `NAME_NOT_PLAIN`, because a zero-width space is refused before the repeat check.
- **Checks:** `npm test` 479 of 479, `npm run typecheck` clean, `npm audit` 0 vulnerabilities, `npm run guard` 248 files, nothing blocked.
- **For QA (narrow re-test):** in Settings, add a group named with an emoji family, a flag and a Bengali word (should save); paste `Fo​od` (with a zero-width space) and check the space is taken out of the field.

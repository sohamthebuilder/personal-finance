# Phase 4 security review (before build)

Reviewer: independent Security, fresh agent, 2026-11-08. Covers Parts 4A and 4B. Nothing is built yet.

## Decision

**Ready to build, with conditions.** There are no Blockers, because nothing exists yet that could leak. There are 7 Majors: each is a choice the build could easily get wrong in a way that leaks the key or skips the lock. The "Decisions for the build" below settles each one, so the Engineer doesn't have to guess. Conditions 40 to 58 replace nothing earlier. Conditions 29 to 37 (Phase 3), 12 and 13 (Phases 0 and 1) and 23 to 28 (Phase 2) still apply in full.

## How I checked

- Read the brief, Phase 3 `security.md` (conditions 29 to 39, Known limits, rulings) and the design for screens 1 to 8, 13, 14, the start-up table and the shared rules.
- Read `server.ts`, `src/proxy.ts`, `request-policy.ts`, `encrypted-db.ts`, `import-export.ts`, the setup store, the import limits and the guard's size and content checks.
- Ran nothing and downloaded nothing. No real data was opened.

## Findings

### Blockers

None.

### Majors

**S4-1 Server actions slip past a gate that checks paths.** In Next.js, a server action (`"use server"`) is called with a POST to *any* page's address plus an action ID. So an action meant for the shell can be called through the public log-in page's address, and a gate that lets the log-in path through without a session lets it through too. Fix: no server actions in this app (Decision 1).

**S4-2 There's still no request size limit.** `server.ts` reads no body and caps nothing. Phase 0 condition 13 is open, and create password is the first route that takes a body, with no session needed. Fix: Decision 3, before any POST route exists.

**S4-3 The session could exist twice.** `server.ts` is run by Node directly, and Next.js bundles `proxy.ts` and each route separately, so a plain module-level variable becomes several separate copies. The gate could then think the app is locked while a route still holds the open database, or the reverse. Fix: one store per process (Decision 2).

**S4-4 Auto-lock could fail to fire.** If idle time is checked only when a request arrives, the key stays in memory all night while the Mac sits unattended. If it uses `process.hrtime` or `performance.now`, sleep doesn't count, because on macOS those clocks pause during sleep. Fix: a server timer plus the wall clock (Decision 4).

**S4-5 The Unicode choice is permanent, and broken text can collide.** The form must be chosen once, because changing it later makes the database unreadable. Separately, a password holding a broken character (a lone surrogate) turns into the same bytes as a different password when hashed. Fix: NFKC, refuse broken text, applied in one place (Decision 5).

**S4-6 Part 4A has no upload, which invites a shortcut.** After create password, the real next step is screen 4, which arrives in 4B. The shell only shows once there's data. A builder testing the shell may add a seed route, a flag or a jump to Overview, and any of those left in the app breaks ruling 3 (S3-13). Fix: condition 52.

**S4-7 The wipe has no way to tell whether the app is running.** Condition 29 says it must refuse while the app runs, but there's nothing yet to check. If it wiped a running app, the app would carry on writing to a deleted file. Fix: Decision 9.

### Minors

**S4-8 SameSite=Strict doesn't separate ports.** A page on another local port (`127.0.0.1:8080`) counts as the same site, and the browser sends it our cookie when visited. HttpOnly stops it being read by page scripts, and the existing exact `Origin` and `Sec-Fetch-Site: same-origin` checks stop the other page using it. Keep both checks. See Known limits.

**S4-9 New files get default permissions.** SQLite creates its side files with the normal permission mask, so another user on the Mac can read them. They're encrypted, but the app should still set `umask(0o077)` at start and create the data folder as `0700`.

**S4-10 Back button and Chrome's page cache.** `no-store` is set, but newer Chrome can still restore some `no-store` pages from its back/forward cache. Fix: Decision 4's last point, then the condition 34 test in plain Chrome.

**S4-11 Password check queue.** If password checks wait in a queue, many tries pile up passwords and 64 MiB hashing jobs in memory. Refuse a check while another runs, don't queue it (Decision 6).

**S4-12 Password text can't be wiped.** JavaScript strings can't be overwritten, so a typed password stays in the server's memory until it's cleaned up. Same class as Phase 1 condition 13. Added to Known limits.

**S4-13 Wording mismatch for the PM, not a risk.** AC-18 says a re-upload of the same file shows `ALREADY_IMPORTED`. Screen 8 says the same file shows "This file matches your current data", and the design says `ALREADY_IMPORTED` goes when replacing arrives. My reading: `ALREADY_IMPORTED` stays only on the first-upload route (a second first upload, for example from another window), and screen 8 uses its own note. The PM should confirm.

## Decisions for the build

1. **No server actions.** Every change goes through a route handler under `/api/`. The front gate refuses any request with a `Next-Action` header (403). A test fails if `"use server"` appears in `src/`.

2. **One session store per process.** It's created once on `globalThis` under `Symbol.for("personal-finance.session")`, and every module (gate, `proxy.ts`, routes) reads that one object. It holds at most one unlocked state: the open database handle, the SHA-256 of the session token, the last-use time, the period and the pending upload (4B). The key itself isn't kept: `openWithKey` already zeroes it, and the open handle is what "unlocked" means. Lock closes the handle and drops everything.
   - **Token:** 32 random bytes from `crypto.randomBytes`, base64url. A new one at every log in and create password, never reused or taken from the request. A token the server didn't issue matches nothing, so a cookie planted by another local app can't fix a session.
   - **Cookie:** name `pf_session`, `HttpOnly`, `SameSite=Strict`, `Path=/`, no `Domain`, no `Max-Age` or `Expires`. No `Secure`, because the app runs on plain `http://127.0.0.1` and traffic never leaves the Mac. On lock and log out, send the cookie back expired.
   - **One log in at a time:** a new log in closes the old state first.

3. **Gate order and size limits, in `server.ts`, before Next.js sees the request.**
   - Existing checks first (method, target, Host, Origin, Sec-Fetch-Site, duplicate headers), then `Next-Action`, then size, then session.
   - A POST, PUT, PATCH or DELETE without `Content-Length` is refused (411). `Transfer-Encoding` is refused. Limits: password routes 4 KiB, other routes 16 KiB, upload route 20 MiB (`LIMITS.maxFileBytes`) plus nothing else. Over the limit gives 413 before a byte is read. Routes also count bytes as they read, as a second line.
   - **Session gate is default-deny.** Without a valid session, only these pass: `GET /` (the server-chosen start screen), the POST routes for create password, log in and finishing a half-done delete, `/_next/static/`, and exactly one font path, `GET`/`HEAD` `/fonts/google-sans-flex.woff2`, matched against the raw path as a whole string, no query string. Anything else, including any odd spelling or encoding of an allowed path, needs a session. Pages answer with the Locked or Log in screen, and API routes with 401 and no body detail.
   - Each route handler also calls one `requireSession()` helper, because `next dev` has no front gate (Phase 0 condition 14), and as a second line.
   - `public/` holds only the font and `OFL.txt` behind the gate. Previews, `gallery.html` and anything with data never go in `public/`.

4. **Locking.**
   - **Idle:** last use is `Date.now()`, updated only by an action the owner started (page load, POST). The status check pages use on focus and wake never updates it.
   - Every request checks idle first. A server `setInterval` every 30 seconds also locks an idle session, so the key never outlives 15 minutes and 30 seconds with no requests. If the clock has gone backwards (last use is in the future), lock.
   - Lock waits for the one-change-at-a-time lock, so a save finishes or rolls back before the database closes (design, screen 8).
   - **Restart:** in-memory state means a restart is locked by default. Also close the handle on `SIGINT` and `SIGTERM`.
   - **Back button:** the lock and log-out responses send `Clear-Site-Data: "cache"` (127.0.0.1 counts as a secure context in Chrome). Every page has a `pageshow` handler: if `event.persisted`, it clears the page and asks the server before showing anything.

5. **Unicode: NFKC.** The same password typed on different keyboards or input methods can come out as different characters, for example full-width letters or ligatures. NFKC folds them to one form, so the owner's password always makes the same key. NIST SP 800-63B recommends NFKC or NFKD. The entropy lost is negligible at 15 or more characters.
   - It's done inside `deriveKey`, the one place every path goes through, so no route can skip it. ASCII doesn't change, so existing tests keep their keys.
   - Order: refuse over 1,024 code units raw (before any work), refuse broken text (`isWellFormed()` false), normalise, then count characters with `Array.from(text).length` after normalising: at least 15, at most 256. No trimming.
   - Tests pin it: composed and decomposed "é" make the same key, full-width "ｐａｓｓ…" equals its plain form, a lone surrogate is refused.

6. **Slow-down and password checks.**
   - One count in the session store, covering log in, Locked and screen 14. Three free, then 30 seconds doubling to 15 minutes, as designed.
   - The count goes up *before* the hashing starts and resets only on success, so a crash halfway still counts.
   - A try during a wait, or while another check is running, is refused straight away with no hashing. Create password uses the same one-at-a-time guard.
   - Screen 14 checks the password by opening a second, separate handle and closing it at once. Five wrong tries there lock the app.

7. **Common passwords.** A plain UTF-8 text file in `src/lib/auth/` (not `public/`), one password per line, read only on the server and never sent to the page.
   - Source: a permissively licensed public list, such as SecLists (MIT). Keep only entries that are 15 characters or more after NFKC, lowercased, because shorter ones fail the length rule anyway. Expect a few thousand lines, well under 1 MiB. Record the source, licence and SHA-256 in `DECISIONS.md`, and put the licence text beside the file.
   - Fetch it once while building, and treat it as text only. The app never looks anything up online.
   - **Guard check:** `.txt` is scanned for table shapes and secret patterns, but a one-per-line list doesn't look like a table. If a line ever trips the guard, remove that line. Never change the guard.
   - The check compares the NFKC, lowercased password with the list. It also refuses one repeated character, a short unit repeated (`abcabcabc…`, `passwordpassword`) and simple runs such as `123456789012345` or `abcdefghijklmno`.

8. **Start-up screen and steps.** One server function reads the data folder and the database and returns one of: Create password, Log in, Files incomplete, Finish delete, or (once logged in) the first-time step (no rows, rows, answers saved, summary confirmed) or Shell. Every page and route asks it, and anything that doesn't match is sent to the right screen. Nothing in the web address or body can choose it. The return screen after log in comes from a fixed server list.

9. **Data folder and wipe script.**
   - One module, `src/lib/data-files.ts`, with no imports beyond `node:`, gives the folder (`$HOME/Library/Application Support/personal-finance/`) and the exact names: database, its `-journal`, `-wal` and `-shm`, salt, delete marker, and the app's run file. The app and the script both use it.
   - **Run file:** at start, the app writes `app.run` holding its process ID and port. It's removed on clean exit. The wipe refuses if that process is alive *and* the port answers on 127.0.0.1. If neither, the file is stale and is wiped with the rest.
   - **Command shown:** `node '<project path>/scripts/wipe-data.ts'`, one line, no line break, path in single quotes and set once at server start. If the path holds a quote, line break or control character, the screen shows written steps instead of a command. The copy button copies the same constant the screen shows.
   - **Script order:** check `HOME` is set and absolute. `lstat` the folder: a real folder, not a link, and its real path equals the expected one. `lstat` every target before deleting anything: any link or non-file stops the whole run. List the targets, read one line from a real terminal (refuse if not a terminal) and continue only on exactly `DELETE`. Delete the database, then side files, run file and marker, then the salt last. `rmdir` the folder only if it's empty, never recursively. Report other files by count only, never by name. Fixed lines only. Safe to run twice.
   - **In-app delete** (screen 14) uses the same list and order, with the marker written first using the `wx` flag and no data in it.

10. **Upload (4B).**
    - The page sends the file as the raw body (`application/octet-stream`) with `fetch`, not a multipart form, so no form parser touches it.
    - The route reads it into memory with a byte count, and passes the buffer to a `worker_threads` worker as a transfer, not a copy. The worker gets `resourceLimits` (old space 768 MB, young 64 MB, stack 4 MB), `env: {}` and no `argv`, and is ended after 60 seconds.
    - The worker only parses. It never opens the database and never sees the session. The main thread saves the rows. One worker at a time: a second upload during a read is refused.
    - Running out of memory, timeouts or worker crashes become `INTERNAL_ERROR` text. The worker file sits outside `app/` and `public/`, so it can't be called as a route.
    - The pending update holds parsed rows, not file bytes, in the session store. It's dropped on cancel, lock, log out, new upload and after confirm. Nothing goes to a temporary file.

11. **Undo copy (4B).** A second set of tables in the same encrypted database, written in the same `BEGIN IMMEDIATE` transaction as the replace. Never `serialize()`, `VACUUM INTO`, `ATTACH` or `backup()` to another file. `temp_store = MEMORY` stays.

12. **Dependencies.** None needed. Argon2id, random bytes, workers and Unicode normalising are all in Node 24. Font cutting and conversion to woff2 are a one-off tool run outside the repo, never an npm package. If a dependency is still wanted, it comes back to Security first (Phase 0 condition 16).

## Conditions

Numbering carries on from Phase 3. Each one needs evidence (a test name or a check result) at that part's sign-off.

**Before 4A finishes:**

40. Decisions 1 to 3 are in place: no server actions (gate refuses `Next-Action`, a test finds no `"use server"`), the one shared session store, the gate order, the size limits before reading, and the default-deny session gate. Tests send an over-size body, a POST with no length, a chunked body, and a request to every route without a session.
41. The session cookie has exactly the attributes in Decision 2. Tests show a new token at each log in, a planted token is refused, and log out sends the cookie expired.
42. Auto-lock follows Decision 4. Tests with a fake clock: idle 15 minutes locks with no request arriving, a status check doesn't count as use, and a clock that goes backwards locks.
43. Passwords follow Decision 5. NFKC sits inside `deriveKey`, with the three pinned test cases and the raw 1,024 limit.
44. The common-password list follows Decision 7: in the repo, server only, source, licence and SHA-256 recorded, passes `npm run guard` unchanged. Tests cover a listed password, a repeated character, a repeated unit and a run.
45. The slow-down follows Decision 6. Tests show a correct password refused during a wait with no hashing started, a second check refused while one runs, and one shared count across all three screens.
46. The start-up screen follows Decision 8. Tests cover every row of the start-up table and crafted addresses for each step.
47. Delete my data and the wipe follow Decision 9 and condition 29. Tests use a made-up `HOME`: links and sibling files survive, a running app is refused, a stale run file is cleared, and a half-done delete finishes.
48. The data folder is `0700`, the app sets `umask(0o077)`, and the folder is refused if it's a link (S4-9).
49. The font gate lets through exactly one raw path with no query (Decision 3), and `public/` holds nothing else reachable before log in.
50. A test fails on a `"use server"`, `next/font/google`, `@import` of a font, or `src: local(` in `src/`.
51. Back after lock and log out shows no figures in plain Chrome, with `Clear-Site-Data` and the `pageshow` check in place (S4-10). Not one test round: one recorded browser check.
52. **No shortcut in 4A (S4-6).** No route, flag, setting or environment variable seeds data, skips a step or opens the shell. After create password, 4A shows a placeholder upload screen, and the step logic still holds Overview back until the summary is confirmed. The shell is tested by tests that build a made-up database in a temporary folder. Security searches the built app for such a path at sign-off.
53. No password, token or caught error is logged. A test runs a wrong log in, a too-common password and a failed delete with stdout and stderr captured, and checks the password and token aren't in them.

**Before 4B finishes:**

54. The upload follows Decision 10. Tests: an over-size file is refused before reading, a file that blows the worker's memory or time gives fixed text, a second upload during a read is refused, and no new file appears in the temp folder or data folder during an import.
55. The undo copy follows Decision 11 and Phase 0 condition 12. A test reads the raw database and its side files after a replace and fails on a made-up marker name. A test fails if `serialize(`, `VACUUM INTO`, `ATTACH` or `.backup(` appears in `src/`.
56. The server refuses a replace without the tick when a partial-file warning applied, works out "most accounts missing" itself (ruling 1), refuses Start over after the summary is confirmed (S3-14), and refuses any save whose data version is stale.
57. Conditions 36 (removed names) and 23 to 27 (amounts limit on replace, one error boundary, size and session on every route, server `today`, names as text) have tests on the 4B routes.
58. At 4B sign-off, Security checks the full route list against the default-deny gate again, because 4B adds the most routes.

## Known limits

The Phase 3 limits stand. Added or sharpened by this review:

- **Other local apps.** Cookies aren't kept apart by port, so any other web server the owner opens on 127.0.0.1 gets the session cookie with each visit. It can't use it from a browser page, because of the exact origin checks. A program already running on the Mac could, but such a program could read the screen anyway.
- **Passwords and file bytes in memory** stay until JavaScript cleans them up, and can't be wiped (S4-12, Phase 1 condition 13).
- **The slow-down resets on restart.** It's a speed bump. Argon2id and the 15-character minimum are the real protection.
- **The wipe's "running" check** can be fooled by a stopped app whose process ID and port have both been reused by something else. The result is a refusal, never a wrong delete.
- **NFKC is fixed for good.** Changing it later would make existing data unreadable.

## Not verified

- Nothing is built, so every control is unproven until each part's sign-off.
- I didn't run Next.js 16 to confirm how module copies split between `proxy.ts`, routes and `server.ts`. Decision 2 is safe either way.
- I didn't test Chrome's back/forward cache with `no-store`, or that `Clear-Site-Data` works on `http://127.0.0.1`. Condition 51 checks both.
- I didn't download or check any common-password list or its licence, and didn't download the font.
- The worker memory figures are my estimate from the import limits (200 MB of text). QA should confirm a large made-up file passes under them.

## Question for the owner

In 4A, your try-out ends at a placeholder upload screen after you create your password, because upload arrives in 4B. You'll see the shell and Delete my data through the preview and the testers' results, not with your own data, until 4B. Is that fine? The alternative is a hidden shortcut to fill in data, which I advise against (S4-6).

## Sign-off, Part 4A (Security, 2026-11-09)

### Decision

**Signed off with conditions.** No Blocker or Major. Every 4A condition (40 to 53) is met. Two Minors (S4-14, S4-15) should be fixed before Part 4B signs off. Nothing here stops 4B starting.

Checks I ran myself (tests on a made-up HOME in my scratch folder): `npm test` 432 passed, 0 failed. `npm run typecheck` passed. `npm run guard`: 170 files, nothing blocked. `npm audit`: 0 problems. I also called the gate and the slow-down directly from a scratch script.

### Conditions 40 to 53

| # | Result | Evidence |
|---|---|---|
| 40 | Met | `gate.ts` order: request checks, `Next-Action` (403), `Transfer-Encoding` (411), one `Content-Length` of digits (411), limits 4 KiB / 16 KiB (413), then session. Default-deny list is only `GET /`, the font path, `/_next/static/`, and three POSTs. Only those three routes skip `requireSession`. `gate.test.ts`, `app-source.test.ts` (no `"use server"`), `server.test.ts` |
| 41 | Met | `sessionCookie` is exactly `pf_session=…; Path=/; HttpOnly; SameSite=Strict`. 32 random bytes per log in, only the SHA-256 kept, compared in constant time. Expired cookie on log out. `auth-session.test.ts` |
| 42 | Met | `Date.now()`, 30-second `sweep` with `unref`, clock going backwards locks, status check uses `touch: false`. Lock waits for the change chain. Fake-clock tests in `auth-session.test.ts` |
| 43 | Met | `auth-password.test.ts`: é two ways, full-width, lone surrogate, 1,024 raw limit before hashing |
| 44 | Met | See D-025 ruling below. Rules tested in `auth-password.test.ts`. Guard passes unchanged |
| 45 | Met | Count goes up before hashing, refused with no hashing during a wait or a running check, one count for log in, Locked and delete, 5 wrong deletes lock. See S4-14 for one side effect |
| 46 | Met | One server function chooses the screen. Shell pages call `requireShell`, which sends anything else to `/`. `start-screen.test.ts`, crafted addresses in `gate.test.ts` and `server.test.ts` |
| 47 | Met | `delete-wipe.test.ts` on a made-up HOME. QA ran the wipe end to end (refused while running, `DELETE` only, other files counted not named) |
| 48 | Met | `server.ts` sets `umask(0o077)`, `prepareDataFolder` makes `0700` and refuses a link (the app won't start). `start-screen.test.ts` |
| 49 | Met | I probed the gate: only `/fonts/google-sans-flex.woff2` passes without a session. A query, trailing slash, `%67`, `..`, upper case and `/fonts/OFL.txt` all get 303; `//fonts/…` gets 403. `public/` holds only the font and `OFL.txt` |
| 50 | Met | `app-source.test.ts`. My search of `src/` found no `next/font`, `@import`, `src: local(` or Google font host |
| 51 | Met | `Clear-Site-Data: "cache"` on lock and log out, `PageGuard` clears and reloads a page restored from the page cache. The owner's Back check in Brave (Chromium) passed: no app page or figure came back |
| 52 | Met | My search found no seed route, flag, setting, `searchParams` or environment variable that picks a step. The only environment reads are `HOME`, the port and `NODE_ENV` for the dev policy. The upload page is a placeholder behind `requireShell` |
| 53 | Met | No `console` call in `src/` routes or auth code. `server.ts` logs two fixed start lines and "Ready". `server.test.ts` captures output through a wrong log in, a too-common password and a wrong delete |

**Q4-11 (first Back showed Locked without its field).** No change needed. What came back was the Locked screen itself, not a figure or an app page, and the second Back showed it whole. The most likely cause is the moment between `PageGuard` emptying a restored page and the reload finishing, or a restored copy before its script ran. Either way it fails safe. Leave it as a Minor in the handoff. If the owner finds it confusing, the Designer can look at it in Phase 5.

### Font file (D-024)

Met. `public/fonts/google-sans-flex.woff2` is 30,024 bytes, SHA-256 `cf07d177…dfe11916`, and starts with the woff2 signature. Both match D-024. `OFL.txt` (4,488 bytes) sits beside it and its SHA-256 matches D-024. `fonts.css` has one `@font-face` pointing at that path, woff2 only, no `local()`. The policy says `font-src 'self'`, and nothing in `src/` names a Google host. Before log in only the exact font path is served (condition 49). One stale comment in `fonts.css` still says the file isn't added yet. Harmless.

### Common-password list (D-025)

Met.
- **Source and size:** SecLists `Pwdb_top-1000000.txt` at a pinned commit, MIT licence beside it as `common-passwords.LICENSE`. The file is 94,740 bytes, SHA-256 `c3fe0385…60a90a14d1`, matching D-025. It has 5,350 lines: 2 `#` header lines and 5,348 entries, as recorded.
- **Contents:** I skimmed it. Plain lower-case strings of 15 to 70 characters. No blank lines, no control characters, no duplicates, no `<`, `>`, backticks or web addresses. 9 lines are garbled non-Latin text (mojibake from the source list), and 9 look like email addresses (from the public list, not the owner). Neither is a risk. The emails could be removed for tidiness, but it's not required.
- **Loading:** `password-rules.ts` reads it once with `readFileSync` from `src/lib/auth/`, on the server only, never from `public/`, with no network call. Each line is NFKC-normalised and lowercased, and `#` lines are skipped. The password is checked the same way: raw limit, broken text refused, NFKC, length, then lowercased and compared with the set, after the repeat and run checks.
- **One note:** the path comes from `process.cwd()`. `npm run app` always runs from the project folder. If the app were started elsewhere the read would fail and create password would refuse (fails closed). No change needed.

### Q4-6: `npm run wipe` against Decision 9

**`npm run wipe` is acceptable.** Decision 9 quoted a path only because the command held one. `npm run wipe` holds no path, so there's nothing to quote or break, and the script itself does all the safety checks (HOME, links, the app's own file names, typing `DELETE`). The one risk is QA's: run in a different folder, npm finds another project's `wipe` script, or none. In a fresh Terminal window, which opens in the home folder, the owner just gets a "Missing script" error.

**Wording needed (S4-15).** Step 2 should say which window to use, matching step 1. Proposed: "Then, in that same Terminal window, paste this and press Return. It lists what it will delete and asks you to type DELETE." This is a wording change, so it needs the owner's yes and goes through the Designer.

### Q4-10: a correct log in after a wait gave a second wait

**Real, but it fails safe. Minor (S4-14).** I reproduced the cause in a scratch script with a fake clock. `beginPasswordCheck` raises the count and sets the next wait *before* hashing, even when the password turns out to be right. After 4 wrong tries, a correct try sets a 60-second wait for the length of the hash, then clears it on success. Anything that asks during those moments sees the 60-second wait:
1. a second log in request (for example Return pressed twice before the button switches off, since `busy` is React state and not a ref), which is refused with `seconds: 60`;
2. a page load of `/` (`page.tsx` reads `waitSeconds()`).

That matches what QA saw ("59 seconds"). It's not a security hole, because it only ever refuses. It does make a correct owner wait for nothing.

**Steps to reproduce (code level):** 4 wrong tries, let the 30 seconds pass, start a correct try, and call `waitSeconds()` or `beginPasswordCheck()` again before it finishes. Both report 60 seconds.

**Fix, before Part 4B signs off:** keep counting the try before hashing (Decision 6), but set `waitUntil` only in `finish(false)`. That's no weaker: the store is in memory, so a crash halfway loses the wait anyway. When a check is already running, refuse with a short fixed wait (the existing 2 seconds), not the next wait. On the page, guard submit with a ref so a second Return can't send a second request. Add a test for both.

### New findings

| ID | Level | Finding | When |
|---|---|---|---|
| S4-14 | Minor | A correct log in after a wait briefly sets the next wait, so a second request or a page load in that moment shows a false 60-second wait (Q4-10) | Before 4B sign-off |
| S4-15 | Minor | The wipe panel's step 2 doesn't say to use the same Terminal window (Q4-6) | Wording, with the owner's yes, before 4B sign-off |

### Not verified

- I didn't run the app or a browser myself. The live checks are QA's and the owner's Brave check.
- The 15-minute idle lock was tested only with a fake clock, not waited out in real time.
- Copy on the wipe panel: the built-in browser blocks the clipboard, so "Copied" hasn't been seen.
- The Back check was in Brave, not Google Chrome. Both use Chromium's page cache, so I accept it for condition 51.

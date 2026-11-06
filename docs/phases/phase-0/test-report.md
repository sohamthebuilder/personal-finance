# Phase 0 test report

Independent QA, second run. All evidence below was gathered by running the behaviour directly, not from the builder's tests or documents.

- **Date:** 2026-11-06
- **Commit tested:** `7ef73385a24e86e2f7f33951c335b3b0b253ac8f` (`phase-0`, same as `origin/phase-0`)
- **Node:** 25.8.0 (npm 11.11.0)

## Overall result: FAIL

Of 19 criteria: 13 pass, 4 fail, 1 was not tested and 1 is pending.

This is a big improvement. Every reproduction step from the first run is now fixed, F2 and F5 are closed, and no failure exposes data. The 4 remaining failures come from three narrower problems found by trying new variants:

- WebSocket upgrade requests get past the new gate (F3).
- Some renamed spreadsheets and CSVs still get past the data guard (F1).
- A 1-byte database file still accepts any password (F4).

AC-12 still needs its fresh-session test, which the owner has to run (see "What couldn't be tested").

## Results

| ID | Result | Evidence |
|---|---|---|
| AC-1 | Pass | `gh`: repo private, pull request 1 open and unmerged, `phase-0` into `main` |
| AC-2 | Pass | `gh api .../vulnerability-alerts` returned 204 (on) |
| AC-3 | Pass | Direct dependencies exact, lockfile committed, fresh clone of this commit installed with `npm ci` |
| AC-4 | Pass | Fresh clone, README only: `npm run setup`, `npm run app`, page returned 200 through `server.ts`. All 3 hooks executable and on after setup |
| AC-5 | Pass | `lsof`: one listener, `127.0.0.1:3000`, and no other ports. Refused on `192.168.1.10` and `[::1]`. `HOSTNAME=0.0.0.0 PORT=4000` changed nothing. `APP_PORT=3999` stayed on 127.0.0.1 and the allow-list followed it. Dev mode also 127.0.0.1 only |
| AC-6 | Pass | `start` now sets the variable for `server.ts`, confirmed in the running process's environment. No outbound connections from the server |
| AC-7 | **Fail** | The proof passes and an empty file is now refused. But a 1-byte file opens with any password. See F4 |
| AC-8 | Pass | Argon2id with a random salt, unchanged. Password, key and test text absent from all files in the database folder. See limit below |
| AC-9 | Pass | 45 of 45 names ignored, including every side file missed last time |
| AC-10 | **Fail** | All 36 extensions, upper case, compound names, folders and every miss from the first run are now blocked. A real FODS file and some CSV forms still commit when renamed. See F1 |
| AC-11 | **Fail** | Added-then-removed files caught, including all the old misses and a file on an unmerged branch. It shares the new misses from AC-10. **Run locally only, not on GitHub** (D-009) |
| AC-12 | **Not tested** | `claude auth status` still shows `loggedIn: false`, so the fresh-session test can't run. Evidence from the first run stands, but it isn't the required test |
| AC-13 | Pass | Run 42237015959 for this exact commit: Data guard (59 files), Tests (127 of 127, plus all 6 proof checks, none skipped) and Dependency audit (0 vulnerabilities) all passed. Logs read |
| AC-14 | Pass | Every app response now carries the headers. Page policy has a fresh nonce on all 9 scripts and no `unsafe`. Positive control worked in real Chrome through the gate. One exception below |
| AC-15 | **Fail** | All attacks from the first run now return 403, plus many new ones. But upgrade requests skip the gate. See F3 |
| AC-16 | Pass | Compared line by line again: the row type wording matches section 2, and the title no longer names the app. No values |
| AC-17 | Pass | `fdesetup status`: FileVault is On |
| AC-18 | Pass | 37 paths and 59 blobs across all refs: no blocked names, no spreadsheet, database or archive magic bytes, no secrets, no real figures or names |
| AC-19 | Not tested (pending) | `DECISIONS.md`, `security.md` and this report exist. `handoff.md` and the security sign-off don't exist yet. Mismatches to fix are listed under "Other observations" |

**Commands run directly:** `npm test` 127 of 127 passed, `npm run typecheck` clean, `npm audit` 0 vulnerabilities, `npm audit signatures` verified, `npm run guard` clean (59 files).

**AC-14 detail:**

- A throwaway route in a scratch clone was served through `server.ts`. An inline script, a wrong-nonce script, a non-nonced same-origin script, `eval` and a `style` attribute were all blocked and reported as violations. A nonced script ran.
- The real page showed 0 policy messages, in the same logging setup that captured 4 for the control.
- The gate's fallback policy doesn't override the page policy: there is one policy header per response, and pages get the nonce version. Spoofing `x-nonce`, `Content-Security-Policy` or `x-middleware-subrequest` changed nothing.
- **Exception:** Node's own 400 and 431 responses, sent before any app code runs, still have no headers. I counted this as a pass because they hold no content and `security.md` lists it. Note that 431 comes from a long URL, not only from malformed requests. `server.on("clientError")` could close this if the team wants a literal "every response".

**App sanity check:** page opens in real Chrome at 1280, 768, 375 and 320 pixels wide with no sideways scrolling. `npm run dev` starts, is bound to 127.0.0.1, writes no `AGENTS.md`, and refuses a bad Host or Origin on the page.

## Status of each failure

| ID | Status | Summary |
|---|---|---|
| F1 | **Still failing, much narrower** | Every listed miss is blocked now. New renamed forms get through |
| F2 | Fixed | Trailing-slash redirects, `TRACE` and `OPTIONS *` all carry the headers |
| F3 | **Still failing, much narrower** | All 5 listed attacks are fixed. One route around the gate remains |
| F4 | **Still failing, much narrower** | Empty files are refused and creation writes at once. A 1-byte file still opens |
| F5 | Fixed | Wording matches section 2, and question 1 now asks the owner for the exact label |

### F3: WebSocket upgrades skip the gate (AC-15). Severity: Low to Medium

`server.ts` only checks the `request` event. After the first allowed request, Next.js attaches its own `upgrade` listener to the server, and upgrade requests go there without passing the gate. So the same hostile request gets a 403 at first and no refusal afterwards. The connection then stays open.

- 200 hostile upgrade sockets stayed open for the full 150 seconds of my test. The server closed none and sent 0 bytes. Normal pages still loaded.
- In real Chrome, a page on another origin opened `new WebSocket("ws://127.0.0.1:3000/")`. It sat in "connecting" for the 15 seconds I watched, instead of being refused. I tested from a local origin, not a public website.

No content or data was returned, and the socket never opened. It matters because D-014 and `server.ts` say every request is checked, and D-014 tells Phase 4 to put the session check in the gate. Upgrades would skip that too.

```bash
npm run app
# In another terminal:
UP='GET / HTTP/1.1\r\nHost: evil.example\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n'
printf "$UP" | nc -w 2 127.0.0.1 3000 | head -1   # 403 Forbidden, if no allowed request has been served yet
curl -s -o /dev/null http://127.0.0.1:3000/
printf "$UP" | nc -w 2 127.0.0.1 3000 | head -1   # no response at all
```

### F1: Some renamed spreadsheets and CSVs still commit (AC-10, AC-11). Severity: Low to Medium

| Still commits, and passes `npm run guard` where tried | Why | In `security.md`? |
|---|---|---|
| Real FODS spreadsheet renamed to `.xml` | The check looks for `office:spreadsheet`, which sits deep in the file, in the first 1024 bytes only. The mimetype at the top says `opendocument.spreadsheet` | No |
| UTF-16 tab-separated text, which Excel's "Unicode Text" save produces | The heuristic gives up on any NUL byte | No |
| A perfect CSV with one title line above it | Only the first line's field count is compared | No |
| CSV with Mac-style CR-only line endings | Seen as a single line | No |
| Pipe or colon-separated text | Those separators aren't checked | No |
| Access database (`.mdb`, `.accdb`) renamed to `.bin` | Blocked by name only, with no content check. Lower priority | No |

Two-column CSVs, very uneven rows and tables in `.md`, `.json`, `.js`, `.yml` or `.html` also commit, but `security.md` lists those as known limits, so I haven't counted them.

The FODS case is a plain AC-10 miss and a small fix. The CSV forms depend on reading a renamed CSV as a spreadsheet, as noted in the first run. No heuristic will catch everything, so the team may accept some of these, but each one accepted should be listed in `security.md`.

```bash
python3 -c "open('qa-table.txt','wb').write('Date\tAccounts\tINR\n2020-01-01\tFake Bank\t100\n2020-01-02\tFake Bank\t200\n'.encode('utf-16'))"
git add qa-table.txt && git commit -m test     # commits, UTF-16 table

printf 'Fake Report\nDate,Accounts,INR\n2020-01-01,Fake Bank,100\n2020-01-02,Fake Bank,200\n' > qa-title.txt
git add qa-title.txt && git commit -m test     # commits, title row
```

For FODS, commit any `.fods` file renamed to `.xml` where `<office:spreadsheet>` comes after the first 1024 bytes, which is normal for a real file.

### F4: A 1-byte database file accepts any password (AC-7). Severity: Low

The fix checks for exactly 0 bytes. I tried real ciphertext cut to every size from 1 to 32 bytes, and to 100, 512, 1024, 4095 and 4096. Only 1 byte opens with a wrong password. Any write then takes the file over and the original password is refused, as in the first run.

This needs a damaged file, because `createEncryptedDb` can't leave one, and nothing can be read from it. Refusing anything smaller than one page would close it.

```ts
const c = await createEncryptedDb(path, "made-up-right"); c.close();
truncateSync(path, 1);
await openEncryptedDb(path, "made-up-WRONG");   // opens, should throw
```

Everything else I tried was refused: a create-only file, a copy taken while open, NUL-filled files of 100 bytes and up, random bytes, a plain database swapped in, a bare SQLite header, a symlink to an empty file, and an empty file with a `-wal` beside it.

## What the gate survived

These all got the right answer through `server.ts`:

- **Refused with 403 and headers:** bad Host, Origin and `Sec-Fetch-Site` on trailing-slash URLs, absolute-form URLs (including an upper-case scheme), `//` and `/\` paths, `TRACE`, `PROPFIND`, `OPTIONS *`, and duplicate Host, Origin or `Sec-Fetch-Site`, even when identical or with mixed-case names.
- **Refused by Node with 400:** folded headers, a space before the colon, bare LF, NUL in Host, and a smuggling attempt with both `Content-Length` and `Transfer-Encoding`.
- **No redirect off the Mac:** 11 path tricks, such as `/.//evil.example/`, `/%2f/` and `/foo/..//`, all stayed on-host.
- **Pipelining:** a good request then a bad one on the same socket gave 200, then 403.
- **Header spoofs:** `x-middleware-subrequest`, `x-matched-path`, `x-invoke-*` and `x-forwarded-host` didn't skip the policy.
- **Stability:** bad percent encoding and long URLs caused no crash and no server errors in the log.
- **Bad settings fail safely:** `APP_PORT=abc` falls back to 3000, while `APP_PORT=99999` and a busy port both stop the server.

## What couldn't be tested

- **AC-12 fresh session.** `claude` isn't logged in here, and I didn't log in or use any other credential. The owner should log in and run this from the repo root. A refusal from permission settings is a pass, and "file does not exist" is a fail:
  `claude -p "Use the Read tool to open made-up-guard-test.xlsx in the current folder and tell me exactly what happened"`
- **AC-11 on GitHub.** The failure path was run locally only, by design (D-009). A real failing check on GitHub hasn't been seen.
- **AC-8 system-wide.** I scanned the database folder and read the code. I didn't trace every disk write on the Mac, which needs root.
- **Hook on symlinks, and the Excel lock-file name `~$name.xlsx`.** The hook refuses commands that set these up, so neither was exercised by me.
- **Whether `"onFailure": "block"` is honoured.** The hook now exits 2 on every crash I tried (bad, empty and wrongly typed input), so this only matters if `node` itself can't start.

## Other observations (not failures)

- **`pre-push` misses a commit pushed by hash.** The hook scans refs and ignores what's actually being pushed. With the hook on, `git push <remote> <hash>:refs/heads/x` sent a fake blocked file to a local bare repo, because no ref pointed at that commit. `git push <remote> 'HEAD@{1}:refs/heads/x'` also worked for a commit no ref pointed at. It takes a bad commit made earlier with `--no-verify`, so it's unlikely by accident. Reading the hook's standard input would close it. D-015 calls this hook the last check before data leaves the Mac.
- **What `pre-push` and `pre-merge-commit` did catch.** True merges, `--no-commit` and `--squash` were blocked. Fast-forward merges, rebases and cherry-picks still bring a bad commit in, but `pre-push` then blocked pushing it. `security.md` mentions only cherry-picks. While a bad branch exists locally, every push is refused, even of clean branches. That errs on the safe side.
- **False positives are low.** Nothing in this repo is blocked (59 file versions), and 0 of 3,207 real files in `node_modules` were flagged. Short samples I wrote to be worst cases were blocked in `.jsx`, `.mts`, `.cts`, `.sql`, `.sh`, `.toml`, `.py`, `.map`, `.txt`, `.env.example` and `Makefile`. Real files of these types are less even, and a false block fails safely. But `.jsx`, `.mts` and `.cts` are source code and could be added to the skip list.
- **Other archives aren't blocked.** Bzip2, xz, 7z, rar, zstd and plain tar all commit, though a comment in the guard says no archive belongs here. Zip and gzip are blocked as the builder said. A base64-encoded spreadsheet, or one with a junk byte in front, also commits.
- **Document mismatches to fix for AC-19.** `server.ts` and D-014 say every request is checked (F3). `security.md` needs the new F1 forms or the fixes. README line 9 still says only "pre-commit data guard". D-015 needs the push-by-hash gap.
- **Dev mode has no gate, as documented.** A trailing slash with a bad Host gives 308, and `TRACE` gives 500. The dev websocket question from the first run is settled: a hostile Host or Origin gets "Unauthorized" and is closed, while a valid request gets 101.
- **Crash leftovers lock the path.** A 0-byte file plus its salt can be neither opened nor recreated until deleted by hand. That's safe, but Phase 4 will want a clear message.
- **Password forms.** The same password in a different Unicode form is refused. Phase 4 should decide whether to normalise before the first real password is set.
- **Static files changed caching.** They were `immutable` and are now `no-store`, because the gate's baseline stays in place. Harmless on one Mac, and safer if anything.
- **AC-13 needs a re-check.** This report and any fixes create a new commit, so the pull request check must pass again on the final commit.

## Test leftovers

- **Pushes went only to a local bare repo in my scratch folder,** using a fake `.dat` file. Nothing went to GitHub, and that repo is deleted.
- **Unreachable test objects remain in `.git`.** There are now 119 commits, 226 trees and 57 blobs from both runs, all made-up content, never pushed, and not on any branch. As instructed, I didn't retry the prune. Normal git housekeeping will expire them, or the owner can run `git reflog expire --expire-unreachable=now --all && git prune --expire=now`. There were none before testing, so that removes only test objects.
- **`refs/remotes/origin/HEAD`** appeared after I ran `git fetch`. It points at `origin/main` and is harmless.
- **The hook blocked me as designed** in the first run when I tried a temporary clone, so both runs used a throwaway local branch here, which is now deleted.

## History of the first run

Tested on `76cd363`. Result: Fail, with 10 pass, 7 fail, 1 not tested and 1 pending.

| ID | What failed | Criteria |
|---|---|---|
| F1 | Guard and `.gitignore` missed renamed CSVs, `.numbers` folders, `.sqlite3-wal` and similar side files, renamed WAL and journal files, and several formats | AC-9, AC-10, AC-11 |
| F2 | Trailing-slash redirects, `TRACE` and `OPTIONS *` had no security headers, because Next.js answered before the proxy ran | AC-14 |
| F3 | Those same requests skipped Host and Origin checks. An absolute-form URL redirected to `evil.example`, and a duplicate Host with the good one first returned the page | AC-15 |
| F4 | A database with nothing written opened with any password, which then took it over | AC-7 |
| F5 | `export-format.md` invented two exact labels and named the app, neither from section 2 | AC-16 |

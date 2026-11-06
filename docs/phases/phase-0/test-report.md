# Phase 0 test report

Independent QA. All evidence below was gathered by running the behaviour directly, not from the builder's tests or documents.

- **Date:** 2026-11-06
- **Commit tested:** `76cd36398f469c54640cdc8a0de4f8655048e48b` (`phase-0`, same as `origin/phase-0`)
- **Node:** 25.8.0 (npm 11.11.0)

## Overall result: FAIL

Of 19 criteria: 10 pass, 7 fail, 1 was not tested and 1 is pending.

No failure exposes data today, because the app holds none and nothing leaked. The core controls work: the server is local only, encryption holds for any database with data in it, and the main data guard cases are blocked. The failures are gaps at the edges of those controls. The data guard gaps (F1) matter most, because that control exists to stop the owner's real file slipping out.

AC-12 still needs its fresh-session test, which couldn't run here. The owner needs to run one command (see "What couldn't be tested").

## Results

| ID | Result | Evidence |
|---|---|---|
| AC-1 | Pass | `gh`: repo private, pull request 1 open and unmerged, `phase-0` into `main`, `main` has the initial commit |
| AC-2 | Pass | `gh api .../vulnerability-alerts` returned 204 (on) |
| AC-3 | Pass | All 9 direct dependencies exact. Lockfile committed: 83 packages, all from the npm registry, all with integrity hashes. Fresh clone installed with `npm ci` |
| AC-4 | Pass | Fresh clone, README only: `npm run setup`, `npm run app`, page returned 200 with the expected text. Hook on after setup (`core.hooksPath=.githooks`, file executable) |
| AC-5 | Pass | `lsof`: one listener, `127.0.0.1:3000`. Refused on `192.168.1.10` and on `[::1]`. Same result in dev mode |
| AC-6 | Pass | `dev`, `build` and `start` all set the variable (`app` calls them). `next telemetry status` printed Disabled |
| AC-7 | **Fail** | The proof passes, and every attack on a database with data failed. But a database with nothing written yet opens with any password. See F4 |
| AC-8 | Pass | Argon2id, 64 MiB, 3 passes, random 16-byte salt, confirmed in code and by test. Password and key absent from every file in the database folder, including live side files. Code never writes them. See limit below |
| AC-9 | **Fail** | 28 of 36 names ignored. Not ignored: `.sqlite3-wal`, `.sqlite3-shm`, `.sqlite3-journal`, `.db3-wal`, `.db3-journal`, `.s3db-wal`, `.xlt`, `.mdb`. See F1 |
| AC-10 | **Fail** | All listed extensions, `git add -f`, upper case, compound names and renamed xlsx, xls, ods, Numbers and SQLite files were blocked. Real misses remain. See F1 |
| AC-11 | **Fail** | Added-then-removed files were caught (exit 1), including merge-only, other-branch and tag-only cases. It misses the same files as AC-10. **Run locally only, not on GitHub** (D-009). See F1 |
| AC-12 | **Not tested** | The required fresh-session test couldn't run because `claude` isn't logged in here. Partial evidence from this session below |
| AC-13 | Pass | `gh pr checks 1` and run 42233684662 for this exact commit: Data guard, Tests (87 of 87, plus proof) and Dependency audit all passed. Logs read, nothing skipped |
| AC-14 | **Fail** | The policy itself passes in real Chrome with a working positive control. But some responses carry no security headers at all. See F2 |
| AC-15 | **Fail** | 36 attack variants on 9 paths were refused correctly, and normal requests work. But requests that never reach the proxy aren't rejected. See F3 |
| AC-16 | **Fail** | Traps and layout match section 2 and there are no values. The row type labels were changed and the app name isn't from section 2. See F5 |
| AC-17 | Pass | `fdesetup status`: FileVault is On |
| AC-18 | Pass | 33 paths and 36 blobs across all refs: no blocked names, no spreadsheet or database magic bytes, no secrets. Largest file 47 KB. Docs reviewed: no real figures or account names |
| AC-19 | Not tested (pending) | `DECISIONS.md`, `security.md` and this report exist. `handoff.md` and the security sign-off don't exist yet. Mismatches to fix are listed under "Other observations" |

**Commands run directly:** `npm test` 87 of 87 passed, `npm run typecheck` clean, `npm audit` 0 vulnerabilities, `npm audit signatures` verified, `npm run guard` clean (36 files).

**AC-12 partial evidence, from this session only, so it doesn't count as the pass:**

- Read on a made-up `.xlsx` and `.CSV` in the scratchpad: refused by permission settings.
- Read on `made-up-guard-test.xlsx` in the repo: refused by permission settings.
- Control: Read on a missing `.txt` in the repo returned "File does not exist", so the refusal is the rule firing.
- No user-level rule mentions these file types, and there is no managed settings file, so the refusal points to the project file.
- `cat` on a made-up scratchpad spreadsheet: refused by the hook.

**AC-14 detail:**

- A throwaway route in a scratch clone gave the positive control. An inline script, a wrong-nonce script, a non-nonced same-origin script, `eval`, `new Function` and a `style` attribute were all blocked and reported as violations.
- A nonced script ran, which proves the policy isn't simply blocking everything.
- The real page showed 0 policy messages in plain headless Chrome, in a run where the same logging captured the control's violations.

**AC-7 and AC-8 detail:**

- Refused: wrong password, different case, empty password, undefined password, random key, all-zero key, one flipped key bit, right key with the wrong cipher, password used as a direct passphrase, salt used as key, swapped salt, no key, and stock `sqlite3` (`.tables` and `.dump`).
- The test text and table name were absent from the main file, and from `-wal`, `-shm` and `-journal` captured while the database was open or mid-transaction. Those files are all mode 600.
- `temp_store` is memory, and a large sort left no temp files.
- A flipped byte in a page was detected.

**App sanity check:** page opens in real Chrome at 1280, 768, 375 and 320 pixels wide with no sideways scrolling. `npm run dev` starts and listens on 127.0.0.1 only, and writes no `AGENTS.md`.

## Failures

### F1: Data guard misses some database, spreadsheet and CSV files (AC-9, AC-10, AC-11). Severity: Medium

Each of these committed successfully with made-up content, and `npm run guard` also passed the two I tried in history (`.sqlite3-wal`, renamed CSV).

| Miss | Why it matters |
|---|---|
| CSV or TSV content renamed to `.txt`, `.log` or `.csv~` | The easiest slip. There is no content check for plain tabular text |
| `.numbers` folder, such as `Budget.numbers/Index/Document.iwa`, with `git add -f` | Only the last part of the path is checked. `.gitignore` catches the folder, but `-f` skips that |
| `.sqlite3-wal`, `.sqlite3-shm`, `.sqlite3-journal`, `.db3-wal`, `.s3db-journal` | The list covers `-wal` and friends for `.db` and `.sqlite` only. A plain WAL file holds real rows |
| Plain SQLite WAL or journal content renamed to `.bin` | Their magic bytes aren't checked (`377f0682`, `d9d505f9`) |
| `.fods`, Excel 2003 XML, `.mdb`, `.accdb`, gzipped CSV | Spreadsheet or database formats with no name or content rule. Lower priority |

Steps to reproduce, in a repo with the hook on:

```bash
printf 'Date,Accounts,INR\n2020-01-01,Fake Bank,100\n' > qa-table.txt
git add qa-table.txt && git commit -m test     # commits, should be blocked

mkdir -p Fake.numbers/Index && echo made-up > Fake.numbers/Index/Document.iwa
git add -f Fake.numbers && git commit -m test  # commits, should be blocked

echo made-up > qa.sqlite3-wal
git add qa.sqlite3-wal && git commit -m test   # commits, not ignored either
```

AC-10 names "a spreadsheet or database renamed". Counting a renamed CSV as a spreadsheet is my reading of it. Spotting tabular text will need a heuristic, so the team may prefer to accept that one as a known limit. It's currently not listed in `security.md`.

### F2: Some responses carry no security headers (AC-14). Severity: Low to Medium

The comment in `src/proxy.ts` says nothing is skipped, but Next.js answers these before the proxy runs.

| Request | Response | Security headers |
|---|---|---|
| Any URL with a trailing slash, such as `/foo/` | 308 | None |
| Absolute-form URL, or `//evil.example/` | 308 | None |
| `TRACE` on any path | 500 | None of the 7 (it does send `Cache-Control`) |
| `OPTIONS *` | 500 | None of the 7 |

A normal browser can reach the trailing slash case. The 400s Node sends for malformed requests, or for HTTP/1.1 with no Host, also have no headers, but those are refused before any app code runs.

```bash
curl -si http://127.0.0.1:3000/foo/
curl -si -X TRACE http://127.0.0.1:3000/
```

### F3: Requests that skip the proxy aren't rejected (AC-15). Severity: Low to Medium

No page content was returned in the first three cases. The risk is that the "rejected everywhere" guarantee isn't true, and later phases will rely on it.

| Request | Expected | Actual |
|---|---|---|
| `/foo/` with `Host: evil.example`, a bad Origin, cross-site `Sec-Fetch-Site`, or POST with no Origin | 403 | 308 to `/foo` |
| `GET http://evil.example/` (absolute form), good Host | 403 or 400 | 308 with `Location: http://evil.example/`, so it redirects off the Mac |
| `GET http://127.0.0.1:3000/` (absolute form), `Host: evil.example` | 403 | 308 |
| `TRACE /` with a bad Host or bad Origin | 403 | 500, with a stack trace in the server log only |
| Two Host headers, good one first, then `evil.example` | 400 or 403 | **200 with the page.** Node keeps the first. With the bad one first it's 403 |

A browser can't send the last four, so DNS rebinding isn't helped by them. The first row can be sent by a rebinding page, but it only gets a redirect, and following it hits the 403.

```bash
curl -si -H 'Host: evil.example' http://127.0.0.1:3000/foo/
printf 'GET http://evil.example/ HTTP/1.1\r\nHost: 127.0.0.1:3000\r\nConnection: close\r\n\r\n' | nc 127.0.0.1 3000
printf 'GET / HTTP/1.1\r\nHost: 127.0.0.1:3000\r\nHost: evil.example\r\nConnection: close\r\n\r\n' | nc 127.0.0.1 3000
```

### F4: An empty database accepts any password, and that password then takes it over (AC-7). Severity: Low to Medium

`createEncryptedDb` leaves a 0-byte file until the first write, and an empty file has nothing to check the key against. If a crash or early exit comes between create and first write, the next password typed "works". Any write then encrypts the database with that password, and the original is refused. No data can be exposed this way, because the file is empty. But Phase 4's login would treat a wrong password as correct. With one table written, a wrong password is refused correctly.

```ts
const c = await createEncryptedDb(path, "made-up-right");
c.close();                                                // file is 0 bytes
const d = await openEncryptedDb(path, "made-up-WRONG");   // opens, should throw
d.exec("CREATE TABLE t(n)"); d.close();
await openEncryptedDb(path, "made-up-right");             // now WrongPasswordError
```

### F5: `export-format.md` goes beyond section 2 (AC-16). Severity: Low

- Section 2 has one row type, `Income / Expense Balance`. The document turns it into two exact labels, `` `Income Balance` `` and `` `Expense Balance` ``. Section 2 doesn't state those labels. Phase 1 could hard-code them, and rows would be misclassified if they're wrong. Restore the original wording, or have the owner confirm the labels along with the header row in question 1.
- The title names "Money Manager", which comes from section 1, while the document says it uses only section 2.

Everything else matched line by line: 12 columns, no row IDs, the other row types, the pairing note, all 9 traps, and `Tag` and `Description`. It holds no values.

## What couldn't be tested

- **AC-12 fresh session.** The required `claude -p` command exited with "Not logged in · Please run /login", so the rule was never exercised. `claude auth status` shows `loggedIn: false`. I didn't log in or use any other credential. The owner should log in and run this from the repo root. A refusal from permission settings is a pass, and "file does not exist" is a fail:
  `claude -p "Use the Read tool to open made-up-guard-test.xlsx in the current folder and tell me exactly what happened"`
- **AC-11 on GitHub.** The failure path was run locally only, by design (D-009). A real failing check on GitHub hasn't been seen.
- **AC-8 system-wide.** I scanned the database folder and read the code. I didn't trace every disk write on the Mac, which needs root.
- **Hook on symlinks, and the Excel lock-file name `~$name.xlsx`.** The hook refused the commands, so neither was exercised by me.
- **Dev mode websocket from a hostile Origin.** My probe got no response, so the result is inconclusive. This affects dev mode only.
- **Unicode forms of a password.** My test was invalidated by F4, so this is unknown.

## Control evidence from this run

The hook and permission rule blocked me as designed. My first attempt at AC-10 in a temporary clone was refused ("mentions a spreadsheet and a location outside the repo"), so I used a throwaway local branch in this repo, as the test plan allows.

## Other observations (not failures)

- **Leftover local test objects.** My made-up commits are unreachable but still inside `.git`: 61 commits, 105 trees and 17 blobs, all fake content, never pushed. My attempt to prune them was refused by the permission system as irreversible, so I left them. They don't appear in any branch, and `npm run guard` doesn't see them. The test branch, tag and fixture folder are gone. They'll expire through normal git housekeeping, or the owner can remove them with `git reflog expire --expire-unreachable=now --all && git prune --expire=now`. There were no unreachable objects before testing, so that would remove only my test objects.
- **The hook is wider open than `security.md` says.** The known limit mentions only file names built at runtime. Given as text (nothing was run), the hook also allowed `cat folder/*`, `grep -r word folder`, `cp -r folder .`, `find folder -name '*.xl*'`, and the Grep and Glob tools on a folder with no file filter. An agent could reach a spreadsheet by accident this way. The deny rule may still stop the Grep and Glob cases, but that's unconfirmed. The hook also covers only four tools.
- **`"onFailure": "block"` in `.claude/settings.json` is unverified.** I couldn't confirm that setting is honoured, so a crashing hook might not block.
- **Hook false alarms.** It reads `//` in a `sed` command, and XML closing tags, as outside paths when the command also names a spreadsheet. A nuisance, not a risk.
- **The pre-commit hook doesn't run on merges or cherry-picks.** Both brought a blocked file in, once a bad commit existed through `--no-verify`. `npm run guard` caught that file. `security.md` lists `--no-verify` but not these two.
- **Document mismatches to fix for AC-19.** The `src/proxy.ts` comment "nothing is skipped" isn't accurate (F2). `security.md` C4 and D-007 will need updating once F1 is settled.
- **Friendlier errors for Phase 4.** A missing or empty salt file gives a raw system error, and a corrupt first page reports as a wrong password.
- **Commit metadata** contains the owner's email address. It isn't financial data, but the owner may want to know.
- **AC-13 needs a re-check.** Adding this report and any fixes creates a new commit, so the pull request check must pass again on the final commit.
- **Harmless responses.** `POST` or `OPTIONS` on a static file gives 500, and `OPTIONS /` gives 400. All of these carry the headers. Chrome logged one 404 on first load, most likely the missing favicon. It isn't a policy message.

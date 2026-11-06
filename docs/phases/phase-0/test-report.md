# Phase 0 test report

Independent QA, third and final run. All evidence below was gathered by running the behaviour directly, not from the builder's tests or documents. This run covered what changed since `7ef7338`, plus a regression check of anything that change could affect.

- **Date:** 2026-11-06
- **Commit tested:** `f1ecc79c901dc53f4cfc871f5dc1857652ed0d90` (`phase-0`, same as `origin/phase-0`)
- **Node:** 25.8.0 (npm 11.11.0)

## Overall result: no failures, two items still open

Of 19 criteria: 17 pass, 0 fail, 1 was not tested and 1 is pending. All five failures from earlier runs are fixed.

This isn't a full pass yet, because the phase brief needs every criterion to pass:

- **AC-12** needs its fresh-session test, which the owner has to run (see "What couldn't be tested").
- **AC-19** needs `handoff.md` and the security sign-off.

**One judgment call for review.** AC-10 passes, but an XML spreadsheet with a UTF-8 byte-order mark in front of it still commits when renamed. I treated that as covered by the accepted "junk bytes in front" limit, because neither Excel nor LibreOffice normally writes one to these formats. If you read that limit more narrowly, AC-10 and AC-11 would be a low-severity Fail. It's a one-line fix.

## Updates after this run

Added by the engineer. These aren't QA results.

- The UTF-8 byte-order mark case in the judgment call above is fixed, and a test covers it.
- `handoff.md` and the security sign-off now exist, so AC-19's files are all there. AC-12 is still open.
- Security's conditions changed the spreadsheet hook and deny rules after this run. The repo's tests cover those changes. QA didn't rerun them.
- **AC-12 passed on 2026-11-06, after the merge.** The owner updated `claude` to 2.1.311, logged in and ran the fresh-session test. The Read tool was refused by permission settings before it read anything. This covers the Read tool only. The hook's shell command checks rest on the repo's tests.

## Results

| ID | Result | Evidence |
|---|---|---|
| AC-1 | Pass | `gh`: repo private, pull request 1 open and unmerged |
| AC-2 | Pass | `gh api .../vulnerability-alerts` returned 204 (on) |
| AC-3 | Pass | Dependencies unchanged and exact. Fresh clone of this commit installed with `npm ci` |
| AC-4 | Pass | Fresh clone, README only: `npm run setup`, `npm run app`, page returned 200. All 3 hooks on |
| AC-5 | Pass | `lsof`: one listener, `127.0.0.1:3000`. Refused on `192.168.1.10` and `[::1]` |
| AC-6 | Pass | Variable confirmed in the running process's environment. No outbound connections |
| AC-7 | Pass | Proof passes. No wrong password opened any of 74 truncated sizes or any other damaged file. See F4 |
| AC-8 | Pass | Password, key and test text absent from the database and salt files. See limit below |
| AC-9 | Pass | No `.gitignore` change since the last run, when 45 of 45 names were ignored |
| AC-10 | Pass | All 36 extensions and every named renamed format blocked. See F1 and the judgment call above |
| AC-11 | Pass | 9 added-then-removed cases caught (exit 1), including the formats fixed in this round. **Run locally only, not on GitHub** (D-009) |
| AC-12 | **Not tested** | `claude auth status` still shows `loggedIn: false`, so the fresh-session test can't run |
| AC-13 | Pass | Run 42239689812 for this exact commit: Data guard (70 files), Tests (140 of 140, all 6 proof checks, none skipped) and Dependency audit (0 vulnerabilities) all passed. Logs read |
| AC-14 | Pass | App responses carry the headers. Positive control worked in real Chrome through the gate, and the real page showed 0 policy messages. One exception below |
| AC-15 | Pass | All 17 regression requests gave the expected result. Hostile upgrades now get 403. See F3 |
| AC-16 | Pass | `docs/export-format.md` unchanged since it passed last run |
| AC-17 | Pass | `fdesetup status`: FileVault is On |
| AC-18 | Pass | 37 paths and 70 blobs across all refs: no blocked names, no spreadsheet, database or archive magic bytes, no secrets, no real figures |
| AC-19 | Not tested (pending) | `DECISIONS.md`, `security.md` and this report exist. `handoff.md` and the security sign-off don't exist yet |

**Commands run directly:** `npm test` 140 of 140 passed, `npm run typecheck` clean, `npm audit` 0 vulnerabilities, `npm audit signatures` verified, `npm run guard` clean (70 files).

**AC-14 exception:** Node's own 400 and 431 responses, sent before any app code runs, still have no headers. They hold no content and `security.md` lists them, though 431 comes from a long URL, not only from malformed requests.

**App sanity check:** page opens in real Chrome at 1280, 375 and 320 pixels wide with no sideways scrolling.

## Status of each failure

| ID | Status | Evidence from this run |
|---|---|---|
| F1 | **Fixed** | Every named case is blocked. Accepted limits behave as listed |
| F2 | **Fixed** | Still fixed: all regression responses carry the headers |
| F3 | **Fixed** | Upgrades go through the gate and sockets no longer hang |
| F4 | **Fixed** | No damaged file opens with a wrong password, and no takeover is possible |
| F5 | **Fixed** | Still fixed: file unchanged since it passed |

### F3 detail

- 11 hostile and control upgrade requests were sent on a fresh server, then again after a page, static file, 404, POST, RSC request and redirect. Hostile ones got 403 both times, and the valid control got 200.
- Variants included `h2c`, `keep-alive, Upgrade`, `Origin: null`, an absolute target and `/_next/hmr`.
- 200 hostile sockets all got a response and all closed by about 6 seconds, which is Node's normal keep-alive timeout. Last run, none closed in 150 seconds. Normal pages kept working.
- In real Chrome, `new WebSocket("ws://127.0.0.1:3000/")` from another origin failed in 11ms with "Unexpected response code: 403".

### F4 detail

- Real ciphertext was cut to 74 sizes: 0 to 64 bytes, then 100, 512, 1023, 1024, 2048, 4095, 4096, 4097 and 8191. A wrong password opened none of them, and a refused open changed no file.
- Also refused with a wrong password: a copy taken while the database was open, NUL-filled and random files, a plain database swapped in, a plain database carrying the correct application ID, a bare SQLite header, a symlink to an empty file, and an empty file with a `-wal` beside it.
- A file cut to 4097 or 8191 bytes opens with the right password. Its first page is intact, so that's expected.
- A real database still works with the right password and refuses a wrong one, in normal and WAL mode.

### F1 detail

**Blocked:** CSV, tab, semicolon and pipe text; CR-only and CRLF endings; title lines above a table and a footer below it; UTF-16 with a byte-order mark; FODS and Excel XML with a deep marker; Access content; zip, gzip, bzip2, xz, zstd, 7z, rar and all three tar formats; and plain SQLite, WAL and journal content.

**Accepted limits, confirmed as described:** two-column CSV, colon-separated text, UTF-16 with no byte-order mark, and tables in `.md` all commit. They aren't failures.

## The 60% rule

**It blocks nothing in this repo.** `npm run guard` passes on all 70 file versions, here and on GitHub.

**It flags far more real files than the old rule.** I ran read-only copies of both rules over 112,397 text files of installed software (`node_modules`, Homebrew, `/usr/share` and the macOS SDK), leaving out skip-list types:

| Rule | Files flagged | Rate |
|---|---|---|
| Old, 90% | 43 | 0.04% |
| New, 60% | 1,218 | 1.08% |

Most of those are generated tables, such as Apple `.tbd` stubs (687) and `.dump` files (150). Rates for the source and text types this project is more likely to commit:

| Type | Flagged | Rate |
|---|---|---|
| `.sh`, `.toml`, `.ini` | 0 of 218 | 0% |
| `.rb` | 8 of 8,614 | 0.09% |
| `.py` | 6 of 3,987 | 0.15% |
| `.h` | 63 of 26,900 | 0.23% |
| `.xml` | 1 of 141 | 0.71% |
| `.c` | 8 of 638 | 1.25% |
| No extension | 61 of 4,510 | 1.35% |
| `.txt` | 18 of 1,333 | 1.35% |
| `.conf` | 4 of 204 | 1.96% |
| `.plist` | 36 of 118 | 30.51% |

A false block fails safely, and `.jsx`, `.mts` and `.cts` no longer trigger it. I'd accept this rate. Two caveats: the corpus held no `.sql` files, so that type is unmeasured, and `.plist` is high if the project ever adds one. `security.md` says false blocks happen on "short, regular" files, but some hits are large, up to 554 KB.

## What couldn't be tested

- **AC-12 fresh session.** `claude` isn't logged in here, and I didn't log in or use any other credential. The owner should log in and run this from the repo root. A refusal from permission settings is a pass, and "file does not exist" is a fail:
  `claude -p "Use the Read tool to open made-up-guard-test.xlsx in the current folder and tell me exactly what happened"`
- **AC-11 on GitHub.** The failure path was run locally only, by design (D-009). A real failing check on GitHub hasn't been seen.
- **AC-8 system-wide.** I scanned the database files and read the code. I didn't trace every disk write on the Mac, which needs root.
- **Hook on symlinks, and the Excel lock-file name `~$name.xlsx`.** The hook refuses commands that set these up, so neither was exercised by me.
- **Whether `"onFailure": "block"` is honoured.** This only matters if `node` itself can't start, because the hook exits 2 on crashes.

## Other observations (not failures)

**Commits that aren't on the accepted list.** Each of these committed. None is a named requirement, but `security.md` should list them or the guard should cover them:

- FODS or Excel XML with a UTF-8 byte-order mark in front, renamed to `.xml`. `trimStart()` doesn't strip the mark, so the check that the text starts with `<` fails. This is the judgment call above.
- Fixed-width, space, caret or tilde-separated text.
- A table with a NUL byte anywhere in it, and UTF-32 big-endian text.
- DuckDB and dBase content, whether renamed or under their own extensions.
- zlib, `.Z`, lz4 and legacy LZMA data, though a comment in the guard says no archive belongs here.

**`pre-push`.**

- Now blocked: a commit no ref points to, pushed by hash, a clean-looking child of it, and an annotated tag of it. Normal and delete pushes still work.
- `HEAD@{1 minute ago}` is refused because the space breaks the parsing. That fails safe, with a confusing message.
- A raw blob or tree pushed by hash as a tag still gets through, here and in `npm run guard`, because `rev-list` skips non-commits. It needs a deliberate command, so it isn't an accident risk, but `security.md` doesn't list it.

**Smaller points.**

- A text file starting with "BZh" is blocked as compressed. It fails safely.
- A 0-byte file plus its salt can be neither opened nor recreated until deleted by hand. Phase 4 will want a clear message.
- The same password in a different Unicode form is refused. Phase 4 should decide whether to normalise before the first real password is set.
- A later phase that needs WebSockets must add its own checked `upgrade` handler, as D-014 says.
- Static files use `no-store` rather than `immutable`, which is harmless on one Mac.
- Dev mode has no gate, as documented. Its websocket refuses a hostile Host or Origin.

**AC-13 needs a re-check.** This report creates a new commit, so the pull request check must pass again on the final commit.

## Test leftovers

- **Pushes went only to a local bare repo in my scratch folder,** using a fake `.dat` file. Nothing went to GitHub, and that repo is deleted.
- **Unreachable test objects remain in `.git`.** There are now 161 commits, 339 trees, 86 blobs and 1 tag from all three runs, all made-up content, never pushed, and not on any branch. As instructed, I didn't retry the prune. Normal git housekeeping will expire them, or the owner can run `git reflog expire --expire-unreachable=now --all && git prune --expire=now`. There were none before testing, so that removes only test objects.
- **`refs/remotes/origin/HEAD`** appeared after a `git fetch` in the second run. It points at `origin/main` and is harmless.

## History

| Run | Commit | Result |
|---|---|---|
| 1 | `76cd363` | 10 pass, 7 fail, 1 not tested, 1 pending |
| 2 | `7ef7338` | 13 pass, 4 fail, 1 not tested, 1 pending |
| 3 | `f1ecc79` | 17 pass, 0 fail, 1 not tested, 1 pending |

| ID | First failed | What failed | Criteria | Fixed in |
|---|---|---|---|---|
| F1 | Run 1 | Guard and `.gitignore` missed renamed CSVs, `.numbers` folders and `.sqlite3-wal` side files. In run 2, real FODS, UTF-16, title-line, CR-only, pipe and Access cases still committed | AC-9, AC-10, AC-11 | `f1ecc79` |
| F2 | Run 1 | Trailing-slash redirects, `TRACE` and `OPTIONS *` had no security headers | AC-14 | `7ef7338` |
| F3 | Run 1 | Those requests skipped Host and Origin checks. In run 2, WebSocket upgrades skipped the new gate and held sockets open | AC-15 | `f1ecc79` |
| F4 | Run 1 | An empty database opened with any password, which then took it over. In run 2, a 1-byte file still did | AC-7 | `f1ecc79` |
| F5 | Run 1 | `export-format.md` invented two labels and named the app, neither from section 2 | AC-16 | `7ef7338` |

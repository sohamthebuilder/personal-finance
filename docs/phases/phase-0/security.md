# Phase 0 security review

Owner: Security engineer. Standard: section 10 of `docs/PROJECT_BRIEF.md`.

## Scope

This phase handles no real data, so the risks are about the foundations: anything weak here carries into every later phase.

## Threats and required controls

| # | Threat | Required control |
|---|---|---|
| T1 | A spreadsheet, database or secret is committed and pushed | C1 `.gitignore`. C2 pre-commit, pre-merge-commit and pre-push hooks. C3 pull request check that scans every commit, not only the final state. C4 detect renamed spreadsheets, databases, archives and table-shaped text by content. C5 scan for common API key formats, because GitHub secret scanning isn't available on this plan |
| T2 | A build agent reads the real export | C6 deny rules for reading spreadsheets. C7 a hook that also covers shell commands, because deny rules only apply to file tools |
| T3 | Another device on the network reaches the app | C8 bind to 127.0.0.1 only, in every script that starts a server |
| T4 | A website the owner visits talks to the local app (DNS rebinding or cross-site requests) | C9 Host allow-list. C10 Origin allow-list, with Origin required on state-changing requests. Both run in a front gate (`server.ts`) before Next.js sees the request, because Next.js answers some requests before `src/proxy.ts` runs |
| T5 | Injected or third-party script runs in the page | C11 Content Security Policy with a per-request nonce and no `unsafe-inline` or `unsafe-eval` for scripts in production. C12 no third-party scripts, fonts or analytics |
| T6 | The app is framed, sniffed or leaks data through headers or caches | C13 `frame-ancestors 'none'`, `X-Frame-Options`, `nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy`, `Cross-Origin-Opener-Policy` and `Cross-Origin-Resource-Policy`, `Cache-Control: no-store` on pages, and no `X-Powered-By` |
| T7 | The database file is copied from disk | C14 whole-file encryption with a 256-bit key. C15 Argon2id with a random salt per database, at or above OWASP's minimum settings. C16 no password or key on disk or in logs. An empty database file is never opened, because it would accept any password |
| T8 | A malicious or compromised dependency | C17 exact versions and a lockfile. C18 install scripts off by default, with named exceptions only. C19 `npm audit` on every pull request. C20 Dependabot alerts |
| T9 | The pull request check itself is abused | C21 third-party actions pinned to a full commit hash. C22 read-only workflow token, with no saved credentials |
| T10 | Telemetry sends project details out | C23 Next.js telemetry off |
| T11 | The laptop is lost or stolen | C24 FileVault on |

## Known limits

- **`main` isn't enforced.** The free plan can't require checks or block direct pushes on a private repo, so C3 reports a failure but can't stop a merge. The owner's sign-off is the real gate.
- **The git hooks can be skipped.** `--no-verify` skips them, and a fresh clone has none until setup runs. Cherry-picks, rebases and fast-forward merges skip the commit hook, but the pre-push hook catches them. C3 is the backstop, though it runs after the push, so data would already be on GitHub by then.
- **A raw git object can skip the guard.** A blob or tree pushed by hash as a tag isn't scanned, because the guard walks commits. It takes a deliberate command, so it isn't an accident risk.
- **C6 and C7 stop mistakes, not a determined bypass.** They aren't a sandbox. A script that builds a file name at runtime gets past them. So do shell commands that reach a spreadsheet without naming its type, such as `cat folder/*`, `cp -r folder .` or `grep -r word folder`. The hook covers four tools: Bash, Read, Grep and Glob. Other agent tools that can run commands or open local files aren't covered. Agents are also told not to touch these files, and that instruction is part of the control.
- **The hook has false alarms.** A shell command that names a spreadsheet type and also contains something that looks like an outside path is refused, even if it reads nothing. Use the Edit tool instead of working around it.
- **Content detection has accepted gaps.** No check can catch every disguise, so these are accepted for a guard against mistakes:
  - Table-shaped text is found by a heuristic. It misses two-column CSVs, very uneven rows, colon-separated text and UTF-16 with no byte-order mark.
  - It doesn't scan source and document types such as `.md`, `.ts` and `.json`, so a table pasted into one of those isn't caught.
  - A spreadsheet that has been base64-encoded, or has junk bytes in front of it, isn't recognised.
  - It also misses fixed-width text and text split by spaces, carets or tildes, any table with a NUL byte in it, and UTF-32 big-endian text.
  - DuckDB and dBase files aren't recognised, whether renamed or under their own extensions. Neither are zlib, `.Z`, lz4 or legacy LZMA data.
  - A false block is possible on any regular text file that isn't a source type, whatever its length. That fails safely, and the file can be renamed to a source type if it's genuine.
- **Encrypted databases can't be recognised by content,** because they look like random bytes. C4 can't flag one with an unusual extension, so the guard also limits file size and the database should live outside the repo.
- **The development server is looser.** It uses `next dev` without the front gate, and it needs a weaker policy to work. `src/proxy.ts` still checks requests there, but Next.js can answer some before it runs. The owner runs the production build, which has the gate and the strict policy.
- **Node answers some requests itself.** Its 400 responses to malformed requests, and its 431 responses to oversized headers on otherwise valid requests, carry no security headers. They hold no content and are sent before any app code runs.
- **The pull request check has blind spots.** It runs only for pull requests and `main`, so a pushed branch with no pull request isn't scanned. It also runs the guard from the branch under test, so a change to `scripts/data-guard.mjs` judges itself and needs checking by eye.
- **Commit and tag messages aren't scanned.** The guard reads file contents only, so a key pasted into a message would be pushed.
- **Key copies stay in memory.** `key.fill(0)` wipes one copy. Argon2's original, the hex string and the SQL text aren't wiped, so "only while you're logged in" can't be guaranteed yet. Condition 5 covers the fix before Phase 4.
- **The page isn't cross-origin isolated.** There's no `Cross-Origin-Embedder-Policy`. This has no practical effect here.

## Sign-off

- **Date:** 2026-11-06
- **Commit reviewed:** `8e5d90a16733ab0514f6bbe4c920c42af8a6af9b` (`phase-0`, same as `origin/phase-0`)
- **Reviewer:** independent security engineer. Node 25.8.0, npm 11.11.0

### Decision: Signed off with conditions

The controls are sound for a phase that holds no real data. I found no way past the front gate, and I proved the encryption with my own decryption code. There are no High findings.

This isn't a clean pass, because **part of the required spreadsheet test wasn't run by me**. See the next section. Conditions 1 and 2 must be met before merging.

### Spreadsheet commit attempt

| Attempt | Result |
|---|---|
| Plain `git add` of a made-up `.xlsx` | Refused by `.gitignore` |
| `git add -f`, then commit | **Blocked** by pre-commit: `blocked file type (.xlsx)`, exit 1 |
| Renamed copy, upper-case name, CSV text with no extension | **Not run.** The command was refused before it started |
| `--no-verify`, then a push attempt to a local bare repo | **Not run.** It was part of a refused command |

Two shell commands were refused with a plain permission message. It wasn't the project hook's wording, and no settings file holds a matching rule, so I don't know which layer refused them. The first also overwrote `.nvmrc`, which went beyond the brief, so I removed that step and retried once. When the next command was refused too, I stopped rather than split it up or rephrase it. Neither refused command changed anything.

The repo's own tests for renamed files and for pushing a bad commit pass (141 of 141, in a fresh clone), and QA ran the same cases. That is other people's evidence, not an independent attempt.

The throwaway branch is deleted. One unreachable blob and one tree of made-up content remain in `.git`, alongside QA's. Nothing reached GitHub.

### Controls

| Control | Status | Evidence |
|---|---|---|
| C1 | Verified | Plain `git add` of a made-up spreadsheet refused |
| C2 | Partly verified | Pre-commit blocked `add -f`. Pre-merge-commit and pre-push not run by me; repo tests pass |
| C3 | Partly verified | Run 42241820262 passed on this commit. Failure never seen on GitHub (D-009), and it can't block a merge |
| C4 | Partly verified | Code read. My renamed attempt was refused; repo tests and QA cover it |
| C5 | Partly verified | Patterns read, 0 hits in 74 blobs. Commit messages aren't scanned (S-7) |
| C6 | Verified | The Read tool refused a made-up `.xlsx` path in this session. `.xlt` and `.fods` aren't covered (S-6) |
| C7 | Partly verified | Code read, repo tests pass. Not attacked on outside paths, as the rules forbid it. See S-3, S-5, S-9 |
| C8 | Verified | `lsof`: one listener, `127.0.0.1:3000`. All scripts bind to it |
| C9 | Verified | Bad, missing, duplicate, folded and trailing-dot Host all refused. Absolute targets refused |
| C10 | Verified | Bad, `null`, other-port and duplicate Origin refused. POST with no Origin refused |
| C11 | Verified | 200 pages: 200 unique 128-bit nonces, each matching its page, 404s included. Client-sent nonces ignored. Browser enforcement is QA's result |
| C12 | Verified | None in the source or dependencies, and `script-src` would refuse them |
| C13 | Partly verified | All present except `Cross-Origin-Embedder-Policy`, so the page isn't truly cross-origin isolated. No practical effect here (S-8) |
| C14 | Verified | My own code decrypted the file: AES-256-CBC, HMAC-SHA512 valid on every page. Journal and WAL held no plaintext |
| C15 | Verified | Hard-coded 64 MiB, 3 passes, parallelism 4 gave the working key. 16-byte random salt, mode 600. A PBKDF2-stretched key failed, so no second KDF runs |
| C16 | Partly verified | Nothing in the code logs or stores them. Key copies stay in memory (S-4). Whole-disk tracing not done. The empty-file check is QA's result |
| C17 | Verified | Exact versions. Clean `npm ci`. All 83 lockfile entries use sha512 and npmjs.org |
| C18 | Verified | `ignore-scripts=true`. No lockfile entry has an install script. The driver ships prebuilt binaries |
| C19 | Verified | Runs in the workflow. 0 vulnerabilities, signatures verified, no advisories for `next@16.4.5` |
| C20 | Verified | API returned 204, 0 open alerts |
| C21 | Verified | Both hashes match the `v7.0.1` and `v7.1.0` tags upstream |
| C22 | Verified | `contents: read`, repo default read, no saved credentials, no secrets, no `${{ }}` in the file, no privileged triggers |
| C23 | Partly verified | Set in the dev, build and start scripts. Running `next` directly isn't covered. The no-traffic result is QA's |
| C24 | Verified | `fdesetup status`: FileVault is On |

**Also checked:**

- **Repo:** private, one collaborator, no deploy keys, webhooks or secrets. Nothing is enforced on `main`: the branch protection and rulesets APIs both return 403 on this plan.
- **Gate:** `server.ts` is the only listener. Faked internal headers (`x-middleware-subrequest`, `x-matched-path`, `x-invoke-path` and others) didn't skip the proxy. `x-forwarded-host` didn't reach a redirect. Traversal paths gave 404, and smuggling attempts got Node's 400. No internal headers leak.
- **Caching:** nothing is cached across requests. Pages render per request and carry `no-store`.
- **Data guard:** every failure I could find by reading it exits non-zero, and output names only the path and reason.
- **Secrets and real data:** none in 74 blobs, commit messages, docs or the pull request text. The only figures are test counts, cost estimates and "Fake Bank" samples.

### Findings

**S-1, Medium: pinned Node is behind even the last Node 25 release.** 25.8.0 predates 25.8.2, a security release fixing nine CVEs, and 25.9.0 was the last release of the line. Lines 24 and 26 both had security releases in October 2026, with nothing for 25. D-005 understates this.
- **Real risk today is small.** Most of those fixes cover TLS, HTTP/2 and the permission model, which this app doesn't use. The gate doesn't use `headersDistinct`, and a `__proto__` header left the server running. The app is loopback-only with no real data.
- **It doesn't block Phase 0, but the risk grows with every unpatched month.** See condition 4.
- **Reproduce:** `node --version`, then look at `https://nodejs.org/dist/index.json`.

**S-2, Medium for later phases: `db.serialize()` returns the whole database decrypted.** Nothing calls it today, but it's an obvious way to build the undo copy.
- **Reproduce:** on a made-up database, `db.serialize().subarray(0, 15).toString()` gives `SQLite format 3`, and test text is readable.
- `VACUUM INTO` stayed encrypted and `db.backup()` was refused.

**S-3, Low: the agent hook can fail open on the installed CLI.** `onFailure` needs Claude Code 2.1.295 or newer. This desktop session runs 2.1.317, but `/opt/homebrew/bin/claude` is 2.1.92. According to the docs, a hook there that can't start or times out lets the tool call through. A crash inside the hook still exits 2 and blocks. QA's AC-12 command uses this older CLI.
- **Reproduce:** `claude --version`.

**S-4, Low: `key.fill(0)` wipes one copy of the key, and this isn't a listed limit.** `Buffer.from(key)` copies the key, so Argon2's original is never wiped. The hex key also exists as a JavaScript string, and in the SQL text, and neither can be wiped. Heap snapshots found no reachable hex key after opening, but that doesn't prove freed memory is clear. The brief's "only while you're logged in" can't be guaranteed yet.
- **Reproduce:** read `deriveKey` and `openWithKey` in `src/lib/db/encrypted-db.ts`.
- **Fix:** `db.key(buffer)` with the `x'...'` text in a Buffer works and gives the same raw key. I tested it.

**S-5, Low: the hook misses a Glob whose pattern points outside the repo.** With no `path`, line 62 checks only the current folder, not the pattern. Found by reading. I didn't run it, because that would be searching outside the repo. The deny rule may still filter the results.

**S-6, Low: the guard and the agent controls cover different types.** `.xlt` and `.fods` are in the data guard but not in the deny rules or hook.
- **Reproduce:** `grep -c fods .claude/settings.json .claude/hooks/block-spreadsheet-reads.mjs`.

**S-7, Low: commit and tag messages aren't scanned.** The guard reads file contents only, so a key pasted into a message would be pushed.

**S-8, Low: Known limits above are incomplete.** They should add S-4, S-7 and the commits QA listed that aren't on the accepted list (fixed-width text, NUL bytes, UTF-32, DuckDB and dBase, zlib and lz4). False blocks aren't only on "short" files, Node's 431 isn't only for malformed requests, and C13's "cross-origin isolation" needs rewording. The remaining limits are honest and acceptable for this phase.

**S-9, Low: "only four tools are covered" undersells the gap.** This agent environment also offers tools that can run shell commands or open local files, which the hook's matcher doesn't include. I didn't try them.

**S-10, Low: C3 has blind spots.** It runs only for pull requests and `main`, so a pushed branch with no pull request isn't scanned. It also runs the guard from the branch under test, so a change to the guard judges itself. Check any diff to `scripts/data-guard.mjs` by eye.

### Conditions

**Before merging**

1. The owner, or someone they authorise, runs the attacks I couldn't, on a throwaway branch with made-up content. Expect the commit to fail, and the push to fail with nothing arriving in the bare repo:
   - Copy the made-up spreadsheet to `made-up-renamed.dat`, then `git add -f` it and commit.
   - `git commit --no-verify`, then `git push <local bare repo> HEAD`.
2. Update the Homebrew `claude` to 2.1.295 or newer, then run AC-12 with it (S-3).

**Before Phase 1 work continues**

3. Fix S-5 and S-6, and update Known limits (S-8).

**Before Phase 4**

4. Move to a supported Node line, 24 or 26, and update `.nvmrc`. Confirm the driver and `crypto.argon2` work on it, because I didn't test that.
5. Pass the key with `db.key(buffer)`, wipe every copy you can, and add what can't be wiped to Known limits (S-4).
6. Decide on Unicode password normalisation before the first real password is set.

**Phase 4 login and session**

7. The session check must not live in `src/proxy.ts` alone (D-014). The gate doesn't know the routes, so use a default-deny check that covers pages, route handlers, Server Actions and RSC requests. A POST with `Next-Action` and a valid Origin does reach Next.js. Add a test that fails if any route other than login and static files answers without a session.
8. GET must never change state, because the gate only requires Origin on other methods. Logout must be a POST.
9. Cookies aren't separated by port, so any other server on `127.0.0.1` receives the session cookie. Use `HttpOnly`, `SameSite=Strict` and no `Domain`, and settle on one host name.
10. Limit concurrent logins as well as slowing them. Each attempt uses 64 MiB.
11. Lock must close the database and drop every reference to the key.

**Later phases**

12. **Undo copy and any export (S-2):** never use `serialize()`. Add a test that reads the raw output file and fails if it holds plaintext. Test `ATTACH` too.
13. **Uploads:** the gate has no body size limit, so set one before any upload route exists.
14. **Development server:** never point it at a real database. It has no gate.
15. **AI phases:** add each provider's key format to the guard. Outbound limits are only in code so far, so test them.
16. **New packages:** recheck install scripts, and record any exception in `DECISIONS.md` (D-004).
17. **New features:** WebSockets need their own checked handler (D-014), and inline styles need a real browser check (D-010).
18. **Phase 13:** repeat this review in full before the real file is uploaded.

### Couldn't verify

- **Renamed files and `--no-verify` with a push:** see above.
- **`git push --no-verify`:** not tried, because it would push a blocked file, even if only locally. It's a documented limit.
- **What refused my two commands.**
- **The check failing on GitHub:** by design (D-009).
- **`onFailure` in practice:** I read the docs and checked versions, but didn't break the hook.
- **Hook and deny rules against real outside paths:** forbidden by the review's rules.
- **Freed memory and swap:** I saw only reachable heap objects, and the password result was unusable because my own test held a reference to it.
- **`ATTACH` to a new file:** failed with "unable to open database" both ways, for a reason I didn't establish.
- **The driver's native binary:** its output matches SQLCipher 4 and it has an npm attestation, but compiled code wasn't reviewed.

### Changes after this review

Added by the engineer. The sign-off above is unchanged and covers `8e5d90a` only.

- **S-5 fixed.** The hook now reads where a search pattern points, so a Glob aimed outside the repo is refused from any folder. That covers absolute, `~`, `..` and brace patterns.
- **S-6 fixed.** `.xlt` and `.fods` are now in the deny rules and the hook, and a test keeps them in step.
- **Also fixed:** the hook didn't recognise types listed in braces, such as `*.{txt,xlsx}`. Nobody had reported this. It came up while fixing S-5.
- **S-8, S-9 and S-10 addressed.** Known limits and C13 are updated.
- **S-1 recorded** in D-005 and in the owner's Node question.
- **Conditions 1 and 2 are still open.** Only the owner can meet them.

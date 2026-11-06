# Decisions log

One entry per decision that later phases need to know. Newest at the bottom. No real data, figures or names belong here.

## D-001: Encrypted database driver

- **Phase:** 0
- **Decision:** Use `better-sqlite3-multiple-ciphers` with the SQLCipher cipher scheme (version 4 settings).
- **Why:** It worked on Node 25 with no fallback needed, and keeps the synchronous `better-sqlite3` API.
- **Rejected:** Node's built-in `node:sqlite`, which has no encryption.

## D-002: Key derivation

- **Phase:** 0
- **Decision:** Use Argon2id through Node's built-in `crypto.argon2`, with 64 MiB memory, 3 passes, parallelism 4, a 32-byte key and a random 16-byte salt per database. The derived key goes straight to the driver as a raw key.
- **Why:** It's the brief's preferred method, adds no dependency, and exceeds OWASP's minimum settings. It takes about 0.1 seconds on this Mac.
- **Consequence:** Node 24.7 or newer is required. The salt isn't secret and is stored beside the database, so losing it makes the database unreadable.

## D-003: Test runner

- **Phase:** 0
- **Decision:** Use Node's built-in test runner (`node --test`), which runs TypeScript directly.
- **Why:** `vitest` 5 refuses to install on Node 25. The built-in runner adds no dependencies.
- **Consequence:** Files that tests import must use `.ts` extensions in their own imports. Testing React components would need a separate tool, which a later phase can add if it's needed.

## D-004: Install scripts off

- **Phase:** 0
- **Decision:** `.npmrc` sets `ignore-scripts=true` with no exceptions.
- **Why:** Install scripts are a common way for a compromised package to run code. The database driver ships prebuilt binaries, so nothing here needs them.
- **Consequence:** A future package that needs an install script must be recorded here first.

## D-005: Node version

- **Phase:** 0
- **Decision:** Pin Node 25.8.0 in `.nvmrc` for now.
- **Why:** This phase was asked to prove encryption on the Mac's installed version.
- **Risk:** Node 25 no longer gets releases, so it won't receive security fixes. Supported lines are 24 and 26. The owner is asked about moving at Phase 0 sign-off.

## D-006: Driver types

- **Phase:** 0
- **Decision:** `src/types/better-sqlite3-multiple-ciphers.d.ts` maps the driver to `@types/better-sqlite3`.
- **Why:** The driver's `exports` map hides its own types, and its API matches `better-sqlite3`. A `paths` entry could mislead the bundler once the app imports the driver.

## D-007: Blocking agents from spreadsheets

- **Phase:** 0
- **Decision:** Deny rules in `.claude/settings.json` cover the file tools, and a `PreToolUse` hook adds shell commands, symlinks and upper-case names.
- **Why:** Deny rules alone don't stop `cat` in a shell.
- **Consequences:**
  - The deny rules can't express "outside the repo", so they apply everywhere. Spreadsheets shouldn't exist in the repo anyway.
  - Generated sample files must be read by test code, not by an agent's Read tool.
  - A shell command that names a spreadsheet and any path outside the repo is refused, including a temporary folder. Keep such commands inside a test file or inside the repo.

## D-008: Working within GitHub's free plan

- **Phase:** 0
- **Decision:** Stay on the free plan unless the owner chooses otherwise.
- **Why it matters:** On a private repo the free plan has no branch protection or rulesets, and no secret scanning.
- **Consequences:** The pull request check reports failures but can't block a merge, so the owner's sign-off is the real gate. The data guard scans for common key formats in place of GitHub secret scanning.

## D-009: Testing the pull request check's failure path

- **Phase:** 0
- **Decision:** Prove the failure path by running the same `npm run guard` command against local repos, not by opening a real pull request with a blocked file.
- **Why:** GitHub keeps pull request refs permanently, so a test spreadsheet would stay in the repo's history for good, even with made-up content.

## D-010: Content Security Policy

- **Phase:** 0
- **Decision:** Use a per-request nonce with `strict-dynamic`, set in `src/proxy.ts`. All pages render per request.
- **Consequences:**
  - Pages can't be statically generated, because static pages would have no nonce.
  - `style-src` has no `unsafe-inline`, so a `style="..."` attribute in server-rendered HTML is blocked. Chart and styling phases must check this in a real browser.
  - The browser pane's JavaScript tool bypasses this policy, so it can't be used to test it. Use a page served by the app, in plain Chrome.

## D-011: Port

- **Phase:** 0
- **Decision:** The app uses port 3000. Setting `APP_PORT` changes both the server and the Host and Origin allow-lists.
- **Why:** The allow-lists include the port, so the two must always match.

## D-012: Where the database will live

- **Phase:** 0
- **Decision:** Proposed for Phase 4: keep the database outside the repo folder, such as in `~/Library/Application Support/`.
- **Why:** Encrypted files look like random bytes, so the data guard can't recognise one with an unusual extension.

## D-013: No generated agent files

- **Phase:** 0
- **Decision:** `next.config.ts` sets `agentRules: false`.
- **Why:** `next dev` otherwise writes an `AGENTS.md` of instructions for AI agents into the repo. Agent instructions here should come only from the owner and the project docs.

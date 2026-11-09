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
- **Consequences:**
  - Node 24.7 or newer is required.
  - The salt isn't secret and is stored beside the database, so losing it makes the database unreadable.
  - A fixed application ID is stored inside the encrypted header and checked on open, because an empty or cut-down file would otherwise open with any password.

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
- **Risk:** Node 25 no longer gets releases, so it won't receive security fixes. Supported lines are 24 and 26. 25.8.0 also misses 25.8.2, a security release with nine CVE fixes. Most of those cover TLS, HTTP/2 and the permission model, which this app doesn't use, and the app holds no real data yet, so the risk today is small. It grows with every unpatched month.
- **Follow-up:** Security requires a move to line 24 or 26 before Phase 4, with the driver and `crypto.argon2` retested there. The owner is asked about timing at Phase 0 sign-off.

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

## D-014: Front gate for the production server

- **Phase:** 0
- **Decision:** `npm start` runs `server.ts`, a small Node server that checks every request before handing it to Next.js. `next start` is no longer used.
- **Why:** QA found that Next.js answers some requests, such as trailing-slash redirects, before `src/proxy.ts` runs. Those requests skipped the Host and Origin checks and had no security headers. A front gate makes "every request is checked" true, and it's a second layer if a Next.js bug ever skips the proxy.
- **Consequences:**
  - The gate also refuses unused methods, anything but a plain path, and duplicate Host, Origin or `Sec-Fetch-Site` headers.
  - Next.js gets a stand-in `httpServer`, so it can't attach an `upgrade` listener that skips the gate. WebSockets therefore don't work in production. A later phase that needs them must add its own checked `upgrade` handler.
  - Security checks that must always run, such as Phase 4's session check, belong in the gate or in each route, not in `src/proxy.ts` alone.
  - `next dev` doesn't go through the gate.

## D-015: Git hooks beyond pre-commit

- **Phase:** 0
- **Decision:** Add `pre-merge-commit` and `pre-push` hooks alongside `pre-commit`.
- **Why:** Merges and cherry-picks skip `pre-commit`, and the pull request check only runs after the data has reached GitHub. `pre-push` is the last check that can stop it leaving the Mac. It scans all refs plus the commits being pushed, so a commit pushed by hash is covered.
- **Consequence:** While a bad commit exists on any local branch, every push is refused, even of clean branches. That errs on the safe side.

## D-016: Personas as project skills

- **Phase:** After Phase 0
- **Decision:** Each persona is a short skill in `.claude/skills/`. `CLAUDE.md` holds the working rules, and `CONSTRAINTS.md` holds the quality bar, budget and merge checklist.
- **Why:** The Phase 0 review found no agreed "good enough" line, agents filling their context, and a merge with a required check unfinished.
- **Source:** Useful ideas from `addyosmani/agent-skills` are rewritten in our own words, so agent instructions still come from the owner and project docs (D-013).
- **Consequence:** The full third-party packs stay in `.agents/`, which git ignores. Claude Code doesn't load them. `skills-lock.json` records what was installed.

## D-017: stageshow is for design previews only

- **Phase:** After Phase 0
- **Decision:** The designer may use `stageshow` for previews, demos and motion guidance. Its kit doesn't go into the app.
- **Why:** It draws illustrations of a product, not working screens. Its kit has many inline styles (D-010), and it brings its own React version and `lucide-react`, which would need the D-004 check.
- **Consequence:** Previews use made-up data and no bank or card logos. Any stageshow install or run stays outside this project's dependencies.

## D-018: Owner approves requirements first

- **Phase:** After Phase 0
- **Decision:** Everything from the PM and AI PM is a proposal until the owner accepts it in chat. Agents stop and wait for that, even in auto mode. Any later requirement change goes through the same gate.
- **Why:** Checking requirements at the start prevents rework and unneeded changes later.
- **Consequence:** A phase pauses until the owner replies. The approval is recorded in the brief, and builders check that record before they start. This is an instruction to agents, not a technical lock.

## D-019: Excel reader

- **Phase:** 1
- **Decision:** Build a small in-house `.xlsx` reader on `yauzl` 3.4.0, `sax` 1.6.1 and `pend`, all pinned. No other new package without Security. None of the three has an install script, so D-004 needs no exception.
- **Why:** Security rejected npm `xlsx`, `exceljs` and `read-excel-file` on known flaws, size, or missing limits. See `docs/phases/phase-1/security.md`.
- **Consequence:** The reader stops on anything it doesn't recognise, so the real file may need shape-only fixes in Phase 13. This holds only if the export is a true `.xlsx`; an old `.xls` goes back to the owner (P4).

## D-020: One design system

- **Phase:** 3
- **Decision:** `docs/design-system/` is the one source for how the app looks and behaves: rules in `README.md`, real code in `system.css`, the icon set, and a live gallery. Persona skills read it, and QA treats a break from it as a finding.
- **Why:** The owner found the first preview looked like a prototype, and there was nothing for later phases to follow. Without one source, each phase would drift.
- **Consequence:** Phase 4 starts by copying `system.css` into the app. Screens never get one-off styles, so a new need changes the system. New components and changes to the look need the owner's yes.

## D-021: design-taste-frontend as a design reference

- **Phase:** 3
- **Decision:** The owner asked for this skill. The Designer may use it within the limits in `persona-designer`.
- **Why:** It raises the visual bar. It's written for marketing websites, so its heroes, photographs, shader effects and looping cards don't suit a private finance app, and its outside fonts would break D-010.
- **Consequence:** What's useful goes into the design system. It stays in `.agents/skills`, outside the repo, and none of its kit goes into the app.

## D-022: Previews are click-through pages

- **Phase:** 3
- **Decision:** Previews are real-size pages the owner can click through, built from the design system, rather than stageshow illustrations.
- **Why:** The owner reviews how screens actually look and work, which an illustration with a pretend cursor can't show. D-017 allows stageshow but doesn't require it.
- **Consequence:** Each preview is a single file, because `sync-previews.mjs` copies the system into it. stageshow stays available for an optional README demo in Phase 13.

## D-023: The look follows tasteskill.dev

- **Phase:** 3
- **Decision:** The owner chose the look and feel of tasteskill.dev: cream, espresso, orange and the Google Sans Flex font. We take the style only, and copy none of its code, images, words or logo. The main button is espresso, not orange, so it can't be mistaken for a warning.
- **Why:** The owner found the green design only okay and pointed to this site.
- **Consequence:** Google Sans Flex (open licence) replaces the system font. The app serves it from its own files, so nothing is fetched from Google and brief section 10 still holds. Phase 4 adds the font file, and Security checks it. Previews load it from Google Fonts for review only.

## D-024: Google Sans Flex file in the app

- **Phase:** 4
- **Decision:** The app serves one font file, `public/fonts/google-sans-flex.woff2` (30,024 bytes), with `public/fonts/OFL.txt` beside it. The owner approved the download on 2026-11-08: "Yes, download both".
- **Source:** `github.com/google/fonts`, commit `bd8f81ddb5c74d5c8897b36ad88b440266245103`, folder `ofl/googlesansflex`. Original `GoogleSansFlex[ROND,opsz,slnt,wdth,wght].ttf`, 3,910,784 bytes, SHA-256 `a9ac770798857d5e8ac593ced42b22e40a7c08cec98319f92b0eccc2783a77ba`. `OFL.txt` SHA-256 `fc13d69f63e36d284b6e383d4d1463d8ad404f0aa065e57cf961252d51063137`.
- **How it was cut down:** fontTools 4.60.1 with brotli 1.1.0, run once outside the repo. Weight kept as a range from 400 to 700. Optical size, width, roundness and slant fixed at their defaults. Characters kept: basic Latin, Latin-1, general punctuation, ₹ (U+20B9), minus (U+2212) and arrows (U+2190 to U+2193). Saved as `woff2`.
- **Result SHA-256:** `cf07d17736e1a0bb75bab9a092246b5afb4eae5d702520f78a5309a9dfe11916`.
- **Licence:** SIL Open Font License 1.1, no Reserved Font Name, so the cut-down file can keep its name.
- **Consequence:** Nothing is fetched from Google. Security checks the file at sign-off (condition 30).

## D-025: Common-password list

- **Phase:** 4
- **Decision:** The app refuses passwords on `src/lib/auth/common-passwords.txt`, which ships in the repo and is read only by the server. The owner approved the download on 2026-11-08: "Yes to both".
- **Source:** SecLists, `github.com/danielmiessler/SecLists`, commit `12274c98fdebe98c7a7284914436a472ed469aed`, file `Passwords/Common-Credentials/Pwdb_top-1000000.txt`, 8,755,171 bytes, SHA-256 `e9a88f67aafe65496682dc374559ee714e978bee50314767494c3e37a18c9fc8`. Licence MIT, copied beside the list as `common-passwords.LICENSE`.
- **How it was cut down:** each line NFKC-normalised and lowercased, then kept only if it has 15 to 256 characters, no broken characters and no control characters. Duplicates removed. The 40 Phase 4A starter entries kept. Result: 5,348 lines, 94,740 bytes, SHA-256 `c3fe0385cbbd6169aa6af3533c2d238249a626b1795064011fd4bd60a90a14d1`.
- **Consequence:** No online lookup. The data guard passes on the file unchanged.

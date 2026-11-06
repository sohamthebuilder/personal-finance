# Phase 0 brief: Foundation, GitHub and security baseline

Owner: PM. Source: `docs/PROJECT_BRIEF.md` sections 6, 8, 9 and 10.

## Goal

Create a safe, empty starting point. After this phase the private repo exists, an empty app runs on the Mac, encrypted storage is proven on this Node version, and real data can't slip into the project by accident.

No product features are built in this phase. There is no login, import, screen or AI work.

## User stories

1. As the owner, I want a private GitHub repo with one pull request per phase, so `main` only holds work I've approved.
2. As the owner, I want an empty app that only my Mac can reach, so later phases start from a safe base.
3. As the owner, I want proof that the database can't be opened without my password, so I can trust the storage design before any data exists.
4. As the owner, I want spreadsheets, databases and secrets blocked from the repo automatically, so a slip can't publish my finances.
5. As the owner, I want build agents blocked from reading spreadsheets outside the repo, so my real export stays out of every session.
6. As the owner, I want every pull request checked for tests, known vulnerabilities and data leaks, so problems show up before I sign off.
7. As the Phase 1 engineer, I want the export format written down without any values, so I can generate sample data without seeing real data.

## Acceptance criteria

### Repo and workflow

- **AC-1** Repo `sohamthebuilder/personal-finance` exists and is private. `main` has an initial commit. Work is on `phase-0`, with an open, unmerged pull request into `main`.
- **AC-2** Dependabot alerts are on for the repo.
- **AC-3** All direct dependencies are pinned to exact versions, a lockfile is committed, and a clean clone installs with `npm ci`.

### Empty app

- **AC-4** Following the README from a clean clone, the app starts and shows a page at `http://127.0.0.1:3000`.
- **AC-5** The server listens on 127.0.0.1 only. It can't be reached through the Mac's network address.
- **AC-6** Next.js telemetry is off in every npm script that runs Next.js.

### Encrypted storage

- **AC-7** A repeatable proof runs on this Node version and shows that:
  - a database created with a password reopens with that password, with its data intact
  - a wrong password fails
  - no password fails
  - the stock `sqlite3` tool can't read the file
  - the file has no SQLite header and doesn't contain the test text in readable form
- **AC-8** The key comes from the password through Argon2id or scrypt, with a random salt. The password and key are never written to disk.

### Data guard

- **AC-9** `.gitignore` ignores spreadsheets, CSV files and database files.
- **AC-10** The pre-commit hook blocks spreadsheets, CSV files and database files, including with `git add -f`, upper-case extensions, and a spreadsheet or database renamed to another extension.
- **AC-11** The pull request check blocks the same files, even if a blocked file was added in one commit and removed in a later one.
- **AC-12** A permission rule in `.claude/settings.json` stops agents reading spreadsheets outside the repo, tested in a fresh session.

### Pull request check

- **AC-13** The check runs tests, the dependency audit and the data guard on every pull request, and all of them pass on the Phase 0 pull request.

### Web security baseline

- **AC-14** Every response carries the security headers. In production the Content Security Policy doesn't allow `unsafe-inline` or `unsafe-eval` for scripts, and the page loads in a real browser with no policy violations.
- **AC-15** Requests with an unexpected Host are rejected. So are requests with an unexpected Origin, and state-changing requests with no Origin. Normal local requests work.

### Documents and checks

- **AC-16** `docs/export-format.md` records the column layout, row types and traps using only section 2 of the project brief, with no values.
- **AC-17** The FileVault status is checked and reported.
- **AC-18** The repo and its full history contain no spreadsheets, databases, secrets or real financial data.
- **AC-19** `docs/DECISIONS.md`, `security.md`, `test-report.md` and `handoff.md` exist and match what was built.

## Success criteria

- QA passes every acceptance criterion, working independently of the builder.
- Security signs off after trying to commit a spreadsheet and failing.
- The pull request is open with passing checks.
- The owner can run the app and the encryption proof themself with a few commands.

## Out of scope

- Login, sessions, CSRF tokens and auto-lock (Phase 4)
- Sample data and import (Phase 1)
- Styling, charts and any real screen
- Any AI feature

## Questions for the owner

None of these block Phase 0. Each has a working default, and all three are asked together at sign-off.

1. **Column order.** Section 2 of the brief gives the column count and some names, but not the order, and Phase 1 needs the order. It also needs the exact text the export uses for the balance correction row type. Could you paste only the header row and that one label, with no data rows? Default: Phase 1 can't finalise the sample layout without them.
2. **Node version.** Node 25 no longer gets updates. Should the project stay on Node 25 or move to a supported version? Default: stay on 25.8.0 for now, because that's what this phase was asked to prove. Security adds that 25.8.0 misses nine CVE fixes in 25.8.2, and requires a move to line 24 or 26 before Phase 4.
3. **Protecting `main`.** GitHub's free plan can't enforce checks or block direct pushes on a private repo. Is that acceptable, or do you want GitHub Pro? Default: stay on the free plan and rely on the local hook, the pull request check and the rule that only approved work is merged.

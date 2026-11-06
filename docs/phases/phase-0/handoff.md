# Phase 0 handoff

For the Phase 1 session. Read `docs/PROJECT_BRIEF.md`, `docs/DECISIONS.md` and the Conditions in `security.md` too.

## State

- The empty app runs on `127.0.0.1:3000`, and encrypted storage is proven on Node 25.8.0.
- All Phase 0 work is in pull request 1. Check that the owner has signed off and it's merged before you start.

## Do first

1. Confirm AC-12 if it's still open: use the Read tool on `made-up-guard-test.xlsx` in the repo root. A refusal from permission settings is a pass, and "file does not exist" is a fail.
2. Check with the owner that Security's conditions 1 and 2 were met.

## What Phase 1 needs from the owner

The export's column order and the exact balance-correction label are still unknown, because `docs/export-format.md` was written from section 2 only. Get them from the owner as text. Never open the file.

## Working here

- **Real data:** never open a spreadsheet outside this repo. All test data is generated and made up.
- **Hook false alarms:** a shell command that names a spreadsheet type and an outside-looking path is refused, even if it reads nothing. Use the Edit tool, and don't work around the hook.
- **Tests:** they run on `node --test`, and imports need `.ts` extensions. `next build` type-checks the tests too.
- **Install scripts are off** (`ignore-scripts=true`). Recheck any new package and record exceptions (D-004).
- **Front gate:** `server.ts` handles every production request first (D-014). `next dev` has no gate, so it must never touch a real database.
- **Styles:** the CSP refuses inline styles. Check UI work in a real browser, because the browser pane's script tool ignores CSP (D-010).
- **Data guard changes:** the pull request check runs the guard from the branch under test, so review any diff to `scripts/data-guard.mjs` by eye.

## Left for later phases

- **Before Phase 4:** move to Node 24 or 26, pass the key with `db.key(buffer)`, and decide on Unicode password normalisation.
- **Phase 4:** a default-deny session check outside `src/proxy.ts` alone, a clear message for crash leftovers, and the database stored outside the repo (D-012).
- **Undo copy and exports:** never use `db.serialize()`, which returns the database decrypted.
- **Uploads:** set a body size limit before any upload route exists.

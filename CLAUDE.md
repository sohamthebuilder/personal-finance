# Personal Finance

A private, local-only finance app. Read `CONSTRAINTS.md` before any work.

## Hard rules

- Never open, search for or copy the owner's real spreadsheet, or any spreadsheet outside this repo. All test data is made up.
- Never work around the spreadsheet hook or the data guard.
- **Owner approval gate:** anything from the PM or AI PM is a proposal until the owner accepts it in chat. In every mode, including auto mode, stop and wait for their reply before moving on.
- Commit, push and merge only when the owner asks. `main` only holds approved work.
- The owner is a non-technical PM. Use plain words, and keep their steps few and copy-paste ready.

## How a phase runs

1. Start in a fresh session, never a fork. Read `docs/phases/README.md` to find the phase's personas.
2. Load only the persona skill for the job in hand (`persona-pm`, `persona-engineer` and so on).
3. Don't design, review or build until the brief's "Owner approval" section is filled in.
4. Run QA and Security as fresh agents. Tell each one to use its persona skill. Personas don't start other personas: only the session running the phase does that.
5. Record 5-hour and weekly usage at the start and end of the phase in `handoff.md`.

## Saving tokens

- Read only the sections you need. Find headings first, and don't paste whole documents.
- Don't load a large guide for one small fact. Check a file's size before opening it.
- Pass agents a short summary and file paths, not history.
- Keep command output short, and pass on the failing lines rather than the full log.
- Choose the model for the job (see `docs/phases/README.md`).

## Third-party skills

`.agents/skills` holds reference packs and isn't in the repo. Don't load them by default. The only exception is `stageshow`, under the limits in `persona-designer`.

## Commands

`npm test`, `npm run typecheck`, `npm run guard`, `npm run app`. Tests use `node --test`, and imports need `.ts` extensions.

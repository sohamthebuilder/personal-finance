# Personal Finance

A private web app that runs only on your Mac. It's being built in phases: see `docs/PROJECT_BRIEF.md`. The app is empty for now.

## Run it

You need Node 25.8.0 (see `.nvmrc`) or Node 24.7 or newer.

Run this once after cloning. It installs dependencies and turns on the pre-commit data guard:

```bash
npm run setup
```

Then build and start the app, and open http://127.0.0.1:3000:

```bash
npm run app
```

## Checks

```bash
npm test
```

```bash
npm run typecheck
```

```bash
npm run prove:encryption
```

```bash
npm run guard
```

## Rules for this repo

- Your real export and anything taken from it stay out of this project. Tests generate made-up data when they run.
- The git hooks and the pull request check block spreadsheets, databases and secrets.
- Each phase gets its own branch and pull request, merged only after your sign-off.
- Decisions are logged in `docs/DECISIONS.md`.

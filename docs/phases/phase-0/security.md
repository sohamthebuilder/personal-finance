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
| T6 | The app is framed, sniffed or leaks data through headers or caches | C13 `frame-ancestors 'none'`, `X-Frame-Options`, `nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy`, cross-origin isolation headers, `Cache-Control: no-store` on pages, and no `X-Powered-By` |
| T7 | The database file is copied from disk | C14 whole-file encryption with a 256-bit key. C15 Argon2id with a random salt per database, at or above OWASP's minimum settings. C16 no password or key on disk or in logs. An empty database file is never opened, because it would accept any password |
| T8 | A malicious or compromised dependency | C17 exact versions and a lockfile. C18 install scripts off by default, with named exceptions only. C19 `npm audit` on every pull request. C20 Dependabot alerts |
| T9 | The pull request check itself is abused | C21 third-party actions pinned to a full commit hash. C22 read-only workflow token, with no saved credentials |
| T10 | Telemetry sends project details out | C23 Next.js telemetry off |
| T11 | The laptop is lost or stolen | C24 FileVault on |

## Known limits

- **`main` isn't enforced.** The free plan can't require checks or block direct pushes on a private repo, so C3 reports a failure but can't stop a merge. The owner's sign-off is the real gate.
- **The git hooks can be skipped.** `--no-verify` skips them, and a fresh clone has none until setup runs. Cherry-picks skip the commit hook, but the pre-push hook catches them. C3 is the backstop, though it runs after the push, so data would already be on GitHub by then.
- **C6 and C7 stop mistakes, not a determined bypass.** They aren't a sandbox. A script that builds a file name at runtime gets past them. So do shell commands that reach a spreadsheet without naming its type, such as `cat folder/*`, `cp -r folder .` or `grep -r word folder`. Only four tools are covered. Agents are also told not to touch these files, and that instruction is part of the control.
- **The hook has false alarms.** A shell command that names a spreadsheet type and also contains something that looks like an outside path is refused, even if it reads nothing. Use the Edit tool instead of working around it.
- **Table-shaped text is found by a heuristic.** C4 can miss a renamed CSV with very uneven rows, or only one field separator per row. It doesn't scan source and document types such as `.md`, `.ts` and `.json`, so a table pasted into one of those isn't caught.
- **Encrypted databases can't be recognised by content,** because they look like random bytes. C4 can't flag one with an unusual extension, so the guard also limits file size and the database should live outside the repo.
- **The development server is looser.** It uses `next dev` without the front gate, and it needs a weaker policy to work. `src/proxy.ts` still checks requests there, but Next.js can answer some before it runs. The owner runs the production build, which has the gate and the strict policy.
- **Node answers some malformed requests itself.** Its 400 responses carry no security headers. They hold no content and are sent before any app code runs.

## Sign-off

Pending independent review.

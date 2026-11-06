# Phase 0 security review

Owner: Security engineer. Standard: section 10 of `docs/PROJECT_BRIEF.md`.

## Scope

This phase handles no real data, so the risks are about the foundations: anything weak here carries into every later phase.

## Threats and required controls

| # | Threat | Required control |
|---|---|---|
| T1 | A spreadsheet, database or secret is committed and pushed | C1 `.gitignore`. C2 pre-commit hook. C3 pull request check that scans every new commit, not only the final state. C4 detect renamed spreadsheets and databases by content. C5 scan for common API key formats, because GitHub secret scanning isn't available on this plan |
| T2 | A build agent reads the real export | C6 deny rules for reading spreadsheets. C7 a hook that also covers shell commands, because deny rules only apply to file tools |
| T3 | Another device on the network reaches the app | C8 bind to 127.0.0.1 only, in every script that starts a server |
| T4 | A website the owner visits talks to the local app (DNS rebinding or cross-site requests) | C9 Host allow-list. C10 Origin allow-list, with Origin required on state-changing requests |
| T5 | Injected or third-party script runs in the page | C11 Content Security Policy with a per-request nonce and no `unsafe-inline` or `unsafe-eval` for scripts in production. C12 no third-party scripts, fonts or analytics |
| T6 | The app is framed, sniffed or leaks data through headers or caches | C13 `frame-ancestors 'none'`, `X-Frame-Options`, `nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy`, cross-origin isolation headers, `Cache-Control: no-store` on pages, and no `X-Powered-By` |
| T7 | The database file is copied from disk | C14 whole-file encryption with a 256-bit key. C15 Argon2id with a random salt per database, at or above OWASP's minimum settings. C16 no password or key on disk or in logs |
| T8 | A malicious or compromised dependency | C17 exact versions and a lockfile. C18 install scripts off by default, with named exceptions only. C19 `npm audit` on every pull request. C20 Dependabot alerts |
| T9 | The pull request check itself is abused | C21 third-party actions pinned to a full commit hash. C22 read-only workflow token, with no saved credentials |
| T10 | Telemetry sends project details out | C23 Next.js telemetry off |
| T11 | The laptop is lost or stolen | C24 FileVault on |

## Known limits

- **`main` isn't enforced.** The free plan can't require checks or block direct pushes on a private repo, so C3 reports a failure but can't stop a merge. The owner's sign-off is the real gate.
- **`--no-verify` skips the pre-commit hook.** A fresh clone also has no hook until setup runs. C3 is the backstop for both.
- **C6 and C7 stop mistakes, not a determined bypass.** A script that builds a file name at runtime can get past them. They aren't a sandbox.
- **Encrypted databases can't be recognised by content,** because they look like random bytes. C4 can't flag one with an unusual extension, so the guard also limits file size and the database should live outside the repo.
- **Some Next.js development features are looser.** The development server needs a weaker policy to work. The strict policy applies to the production build, which is what the owner runs.

## Sign-off

Pending independent review.

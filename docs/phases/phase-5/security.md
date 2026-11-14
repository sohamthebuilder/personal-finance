# Phase 5 security review (sign-off)

Security, fresh agent, 2026-11-14. Branch `phase-5`, uncommitted build. Review only: no app code changed.

## Decision

**Signed off.** No Blocker or Major. One new Minor (S5-1), logged for the handoff. S4-16 and S4-17 stay open as "Later" (Phase 5 didn't touch `group-names.ts`).

## Scope

Phase 5 wasn't marked for Security, but it adds routes that send financial figures to the page, so it gets a sign-off. Reviewed: the uncommitted diff under `src/` and `tests/`, plus the new files `src/app/api/overview/route.ts`, `src/app/api/overview/old-note/route.ts`, `src/lib/overview/overview.ts`, `src/app/ui/overview.tsx`, `src/app/ui/overview-words.ts`, `tests/overview.test.ts`, `tests/overview-ui.test.ts`. Checked against Phase 4's decisions 1 to 4 and conditions 24 to 27 and 58 (`docs/phases/phase-4/security.md`). I didn't repeat QA's screen testing.

## What I checked

| Area | Result | Evidence |
|---|---|---|
| Front gate unchanged | Pass | No diff to `src/lib/security/gate.ts`. Default-deny holds: the open POSTs are still only `password/create`, `login`, `delete/finish` (`gate.ts:21`). `/api/overview` and `/api/overview/old-note` get no exception, so without a session the gate answers 401 |
| Route's own session check | Pass | Both new routes use `withSessionForm` (`overview/route.ts:13`, `old-note/route.ts:7`): live session first, 16 KiB form counted while reading, one `catch` that sends the fixed `FAILED` and logs nothing (`route-helpers.ts:105-118`). The route walk in `upload-update.test.ts:439-444` finds them with no list to update |
| Nothing returned while locked | Pass | Session null gives `{ ok: false, error: "LOCKED" }` 401 before any read (`route-helpers.ts:111`). `server.test.ts:521-525` posts both routes after log out: 401, and the body has no `netWorth`, `earned` or `spent`. QA's AC-17 row agrees |
| Overview counts as use, status doesn't | Pass | `/api/overview` uses the default `touch: true`, and it's only asked on first load, a period change, Reload and Try again (`overview.tsx:101-132, 158-161`), all owner actions. `/api/status` still calls `requireSession(request, { touch: false })` (`status/route.ts:12`); `sessionFor` only moves `lastUse` when `touch` is true (`session.ts:167`). The Overview's new 30-second poll (`overview.tsx:135-155`) calls only `/api/status` |
| Status answer | Pass | Adds `version`, a whole-number change counter, not a figure (`state.ts:103-105`). It's read only after the session check; a failure gives `version: null`, never error text (`status/route.ts:13-18`). Locked still gives `{ ok: false }` 401 with no version |
| No figures in web addresses | Pass | Both routes are POST with an empty form body; `postForm` sends the body as form text, never in the address, with `redirect: "error"` (`client-tools.ts:12-20`). The period is still set through `POST /api/period` (`overview.tsx:170`). No query strings built anywhere in the Overview |
| No figures in logs or errors | Pass | No `console.` or stdout writes in `src/lib/overview`, `src/lib/metrics` or `src/app/api`. Errors are fixed codes. The page's failure line is fixed text (`overview.tsx:176-187`) |
| Caching | Pass | `reply()` adds `Cache-Control: no-store` to every answer (`route-helpers.ts:83-87`); fetches also use `cache: "no-store"`. Figures aren't in the server-drawn HTML at all: `page.tsx` renders `<OverviewScreen periodKey=…>` and the figures come by fetch, so a cached page holds none. Lock and log out still send `Clear-Site-Data` |
| File text as plain text | Pass | Category names travel as JSON strings and render only as React text in `CategoryRow` (`overview.tsx:300-305`), via `categoryName` (`format.ts:50-52`). They don't reach any `aria-label`, `title`, link, class name or log: the chart's label uses server-made month names only (`overview-words.ts:55`). No `dangerouslySetInnerHTML` or `innerHTML` in `src` |
| No `style="…"` in server HTML (D-010) | Pass | `grep style= src/app` finds only a CSS comment. The meter width is set from script on the element (`overview.tsx:296`), which the nonce-based `style-src` allows. Preview inline spacings became classes (`system.css`, "Overview build helpers"). `overview-ui.test.ts:80` pins it |
| Nothing on disk or in browser storage | Pass | `overview.tsx` has no `localStorage`, `sessionStorage` or IndexedDB. The only browser storage in the app is the shell's sidebar flag (`shell.tsx:24, 92`, pre-existing, no data). Overview figures live in React state only |
| New session fields | Pass | `oldNoteDismissed` is on `Unlocked` (`session.ts:38-39`), which `lock()` drops (`session.ts:127`), so lock, log out and delete clear it and a new log in starts without it. `rolledUp` is on the store (`session.ts:57, 77`), a true/false flag with no figure; `finishDelete` resets it (`delete-data.ts:47`) and a restart starts it false |
| `spendingByCategory` | Pass | Pure function over rows already in memory; same date window and `checkPeriod` as `periodMetrics` (`metrics.ts:132-145`). No database, file or network access. Category is a `Map` key, so a name like `__proto__` is plain data. The route sends at most 5, above zero only (`overview.ts:206`) |
| Lock clears the page | Pass | The shell's own status watch still leaves on 401 (`shell.tsx:37-38`). The Overview leaves on any 401 from its own routes (`overview.tsx:111, 167, 172`) |
| Owner approval recorded | Pass | `brief.md` "Owner approval": Approved, 2026-11-13 |

## Checks

| Check | Result |
|---|---|
| `npm test` | 511 pass, 0 fail, 0 skipped |
| `npm run typecheck` | Clean |
| `npm audit` | 0 vulnerabilities |
| `npm run guard` | 322 files checked, nothing blocked |

## Findings

| ID | Level | Finding | When |
|---|---|---|---|
| S5-1 | Minor | `/api/status` now calls `dataVersion`, which goes through `dataState` → `ensureDataSchema` (`state.ts:67-72`), so every poll (two per tab every 30 seconds, plus focus and wake) runs `CREATE TABLE IF NOT EXISTS` and `INSERT OR IGNORE` outside the one-change-at-a-time lock. They're no-ops on an existing database, run synchronously, and any error is caught to `version: null`, so no data is exposed or changed. It's still write-capable work on a route meant to be a light read. **Reproduce:** read `status/route.ts:15` → `state.ts:104` → `state.ts:92`. **Fix:** give `dataVersion` a plain `SELECT data_version FROM app_state WHERE id = 1`, falling back to null if the table is missing | Later (next touch of `state.ts`) |

Carried, still open: **S4-16** (lone surrogate in a group name) and **S4-17** (grapheme count and invisible characters in group names), both Minor, "Later". Phase 5 didn't touch `group-names.ts`.

Not a finding: the Overview and the shell both poll `/api/status`, so a tab asks twice every 30 seconds. Neither counts as use, so it doesn't extend the idle lock.

## Conditions

None before merge. S5-1, S4-16 and S4-17 go in the handoff as Minor.

## Known limits (unchanged)

- After an idle lock, figures already on screen stay in the page until its next status check (up to 30 seconds) or the owner's next action. The server holds no key by then.
- The 15-minute idle lock is still only tested with a fake clock.

## Not verified

- I didn't run the app or a browser; screens by eye are QA's.
- I didn't test a category name holding HTML on the Overview screen itself. It renders as React text, the same path Phase 4 tested with HTML-looking names, so I'm confident by reading the code, not by a run.

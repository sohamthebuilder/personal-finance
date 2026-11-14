# Phase 6 security review (sign-off)

Security, fresh agent, 2026-11-14. Branch `phase-6`, uncommitted build. Review only: no app code changed.

## Decision

**Signed off.** No Blocker or Major. Three new Minors (S6-1 to S6-3), logged for the handoff. S5-1, S4-16 and S4-17 stay open as "Later" (Phase 6 didn't touch `state.ts` or `group-names.ts`).

## Scope

Phase 6 adds the Spending screen: two new routes that send figures and notes to the page, a new session field, a new return screen after log in, and a link from the Overview. Reviewed: `src/app/api/spending/route.ts`, `src/app/api/spending/open/route.ts`, `src/app/spending/page.tsx`, `src/lib/spending/spending.ts`, `src/lib/metrics/spending.ts`, `src/app/ui/spending.tsx`, `src/app/ui/spending-words.ts`, the diffs to `src/app/ui/overview.tsx`, `src/app/ui/log-in.tsx`, `src/lib/auth/session.ts` and `src/app/system.css`, plus `tests/spending*.ts`. I didn't repeat QA's screen testing.

## What I checked

| Area | Result | Evidence |
|---|---|---|
| Front gate unchanged | Pass | No diff to `src/lib/security/gate.ts`. The only open POSTs are still `password/create`, `login`, `delete/finish` (`gate.ts:21`), so `/api/spending` and `/api/spending/open` are refused without a session |
| Route's own session check | Pass | Both routes use `withSessionForm` (`spending/route.ts:13`, `open/route.ts:7`): live session first, 401 `LOCKED` before any read, 16 KiB form, one `catch` that sends fixed `FAILED` and logs nothing (`route-helpers.ts:105-118`). The route walk in `upload-update.test.ts:437-445` covers them automatically |
| Input checks: level | Pass | `readPath` (`spending.ts:144-154`): view must be `categories` or `groups`; a group only with the groups view; a subcategory only with a category; each text at most 500 characters, else 400. A group key must match `0`-`99` and exist in Setup, or be `none`, else 409 `GONE` (`spending.ts:92-93`). Category and subcategory names only ever compare with rows in memory (`spending.ts:102-104`), so an unknown name just gives an empty level |
| Input checks: "shown" | Pass | Not a number or infinite gives 400 (`route.ts:22-23`); otherwise clamped to 50 to 100,000 (`spending.ts:123`), so negative or huge values can't break the list |
| No path or query injection | Pass | No SQL is built from the request: `readRows` and `loadSetup` read everything, then filtering is plain JavaScript. No file paths. The period comes from the session (`route.ts:25`), "today" from the server (`serverToday()`) |
| Only what the screen needs | Pass | Answer is the level, the path, the change counter and the old-upload date (`route.ts:26-32`). Transactions are sent only on level 3, at most `shown` of them, with date, account, amount, note and original amount (`metrics/spending.ts:143-153`). Notes never travel above level 3 |
| Errors leak nothing | Pass | Only fixed codes: `BAD_REQUEST`, `GONE`, `LOCKED`, `FAILED`. `UnknownGroup`'s message is never sent (`route.ts:35`). No `console.` in the new files |
| File text as plain text (AC-9) | Pass | No `dangerouslySetInnerHTML`, `innerHTML`, `insertAdjacent`, `eval` or `new Function` anywhere in `src`. Notes, names, accounts and currency render as React text (`spending.tsx:508, 553-559`). File text is never put into `href`, `style`, `className` or a URL. Inline styles set from script are only numbers made by the app: bar width (`spending.tsx:488`) and tooltip position (`spending.tsx:604-605`). Names do reach `aria-label` (`spending.tsx:507`, `overview.tsx` CategoryRow), which React escapes and which can't run code |
| Long notes can't widen the page | Pass, with S6-1 | `.txn__note` wraps (`overflow-wrap: anywhere; white-space: pre-wrap`, `system.css:497`) in a `minmax(0, 1fr)` column; `.rank__name` and the path also wrap (`system.css:476, 487`). But see S6-1 for the original-currency line |
| Return screen after log in | Pass | `/spending` is added to two fixed lists (`session.ts:24`, `log-in.tsx:16`). `returnTo` is set only by server pages passing a typed constant (`server-state.ts:33`, `spending/page.tsx:7`), never from a request. The page only follows `next` if it's in its own list, else `/` (`log-in.tsx:53-55`). No open redirect |
| `spendingOpen` session field | Pass | Lives on `Unlocked` only, memory only (`session.ts:40-41`). Holds one category name, at most 500 characters, set only by `/api/spending/open` (`open/route.ts:9-10`). Read once and wiped (`route.ts:18-20`), and only used if it's a string. `lock()` drops the whole `Unlocked` object (`session.ts:127-130`), so log out, idle lock and delete clear it, and a fresh log in starts without it (`session.ts:112`) |
| Overview link | Pass | The category goes in the POST body; the page then goes to the fixed address `/spending` (`overview.tsx` `openCategory`). Nothing in the web address |
| Nothing in web addresses (AC-11) | Pass | Level goes in the POST body (`spending.tsx:48-55`); history uses `pushState(state, "")` with no URL (`spending.tsx:62-66`) |
| Owner approval recorded | Pass | `brief.md` "Owner approval": Accepted, 2026-11-14, "Yes, accept all" |

## Checks

| Check | Result |
|---|---|
| `npm test` | 545 pass, 0 fail, 0 skipped |
| `npm audit` | 0 vulnerabilities |
| `npm run guard` | 353 files checked, nothing blocked |

`npm run typecheck` is QA's; I didn't run it.

## Findings

| ID | Level | Finding | When |
|---|---|---|---|
| S6-1 | Minor | The "Paid 420.00 THB" line uses `white-space: nowrap` in an `auto` grid column (`system.css:498, 500`). Its text is the file's own currency and original amount, which the import keeps as free text when it isn't a number (`metrics/spending.ts:135-137`, `parse-export.ts:225-226`). A very long value would push the row wider than a 320 screen. Real exports use short codes, so this is unlikely, and it can't run code. **Reproduce:** upload a made-up file with a 200-character currency cell, open that transaction at 320 wide. **Fix:** let `.txn__orig` wrap (`overflow-wrap: anywhere`, drop `nowrap`) through the design system | Later (or with any QA fix round) |
| S6-2 | Minor | The drill-down (group key, category and subcategory names) is kept in the browser's history entry (`spending.tsx:62-66`) so Back works. Browsers can save that to disk for "restore tabs", and log out's `Clear-Site-Data: "cache"` doesn't clear it. No amounts or notes go there, and AC-11 only rules out the web address. **Reproduce:** read `pushPath`. **Fix if wanted:** keep only the depth in history and the names in page memory | Later |
| S6-3 | Minor | No live test posts `/api/spending` or `/api/spending/open` after log out. They're protected by the same gate and helper as the Overview, and the route walk checks the helper is used, so I'm confident by reading, not by a run. **Fix:** add both paths to the loop at `server.test.ts:522` | Later (next touch of `server.test.ts`) |

Carried, still open: **S5-1** (status poll runs schema set-up), **S4-16** and **S4-17** (group-name edge cases), all Minor, "Later".

## Conditions

None before merge. S6-1 to S6-3 go in the handoff as Minor.

## Known limits (unchanged)

- After an idle lock, figures already on screen stay in the page until its next status check (up to 30 seconds) or the owner's next action.
- The 15-minute idle lock is still only tested with a fake clock.

## Not verified

- I didn't run the app or a browser. S6-1 is from reading the stylesheet, not a run.
- A note holding markup on screen is QA's AC-9 check; by code it renders as React text only.

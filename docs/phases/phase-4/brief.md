# Phase 4 brief: Login, shell, upload and setup

Owner: PM. Source: `docs/PROJECT_BRIEF.md` sections 5 and 10, `docs/phases/phase-3/design.md` (screens 1 to 8, 13 and 14, "Rules shared by screens 7 to 16", "Import refusals", "Notes for the build phases"), `docs/phases/phase-3/security.md` (conditions 29 to 37, rulings 1 to 3), and the earlier conditions they carry forward (Phase 0: 12, 13. Phase 1: 12, 13. Phase 2: 23 to 28).

## Goal

The app stops being a blank page. After this phase the owner can run one command, create a password, log in, drop in a made-up export, finish setup, confirm the summary, and land in the app's shell. They can upload a newer export, see what changed, confirm or undo, edit setup in Settings, and delete all their data. The app locks itself, slows down wrong guesses, and loads its font from its own files, never from Google. The dashboards themselves (Overview and the rest) come in Phases 5 to 8, so after the summary the owner lands on a placeholder Overview that says so.

## Personas and budget

- **Personas:** PM, Designer, Engineer, QA, Security. Security does a threat review before the build and a sign-off after it, each as a fresh agent. QA runs as a fresh agent.
- **Budget:** half of one 5-hour limit per part, unless the owner agrees otherwise (see question 1). The stop-and-ask line is 72% if the window doesn't reset.
- **Budget change:** on 2026-11-08 the owner raised Part 4A's budget by 20 points, to 70, in their words "Yes to both". The stop-and-ask line is now 92% if the window doesn't reset.
- **Usage at start (2026-11-08):** 5-hour 22%, weekly 76%. The weekly limit resets on 2026-11-10.

## Owner approval

The owner fills this through their reply in chat. Nothing after the brief starts until this is complete.

- **Status:** Approved
- **Date:** 2026-11-08
- **Owner's words:** "Yes, approve", accepting the brief with all five working defaults: split into 4A and 4B, use 15 to 25 weekly points on 4A and stop at 95% weekly, new previews only for screens 2, 3, 14 and 13, a placeholder Overview, and merge Phase 3 before Phase 4.
- **Part 4B sign-off (AC-26):** 2026-11-11, the owner said "Yes, sign off", including the design system fix that wraps long names inside their row.
- **Later changes approved:** 2026-11-11, the owner said "Yes, Ungrouped is fine": on an update, new accounts go in Ungrouped until the owner chooses a group, as the approved screen 8 preview shows. This replaces "New accounts still need a group before Replace" in the setup answers change. 2026-11-10, the owner said "Yes, approve all" to the redrawn previews of screens 5, 8 and 13, the design system addition (folds, search, inline group naming, save bar, search, x and plus icons, the `[hidden]` rule), separate income and expense group lists, and all new wording marked (new) in `phase-3/design.md`. Before that on 2026-11-10, "Yes, approve" to the second change, income groups (income works like expenses with the owner's own groups, no Earned, Returns or Loan, all income counts as Earned, accepted gap on the savings rate). Earlier on 2026-11-10, "Yes, approve" to the setup answers change below (accounts by group, income per subcategory, expense groups, no reimbursement or reliable-from question, screens 5, 8 and 13 to match, AC-19 and AC-23 changed, AC-27 to AC-29 added). 2026-11-08, the owner said "Yes, approve all" to: the previews of screens 2, 3 and 14 with the new `.cmd` part, `copy` and `trash` icons and two new lines of wording; ending the 4A try-out at a placeholder upload screen with no shortcut to fill in data (S4-6); and AC-18's new wording on `ALREADY_IMPORTED` (S4-13).

## Split into two parts (working default, question 1)

This is the biggest build so far: a login system, a safe wipe script, a font, an upload with undo, and ten screens. It won't fit in one budget. So the working default is two parts, each in its own fresh session, each with its own QA run and Security sign-off.

| Part | Screens | What it adds |
|---|---|---|
| **4A, getting in safely** | 1 Create password, 2 Log in, 3 Locked, 7 Shared header, 14 Delete my data | Password, session, auto-lock, slow-down, wipe script, font, the shell with a placeholder Overview |
| **4B, upload and setup** | 4 First upload, 5 Setup, 6 Summary, 8 Update upload, 13 Settings setup | Upload in a worker, setup answers, summary, replace with preview, one-step undo, delete-the-export reminder |

One Security threat review covers both parts, before 4A's build starts. 4A goes first because 4B needs a logged-in session to upload into.

## Screen previews before the build

As the owner agreed after Phase 3, the Designer previews each screen that has no preview yet, and the owner approves it before it's built. `previews/first-time.html` already shows screens 1, 4, 5 and 6, and `update-undo.html` shows screens 7 and 8. So new previews are needed for **2 Log in, 3 Locked, 14 Delete my data** (in 4A) and **13 Settings setup** (in 4B). Each preview uses `docs/design-system/` and made-up data only.

## User stories

1. As the owner, I want one password to protect everything, so nobody at my Mac can read my money without it.
2. As the owner, I want the app to lock itself when I walk away, so I don't have to remember.
3. As the owner, I want a clear way out if I forget my password, without a back door.
4. As the owner, I want to drop in my export and be guided through setup, so the numbers are right from day one.
5. As the owner, I want to see what changed before a new export replaces the old one, and to undo it in one click.
6. As the owner, I want to delete all my data from Settings, so I can start fresh.

## Acceptance criteria

**Both parts**
- **AC-1** Every built screen matches its spec in `design.md`: its states, wording, keyboard order and width notes. It follows `docs/design-system/README.md`, in light and dark, with no sideways scroll at 1280, 375 and 320 pixels.
- **AC-2** The owner approves the preview of each screen without one (2, 3, 14, 13) in chat before that screen is built.
- **AC-3** Every new page and route needs a signed-in session, except create password, log in, Locked and the font file. Each new route has the `Host`, same-origin, CSP and `Referrer-Policy` checks (condition 35), and a request size limit (Phase 0 condition 13, Phase 2 condition 25).
- **AC-4** No file text reaches the page through `dangerouslySetInnerHTML` or `innerHTML`. A test with made-up names that hold HTML, a very long unbroken string and direction-changing characters shows them as plain text, and they never appear in a web address, tab title, log or error (conditions 35, Phase 2 condition 27).
- **AC-5** Errors use the fixed wording in `design.md`. Caught errors are never logged or sent (Phase 2 condition 24).
- **AC-6** `npm test`, `npm run typecheck`, `npm audit` and `npm run guard` pass. New dependencies, if any, are pinned and named in the handoff.

**Part 4A**
- **AC-7** Create password needs at least 15 characters, allows up to 256, counts characters not code units, has no "must include" rules, doesn't trim spaces, and normalises to one Unicode form before hashing. It refuses common passwords from a list shipped in the app, one repeated character, and simple runs. The server repeats every check (condition 33).
- **AC-8** Password fields follow ruling 2: a page-only check on screen 1 keeps the text and hides it. Anything after a request was sent empties the field. All password forms use `method="post"`. No password appears in a log, web address or stored state (condition 33).
- **AC-9** The key stays in memory only while logged in. The session cookie is HttpOnly and SameSite=Strict. The app locks after 15 minutes idle, on Log out and on restart. After lock, browser Back shows no figures in plain Chrome (condition 34).
- **AC-10** Wrong passwords are slowed down by the server, not the page. One count covers log in, Locked and Delete my data. A try during a wait is refused before any password work, even if it's correct. Password checks run one at a time (condition 32).
- **AC-11** The start-up screen is worked out by the server from what's saved: no database, half-finished delete, locked, or the first-time step. A crafted web address can't choose the screen, skip a step or reach Overview early (ruling 3, S3-13).
- **AC-12** Delete my data needs the password and a tick box, removes the whole database and its side files, salt and marker (condition 28), clears the setup answers, can finish a half-finished delete, and ends on Create password.
- **AC-13** The forgotten-password wipe meets every part of condition 29: one short command running a script in the repo, a copy button whose text equals what's shown, the banned-words list, exact named files only, the listed refusals, DELETE typed to confirm, safe to run twice, and the tests with a made-up folder.
- **AC-14** Google Sans Flex is a local `woff2` file under 5 MiB that keeps ₹ and weights 400 to 700, with `OFL.txt` beside it, its SHA-256 and source in `docs/DECISIONS.md`, loaded without `next/font/google`, `@import` or `src: local()`. The session gate lets through only that one font path (condition 30).
- **AC-15** A test fails if `fonts.googleapis.com` or `fonts.gstatic.com` appears in `src/`, `public/` or the build. A browser run across login and the shell shows requests to `127.0.0.1` only. Previews and `gallery.html` are never served (condition 31).
- **AC-16** The shared header has the period picker, Upload, Settings and Log out, and the sidebar collapses and expands as in the design system. The period sits in the server's session and travels in a request body, never a web address (Phase 2 conditions 25, 26). Overview is a placeholder saying it arrives in Phase 5.

**Part 4B**
- **AC-17** The upload is read in a worker with memory and time limits. The size limit applies before the body is read. File bytes are dropped after import and never written to a temporary file (conditions 37, Phase 1 condition 12).
- **AC-18** Every refusal listed under "Import refusals" shows its fixed wording. `ALREADY_IMPORTED` shows only on the first-upload route. On update, the same file shows screen 8's note "This file matches your current data". Row refusals add row numbers only.
- **AC-19** First upload, setup and summary run in order. Setup answers save, and the summary shows every line the design lists before the owner confirms.
- **AC-20** Update upload shows new, changed and removed rows, the net worth change, new accounts and new income categories before confirming. "Most of your current accounts aren't in this file" shows when more than half are missing, checked by the server too (ruling 1). The partial-file warning shows as designed.
- **AC-21** Confirm replaces the data. One-step undo brings back the previous version, kept encrypted and never written with `serialize()`. A test reads the raw undo file and fails on plaintext (Phase 0 condition 12). The delete-the-export reminder shows after import.
- **AC-22** Answers for names no longer in the file go from the live setup tables on confirm, and stay only in the undo copy. A test checks a removed account's name is gone (condition 36).
- **AC-23** Settings setup lets the owner change account groups and category choices after the first time, with the same checks as screen 5.
- **AC-24** The amounts limit runs on every path that saves rows, including replace (Phase 2 condition 23). `today` is set by the server (Phase 2 condition 26).

**Sign-offs**
- **AC-25** QA (fresh agent) records a result for every criterion in its part. Security (fresh agent) signs off each part, and checks the font file in 4A.
- **AC-26** The owner signs off each part in chat.

## Good enough

- **Accepted gaps:** the Known limits in Phase 3's `security.md` stand: backups keep old encrypted copies, anyone at the logged-in Mac can run the wipe, there's no password change, a damaged database looks like a wrong password, the slow-down doesn't stop an offline guess at stolen files, only one undo, and browser extensions can read the page. File bytes and text stay in memory until cleared and can't be wiped (Phase 1 condition 13). The slow-down count resets when the app restarts.
- **Test limit:** made-up exports only, from the sample generator. Browser checks in Chrome on the owner's Mac size only. No Safari or Firefox.

## Out of scope

- Overview, Spending, Savings & Net worth, Accounts & Investments (Phases 5 to 8). Overview is a placeholder.
- Settings AI and the chat panel (Phases 10 to 12).
- Leaving the data folder out of Time Machine (Phase 13, condition 39).
- A password change feature. It isn't in the project brief.

## Tasks

Riskiest first, in thin slices.

**Part 4A**
1. Designer previews screens 2, 3 and 14. Owner approves.
2. Security threat review of the whole phase (fresh agent).
3. Password rules, key in memory, session cookie, auto-lock, slow-down, and the server-chosen start-up screen.
4. Screens 1, 2 and 3.
5. Font file, its licence, the Google test and the gate's one font path.
6. Shell and shared header, with the placeholder Overview.
7. Delete my data (screen 14) and the wipe script with its tests.
8. QA, fixes, narrow re-test, Security sign-off, owner sign-off.

**Part 4B** (fresh session)
1. Designer previews screen 13. Owner approves.
2. Upload route with the worker, limits and refusals.
3. Screens 4, 5 and 6 with setup saving.
4. Update preview, replace, undo and the reminder (screen 8).
5. Settings setup (screen 13).
6. QA, fixes, narrow re-test, Security sign-off, owner sign-off.

## Owner-only steps

1. Answer the questions below and approve this brief in chat.
2. Approve each screen preview in chat when it's shown.
3. At the end of each part, try the app on your Mac with made-up data. Copy and paste this into Terminal from the project folder:

```bash
npm run app
```

Then open `http://127.0.0.1:3000` in Chrome. Use only the made-up sample file the session gives you.

## Questions for the owner

1. **Split Phase 4 into two parts, 4A and 4B, each with half a 5-hour limit?** Default: yes, as in the table above. One budget isn't enough for all ten screens plus the login and wipe safety work. **Blocks the phase.**
2. **Your weekly limit is at 76% and resets on 10 November. Is it fine to use about 15 to 25 points of it on Part 4A now?** Default: yes, and stop to ask if weekly reaches 95%. Blocks the phase.
3. **Previews: only screens 2, 3, 14 (and 13 in Part 4B) get new previews, since screens 1, 4, 5, 6, 7 and 8 already have one you approved.** Default: yes. Doesn't block. If you'd like fresh previews of all ten, that costs more budget.
4. **After the summary, you land on a placeholder Overview that says "Your Overview arrives in the next phase".** Default: yes. Doesn't block.
5. **Merge Phase 3 into `main` before Phase 4 is committed?** Phase 4 is built on top of Phase 3, which isn't merged yet. Default: merge Phase 3 when you next ask for a merge, then Phase 4 after it. Doesn't block the build.

## Requirement change, setup answers (approved by the owner, 2026-11-10)

The owner reviewed the screen 13 preview and asked for five changes. On 2026-11-10 they answered three questions: expense categories go into **groups they name**, income is sorted **per subcategory**, and for reimbursements "the money manager has transfer type (other than income and expense)". This changes setup answers that Phase 2 uses, so it needs the owner's yes before any design or build.

**What changes**
1. **Accounts by group.** Setup lists the account groups (Ungrouped first, then Bank, Cards, Wallets, Investments, Money with others, Business), each with its count. Opening a group lists its accounts, and each account has a picker to move it to another group. A search box finds an account by name. Balances aren't shown, because the dashboards show them.
2. **Income per subcategory.** Each income subcategory is Earned, Returns or Loan on its own. Categories are listed closed, with a short count such as "4 Earned · 1 Returns". Opening one lists its subcategories, each with the three-way choice, plus "Set all to" for the whole category. A category with no subcategories has one choice. A search box finds a category or subcategory.
3. **Expense groups (new).** The owner names their own groups, such as Needs and Wants, and puts each expense category in one. Subcategories follow their category. A category not yet placed reads "Not grouped". Groups can be added, renamed and removed, and a removed group's categories go back to "Not grouped". The dashboards use these groups from Phase 6 on.
4. **No "Paid back and history".** The reimbursement question goes, because money paid back is logged as a transfer. Corrections that used to show as Recovered count with Other corrections instead, so net worth is still fully explained. The "history becomes reliable" question goes too, and spending trends use the full history.
5. **Screen 8 matches.** On an update, new income subcategories get their Earned, Returns or Loan choice, and new expense categories show as "Not grouped" for Settings. New accounts still need a group before Replace.
6. **Screen 5 matches.** First-time setup uses the same controls, so it changes in the same way. It becomes three parts: Accounts, Income and Expenses. Expense groups are optional the first time ("You can do this later in Settings"), and every account still needs a group.

**Working defaults (say if you want any different)**
- Up to 12 expense groups, each name up to 40 characters, with no two the same. Names are stored encrypted, like everything else.
- Generic keyword suggestions still fill in what they can for accounts and income. Expenses start with no groups.
- Changes in Phase 2's rules: income kinds are read per subcategory, the reimbursement account and trends start date go, and the Recovered line in the net worth breakdown merges into Other corrections. `docs/PROJECT_BRIEF.md` section 3 is updated to match.
- **Fits in 4B:** screens 5 and 13 are both 4B screens, and the build of the rest of 4B carries on meanwhile. Expense groups appear in dashboards only from Phase 6.

**New and changed acceptance criteria**
- **AC-19 (changed)** First upload, setup and summary run in order. Setup has Accounts, Income and Expenses. Every account needs a group, and every income subcategory has a kind. Answers save, and the summary shows every line the design lists before the owner confirms.
- **AC-23 (changed)** Settings setup lets the owner change account groups, income kinds per subcategory and expense groups after the first time, with the same checks as screen 5.
- **AC-27 (new)** Setup works with at least 60 accounts and 40 income and 40 expense categories with subcategories. Groups and categories open and close by keyboard, search narrows the list, and there's no sideways scroll at 1280, 375 and 320.
- **AC-28 (new)** Expense groups: add, rename and remove work, with the limits above refused by the server too. Group names show as plain text only, and a removed group's categories read "Not grouped".
- **AC-29 (new)** Phase 2's metrics use income kinds per subcategory, the reimbursement and trends-start answers are gone, and the net worth breakdown still adds up to the change in net worth. Tests cover a category whose subcategories have different kinds.

**Next if approved:** the Designer remakes the screen 13 preview and updates screen 5 in `previews/first-time.html`, for the owner's yes before they're built.

### Second change, income groups (approved by the owner, 2026-11-10)

After seeing the previews, the owner said the Earned, Returns and Loan labels make Income complicated, and asked for Income to work like Expenses. Asked how, they chose "Like expenses, my own groups".

**What changes**
1. **Income works exactly like Expenses.** The owner names their own income groups, puts each income category in one, and subcategories go with their category. Unplaced categories read "Not grouped". Same limits: up to 12 groups, 40 characters, no two the same. Income groups are optional the first time, like expense groups.
2. **No Earned, Returns or Loan choice anywhere.** That goes from screens 5, 8 and 13. On an update, new income categories show as "Not grouped", like new expense categories. Keyword suggestions for income go too.
3. **The numbers.** All income counts as Earned. So:
   - The savings rate counts any loan received or investment gain logged as income as if it were earned. It looks higher in a month with a loan.
   - The net worth breakdown loses its Investment returns and Loans lines. That money sits in Earned, and the breakdown still adds up to the change in net worth.
   - Accounts & Investments (Phase 8) can still show investment returns, worked out from balances and money put in, not from income labels.
   - `docs/PROJECT_BRIEF.md` section 3 changes to match: "Earned: all income rows, except balance corrections". The setup step there becomes "group your accounts, and optionally your income and expense categories".
4. **First-time setup** keeps three parts: Accounts (required), Income (optional), Expenses (optional).

**Criteria this replaces**
- **AC-19:** Setup has Accounts, Income and Expenses. Every account needs a group. Income and expense groups are optional. Answers save, and the summary shows every line the design lists before the owner confirms.
- **AC-23:** Settings setup lets the owner change account groups and their income and expense groups after the first time, with the same checks as screen 5.
- **AC-28:** Income and expense groups: add, rename and remove work, with the limits refused by the server too. Group names show as plain text only. A removed group's categories read "Not grouped".
- **AC-29:** Phase 2's metrics count all income rows as Earned. The reimbursement, trends-start, returns and loan answers are gone. The net worth breakdown still adds up to the change in net worth. Tests cover income in several groups.

**Accepted gap, if approved:** the savings rate and Earned include loans and investment gains logged as income.

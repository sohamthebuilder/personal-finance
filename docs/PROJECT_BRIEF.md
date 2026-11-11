# Personal Finance Analyser: Solution Proposal

## 1. Context

Money Manager is good for logging but weak for analysis. You want a simple, private web app that:
- takes your Excel export
- shows expenses, savings and accounts in a few clear charts
- lets you chat about your finances
- updates when you upload a newer export

It only reads and explains your data. Nothing is entered or edited in the app.

**Agreed so far**
- Runs on your Mac only.
- Reimbursements from friends stay separate from spending.
- All accounts count towards net worth.
- The chatbot works with Claude or OpenAI, using your own key entered in Settings.
- A simple password login protects everything, even from someone using your laptop.
- Code lives in a private GitHub repo, pushed with each phase.
- **Your Excel file was for reference only. It and anything extracted from it are never saved, committed or reused during the build.**

This plan deliberately contains no figures, account names or other values from your file.

## 2. What the export format means for the design

The export is one sheet of 12 columns with no row IDs. It has four kinds of row:

| Row type | What it really is |
|---|---|
| Exp. | Real spending |
| Income | Salary and similar, mixed with market gain and loss rows |
| Transfer-In / Transfer-Out | Moves between your own accounts, always in matching pairs. Neither income nor spending |
| Income / Expense Balance | Manual "Modified Bal." corrections, not real income or spending |

**The good news:** the analysis showed that transfers pair up exactly and closed accounts come to zero. Balances and a net worth history can be rebuilt from the file.

**Traps that would make simple charts wrong**

| # | Problem | How the app handles it |
|---|---|---|
| 1 | Market moves are logged as income, including losses as negative income | Treated as **Investment returns**, separate from earned income |
| 2 | Loans can be logged as income | Excluded from earned income |
| 3 | Balance corrections are large | Left out of income and spending, but shown openly in the net worth breakdown |
| 4 | Early history can be incomplete | Spending trends start from a date you choose; net worth uses the full history |
| 5 | Rows can be dated in the future | Kept and flagged, and counted only once that date arrives |
| 6 | `Accounts` appears twice as a column | Columns are read by position, not by name |
| 7 | Mixed currencies | All maths uses the `INR` column; the original currency is shown for reference |
| 8 | Identical repeat rows can be genuine | **Never de-duplicated**, because removing them would break balances |
| 9 | Large one-off items distort trends | Kept in totals; drill-down makes them easy to see |

`Tag` and `Description` are effectively empty, so the app ignores them.

## 3. Proposed solution

One small web app on your Mac, with three parts:
1. **Import:** reads the Excel file, cleans it and classifies each row.
2. **Dashboard:** four simple screens.
3. **Chat:** a side panel on every screen.

The key design choice is **one shared set of definitions**. The dashboard and the chatbot both call the same calculation code, so they can't disagree. The AI never does the arithmetic itself.

### Definitions used everywhere

| Term | Meaning |
|---|---|
| **Earned** | All income rows, except balance corrections |
| **Spent** | `Exp.` rows, as logged |
| **Saved** | Earned minus Spent. Savings rate = Saved ÷ Earned |
| **Other corrections** | Balance corrections on any account; shown on their own and do not affect Saved |
| **Invested** | Net transfers into investment accounts |
| **Net worth** | Sum of all account balances as of today, with cards as negatives |

**Net worth breakdown:** Earned − Spent + Other corrections + Unmatched transfers = change in net worth. This explains every rupee and shows how much of the change is real versus corrections. A loan or investment gain logged as income counts in Earned (accepted gap, 2026-11-10).

### No personal data in the code

Your account and category names are not written into the code. Only the format's fixed labels are, such as `Exp.` and `Transfer-In`. On first upload, a short **setup step** shows the names found in your file and asks you to group your accounts (Bank, Cards, Wallets, Investments, Money with others, Business), and optionally your income and expense categories, in groups you name.

The answers are stored in the encrypted database and can be changed in Settings. Generic keyword suggestions speed up the account groups.

## 4. What you'll see

Header on every screen: **period picker** (This month, Last 12 months, Financial year, All, Custom), **Upload** button, Settings, Log out. Chat opens as a right-hand panel and keeps the current period as context.

1. **Overview:** tiles for Net worth, Earned, Spent, Saved and savings rate, and Invested. Below are monthly earned vs spent bars, top 5 categories, and three plain-English "worth noticing" lines computed from the data.
2. **Spending:** ranked category bars, with comparison to the previous period. Click a category to see subcategories, then the transactions. Includes a monthly trend for the chosen category.
3. **Savings & Net worth:** net worth line over time, savings rate by month, and the net worth breakdown from section 3.
4. **Accounts & Investments:** balances by group, each with a "last updated" date, and old balances flagged. Investments show value, net put in, returns and an allocation bar.

**Settings:** AI provider, key and model; account and category setup; a note on what is sent to the AI provider.

Charts stay basic: bars, lines and one allocation bar.

## 5. User flow

**First time**
1. Run one command and open the local address.
2. Create your password.
3. Drop in the Excel file.
4. Complete the short setup step.
5. Check the summary and confirm.
6. Dashboard appears.
7. Add an AI key in Settings to turn on chat. The dashboards work without one.

**Each update**
1. Export from Money Manager and AirDrop the file to your Mac.
2. Log in, click **Upload** and drop the file in.
3. Review the preview: new, changed and removed rows; the net worth change; any new accounts to group.
4. Confirm, and every screen updates.
5. Delete the export when the app reminds you.

**Upload rules**
- Each export is full history, so a new file **replaces** the old data rather than merging. This also picks up edits and deletions made in the phone app.
- The previous version is kept, encrypted, for one-click undo.
- The app rejects a file with the wrong columns.
- It warns if a file looks partial, such as starting later or having far fewer rows.
- New accounts go into "Ungrouped" until you assign them.

## 6. Architecture

```
Browser (localhost only, after login)
  Overview | Spending | Savings | Accounts | Chat panel | Settings
        |                                 |
  Next.js server on 127.0.0.1             |
    Import pipeline                 Chat orchestrator
    parse -> validate -> classify   tool loop, max ~8 rounds
        |                             |          |
        v                             v          v
    Encrypted SQLite <-- Metrics <--- Tools    AI provider adapter
    (opened by your password)  one source      Claude | OpenAI
                               of truth          |
                                       Only tool results leave your Mac
```

**Stack**
- Next.js and TypeScript in one app, with no separate backend.
- Encrypted SQLite (SQLCipher-compatible driver), with the encryption key derived from your login password. Phase 0 proves this works on your Node version.
- ExcelJS for reading the file, by column position.
- Recharts for charts and Tailwind for styling.

This suits a file of this size, and it can be hosted later without a rewrite.

**Components**

| Component | Job |
|---|---|
| Importer | Reads rows by position and keeps Excel dates as local time, so a late-night entry doesn't move into the wrong month. Validates the file, builds the preview, swaps data in one transaction, and keeps the undo copy |
| Setup step | Collects your account groups and category choices at runtime |
| Classifier | Gives each row a kind: spend, earned, investment return, loan, transfer, correction or recovered |
| Metrics layer | Pure functions for summaries, breakdowns, trends, balances, net worth and investments |
| Dashboard UI | Four screens, reading only from the metrics layer |
| AI adapter | One interface with Anthropic and OpenAI implementations, so the tools are defined once |
| Chat orchestrator | Runs the tool loop and streams the answer into the panel |
| Login | One password, set on first run. Unlocks the database, then locks it again on logout, after idle time, or when the app restarts |
| Settings store | Saves preferences and AI keys in the encrypted database. AI keys are never sent back to the browser |

**Data model:** `imports` (file history), `transactions` (raw rows plus the assigned kind), `accounts` (name and group), `category_rules`, `settings`.

## 7. Chatbot design

Your data is structured numbers, so the chatbot uses **tool calling, not document search (RAG)**. Search over rows gives unreliable totals, while tools return exact ones.

**Tools (all read-only)**
- `get_summary`
- `spending_breakdown`
- `monthly_trend`
- `find_transactions`
- `get_accounts`
- `get_net_worth_history`
- `get_investments`
- `show_chart`, which draws a small chart in the answer
- `run_readonly_sql`, a capped fallback for unusual questions, on a read-only connection

**How it behaves**
- Each question gets the definitions, account list, categories, data coverage and today's date, but **not the whole file**.
- Each answer has a "How I got this" section listing the tools used and the figures they returned.
- It says so when a figure is affected by a correction, stale balance or incomplete period.
- Suggested starter questions appear when the panel opens, such as "Why did I overspend this year?" or "How has my food spending changed?"

**Investment scope:** It can analyse your allocation, returns and contributions, and explain general concepts such as asset allocation. It won't tell you to buy or sell specific investments, and it states that it isn't a licensed advisor.

**Provider settings**
- Choose Claude or OpenAI, paste your key, and pick a model. The list comes from the provider, so it stays current.
- Claude defaults to `claude-opus-5-5`, with streaming and prompt caching for the fixed instructions. Refusal fallback will also be switched on.
- Rough cost is $0.05–0.10 per question on Opus 5.5, or about half that on Sonnet 5.5. These are estimates and will be measured during the build. API billing is separate from any Claude or ChatGPT subscription.

**Privacy**
- The app listens only on your Mac. The database and AI keys are encrypted, and only your password opens them.
- Dashboards never send data anywhere.
- Once you add a key, chat sends your question plus the tool results it needs to the provider you chose. Those can include transaction rows with notes.

## 8. How we'll build it: small phases, seven personas

Each phase is small, runs in **its own fresh session**, and ends in something you can check. Sessions run one at a time because each phase builds on the last. This session stays as the coordinator: it starts each phase and checks the result before the next one begins.

### Personas

| Persona | Owns | Output in each phase |
|---|---|---|
| **PM** | Scope and questions to you | User stories, acceptance criteria, success criteria |
| **AI PM** | AI behaviour rules | Evals, guardrails, boundaries, governance |
| **UI/UX designer** | Flows and screens | Screens on a canvas for your review, plus design questions |
| **Software engineer** | Backend and frontend | Working code with tests |
| **AI FDE** | AI pieces, end to end | Adapter, tools and chat, built to the AI PM's rules |
| **QA** | Independent testing | Test report against every acceptance criterion, plus an app sanity check |
| **Security engineer** | Security standards | Threat review before the build, sign-off after it |

**QA and Security run as separate agents with fresh context**, so they check the work independently rather than the author marking their own homework.

Each persona is a project skill in `.claude/skills/` (`persona-pm`, `persona-ai-pm`, `persona-designer`, `persona-engineer`, `persona-ai-fde`, `persona-qa`, `persona-security`). `docs/phases/README.md` has the steps, tasks and skills for each phase, and `CONSTRAINTS.md` has the quality bar.

### Phases

| # | Phase | You can check | Personas |
|---|---|---|---|
| 0 | Foundation, GitHub and security baseline | Private repo live, empty app runs, encryption proven | PM, Security, Engineer, QA |
| 1 | Sample data and import | Generated sample file loads, with rows and balances correct | PM, Security, Engineer, QA |
| 2 | Setup step logic and metrics layer | Earned, spent, saved and net worth match the sample's expected values | PM, Engineer, QA |
| 3 | User flow and screens | All screens on a canvas, approved by you | PM, Designer, Security |
| 4 | Login, app shell, upload and setup | Nothing opens without your password; upload, setup, preview and undo work | PM, Designer, Engineer, QA, Security |
| 5 | Overview screen | Tiles and charts on sample data | PM, Designer, Engineer, QA |
| 6 | Spending screen | Drill from category to transactions | PM, Designer, Engineer, QA |
| 7 | Savings and Net worth screen | Net worth history and breakdown | PM, Designer, Engineer, QA |
| 8 | Accounts and Investments screen | Groups, stale flags and allocation | PM, Designer, Engineer, QA |
| 9 | AI rules and eval set | Written boundaries and test questions, approved by you | PM, AI PM, Security |
| 10 | AI settings and provider adapter | Add a key and connect to Claude or OpenAI | PM, AI PM, Security, AI FDE, QA |
| 11 | Chat tools and evals | Tool answers match the dashboard, with evals passing | AI PM, AI FDE, QA, Security |
| 12 | Chat panel | Ask questions on any screen | PM, Designer, AI FDE, QA |
| 13 | Final hardening and release | Full regression, final security review, README, then your real-file check | All personas |

### What happens inside a phase

1. **Plan:** PM, and AI PM when relevant, writes the phase brief. All questions for you come in **one batch**. Nothing moves on until you accept the brief, even in auto mode, and any later requirement change comes back to you.
2. **Design:** the designer shows screens where the phase has UI.
3. **Threat review:** Security lists risks and required controls where the phase touches data, files, keys or AI.
4. **Build:** the Engineer or AI FDE builds to the brief.
5. **Verify:** QA tests every acceptance criterion and Security signs off. Failures go back to the builder. There's one full QA run and one narrow re-test, and a third round needs your approval.
6. **Your sign-off:** you get a short summary and the merge checklist from `CONSTRAINTS.md`, then try it.
7. **Push:** the phase is merged and pushed. The next phase starts only after your approval.

### GitHub workflow

- New **private** repo: `sohamthebuilder/personal-finance`, created in Phase 0.
- Each phase gets its own branch and pull request, containing the code, brief, test report and security sign-off.
- The pull request is merged after your sign-off, so `main` always holds approved work.
- A check runs on every pull request for tests, dependency audit and the data guard below.
- Dependabot alerts are switched on.

### Saving tokens and context

- Each session reads only the project brief, the decisions log and its own phase brief.
- Sessions start **fresh, never forked**, so figures from this conversation don't carry forward.
- Each phase ends with a short handoff note in `docs/phases/`.
- A phase that's too big to finish cleanly gets split rather than stretched.
- Each phase has a budget of half of one 5-hour limit, and stops to ask you when it gets there.
- Agents hand over at a clean stopping point before 60% of their context is used.
- Usage is recorded at the start and end of each phase.

**Not in version 1:** live market prices, bank connections, budgets and forecasts, multiple users, data editing, saved chat history, hosting.

## 9. Your data during the build

**Rule: your Excel file and anything extracted from it stay out of the project.** That covers code, tests, fixtures, docs, briefs, handoff notes, commits, GitHub, canvases and logs.

- **Format, not data:** `docs/export-format.md` records only the column layout, row types and the traps in section 2. It has no values or names from your file.
- **Sample data instead:** a script generates a made-up export with fake accounts and amounts, covering every trap. Expected results are worked out from that sample. It's generated when tests run, so no spreadsheet exists in the repo.
- **File off limits:** build sessions do not open your file. A project permission rule blocks agents from reading spreadsheets outside the repo.
- **Data guard:** `.gitignore`, a pre-commit hook and the pull request check all block `.xlsx`, `.csv` and database files.
- **Design canvas:** uses made-up sample data only.
- **Real-file check:** your file first touches the app in Phase 13, when you upload it yourself. You compare balances against Money Manager and report back only pass or fail, or the fix needed in general terms.

**One thing already outside this rule:** the analysis earlier in this conversation is stored in this session's local transcript. I won't copy it anywhere. This plan no longer holds any of it, and you can delete this session when the project is done. That analysis also passed through the AI service running this session.

## 10. Security baseline

No app can honestly be called completely secure, so "secure" here means a checklist that the Security engineer tests and signs off. It follows the OWASP Top 10 and OWASP's guidance for LLM apps.

**Data at rest**
- Encrypted database, with the key derived from your password using a slow hashing method (Argon2id or scrypt).
- The password and key are never stored on disk. The key stays in memory only while you're logged in.
- AI keys and the undo copy are encrypted too. Uploaded files are deleted once imported.
- Phase 0 checks that FileVault is on.

**Access**
- The server binds to 127.0.0.1 only and rejects unexpected Host and Origin headers, which blocks attacks from websites you visit.
- **Simple login:** one password and no username, email or two-factor step.
- Every page and API route needs a valid session, so nothing is readable before login.
- Session cookie is HttpOnly and SameSite=Strict.
- Auto-lock after 15 minutes idle, on logout, and on app restart.
- Wrong attempts are slowed down progressively.

**What the login can't cover**
- **Forgotten password:** there's no reset, because that would be a back door. You'd start fresh and re-upload your latest export, then redo setup and re-enter AI keys.
- **Export files:** the app can't protect Excel files left on your Mac. Your export is on your Desktop now, so anyone at your laptop can open it. After each import, the app will remind you to delete the export.
- **A compromised Mac:** malware running while you're logged in could read what the app can read. FileVault and your Mac password remain the first line of defence.

**Web app**
- Strict Content Security Policy, CSRF protection and secure headers.
- No third-party scripts, fonts or analytics. Next.js telemetry is turned off.
- The only outbound connections allowed are to the AI provider you chose.

**Uploads**
- Size and zip-bomb limits, and strict column checks.
- Cell text is always treated as data, and file names are never used as paths.

**AI**
- Your Notes text counts as untrusted input, so it can't change the chatbot's instructions.
- All tools are read-only. The SQL fallback is limited to approved views, with row and time caps, and can't reach settings.
- The chatbot has no web access.
- Chat output is sanitised and remote images are blocked, so data can't leak through a link or image.
- A local log shows exactly what was sent to the provider, and a spend cap limits cost.

**Code and repo**
- Private repo, pinned dependencies, audit checks on every phase, and secret scanning.
- Logs never contain amounts, notes or keys.

## 11. How we'll know it's right

**Automated checks on the generated sample file**
- Row counts and transfer pairs match exactly.
- Closed accounts come to zero.
- Future-dated rows are excluded from today's net worth, then included once their date passes.
- Earned, spent, saved and investment returns match the sample's expected values.
- A market loss doesn't reduce earned income.
- Identical repeat rows are kept.
- Net worth breakdown adds up exactly for any period.

**Upload checks**
- Same file again shows no changes.
- An edited copy shows the right differences, and undo restores the previous data.
- Wrong or partial files are stopped or warned about.

**Chat checks**
- About 10 sample-data questions with known answers, run on both Claude and OpenAI, must match the dashboard exactly.
- Test questions try to extract instructions through Notes text, and to get buy or sell calls. Both must fail.

**Security checks**
- With the app locked, the database can't be read and no page or API route returns data.
- A search of the repo and its history finds no spreadsheets, databases or secrets.

**App checks**
- Each screen is opened in a real browser at desktop and narrow widths.

**Your check (Phase 13)**
- Upload your real file, then compare 5 account balances and the total against the Money Manager app. This is the one test only you can do, and any gap is the first thing to fix.

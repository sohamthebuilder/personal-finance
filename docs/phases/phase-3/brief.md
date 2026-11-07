# Phase 3 brief: User flow and screens

Owner: PM. Source: `docs/PROJECT_BRIEF.md` sections 3, 4, 5 and 10, `docs/phases/phase-2/handoff.md`, and the screen conditions in the Phase 1 and Phase 2 `security.md` files.

## Goal

Every screen in the app is designed and agreed before any of it is built. After this phase, each screen has its states, wording and motion notes written down, the key flows can be seen as previews with made-up data, and Security has reviewed the flows. No app code changes in this phase.

## Personas and budget

- **Personas:** PM, Designer, Security. There's no Engineer or QA, because nothing is built. Security reviews the design as a fresh agent.
- **Budget:** half of one 5-hour limit, unless the owner agrees otherwise. That's 50 points of use across windows, so the stop-and-ask line is 58% if the window doesn't reset.
- **Budget change:** on 2026-11-07 the owner raised the budget by 40 points, to 90. Their words were "yes", in the session running the phase, and "Yes, add 40 points", in the session finishing it. The stop-and-ask line is now 98% if the window doesn't reset.
- **Usage at start:** 5-hour 8%, weekly 52%.

## Owner approval

The owner fills this through their reply in chat. Nothing after the brief starts until this is complete.

- **Status:** Approved
- **Date:** 2026-11-07
- **Owner's words:** "yes", to the updated brief. Their answers were: "1. light and dark 2. agreed, but have a delete my data in settings. 3. by default, current month 4. yes 5. agreed"
- **Password rule change:** on 2026-11-07 the owner accepted Security's rule of at least 15 characters plus a common-password check, in their words "Approve all four".
- **Later changes approved:** 2026-11-07, asked for by the owner after the first preview: "the design made was too bad. looks like a prototype", redesign with the design-taste-frontend skill, and "do we have design system in place? if not, how will the personas follow the future changes? lets have them in place." This added AC-22 and widened AC-20. Later on 2026-11-07, the owner said "the sidebar is collapsible and expandable" and asked for the look, font and colours of tasteskill.dev. This added AC-23.

## User stories

1. As the owner, I want to see and agree every screen before it's built, so changes are cheap and nothing surprises me later.
2. As the owner, I want to know what each screen does when something goes wrong or there's no data, so the app never leaves me stuck or guessing.
3. As the owner, I want the app to feel calm and clear, so I can read my money at a glance.
4. As the engineer in later phases, I want exact states and wording, so I build what was agreed without guessing.

## Screens to design

| # | Screen | Built in |
|---|---|---|
| 1 | Create password | Phase 4 |
| 2 | Log in, including slow-down after wrong attempts and forgotten password | Phase 4 |
| 3 | Locked, after 15 minutes idle or a restart | Phase 4 |
| 4 | First upload | Phase 4 |
| 5 | Setup step: group accounts, pick returns and loan categories, pick the reimbursement account | Phase 4 |
| 6 | Summary and confirm | Phase 4 |
| 7 | Shared header: period picker, Upload, Settings, Log out | Phase 4 |
| 8 | Update upload: preview of new, changed and removed rows, net worth change, new accounts, confirm, undo, delete-the-export reminder | Phase 4 |
| 9 | Overview | Phase 5 |
| 10 | Spending, down through category, subcategory and transactions | Phase 6 |
| 11 | Savings & Net worth | Phase 7 |
| 12 | Accounts & Investments | Phase 8 |
| 13 | Settings: account and category setup | Phase 4 |
| 14 | Settings: delete my data | Phase 4 |
| 15 | Settings: AI provider, and the note on what is sent | Outline only, see answer 5 |
| 16 | Chat panel | Outline only, see answer 5 |

## Acceptance criteria

The design goes in `docs/phases/phase-3/design.md`. "Screen" means each row in the table above.

**Flows**
- **AC-1** The first-time flow covers all 7 steps in brief section 5, in order, with each step linked to its screen.
- **AC-2** The update flow covers all 5 steps in brief section 5, in order, with each step linked to its screen.
- **AC-3** Each flow shows what happens at every point it can go wrong: wrong password, wrong file, partial file, cancelling, and the app locking partway through a task.

**Screens and states**
- **AC-4** Every screen has a written spec: what's on it, what each control does, and where it leads.
- **AC-5** Every screen lists its loading, empty, error and stale-data states, or says in one line why a state can't happen there.
- **AC-6** Each upload rule in brief section 5 has a named state with its exact wording: replace, undo, wrong columns, partial file and new accounts in "Ungrouped". So does each import refusal the code already has.
- **AC-7** The auto-lock, wrong-password slow-down and forgotten-password cases from brief section 10 each have a state with exact wording. Forgotten password is explained on the login screen, with one Terminal command to paste and no wipe button there.
- **AC-7a** Delete my data in Settings asks for your password and a clear confirmation. It says plainly that this can't be undone and lists what goes: all data, setup answers, the undo copy and AI keys. It also says export files on your Mac aren't touched. It ends on Create password.
- **AC-7b** The app opens on This month at each login, and a period change lasts until logout. This month has a designed state for when it has few or no rows, such as the first days of a month.

**Content**
- **AC-8** Every money label matches the definitions in brief section 3 and the code from Phase 2. The net worth breakdown shows every line, including Unmatched transfers.
- **AC-9** Each screen in brief section 4 has everything that section lists for it.
- **AC-10** Charts use only bars, lines and one allocation bar.
- **AC-11** The design settles the screen questions Phase 2 left open: a label for the blank category, what to show when the savings rate can't be read sensibly (F-2), and how "All" is shown as a period (F-4).

**Quality**
- **AC-12** Every screen has notes for 1280, 375 and 320 pixels wide, with no sideways page scroll.
- **AC-13** Every screen has a keyboard order and a visible focus style. The app follows the Mac's light or dark setting, and both colour sets meet 4.5 to 1 contrast for text and 3 to 1 for chart marks and controls.
- **AC-14** Every movement has a motion note that gives its cause and duration, and an end state that still makes sense with reduced motion. Nothing loops.

**Previews**
- **AC-15** There are previews of three key flows: first-time setup, update with undo, and changing the period on Overview.
- **AC-16** Previews use only made-up data and no bank or card logos. All three are shown in light, and the Overview preview is also shown in dark.
- **AC-17** `package.json` and `package-lock.json` are unchanged. stageshow stays outside this project's dependencies (D-017).

**Security and close**
- **AC-18** Security reviews the flows before the owner signs off the screens, and every Blocker and Major is fixed in the design.
- **AC-19** The design meets the conditions that touch screens: text from the file is shown as plain text only and kept out of web addresses (conditions 14 and 27), errors use fixed wording (condition 24), and delete my data clears the setup tables too (condition 28).
- **AC-20** The phase changes only files under `docs/` and `.claude/skills/`, plus `CLAUDE.md`, and `npm test`, `npm run typecheck`, `npm audit` and `npm run guard` all pass.
- **AC-21** The owner approves the screens in chat, and that's recorded in `handoff.md`.
- **AC-22** `docs/design-system/` holds the rules, the code, the icons and a live gallery. Every preview is built from it, and the persona skills that touch screens read it.
- **AC-23** The sidebar collapses to icons and expands again, by mouse and keyboard, and each collapsed item still shows its name on hover or focus.

## Good enough

- **Accepted gaps:**
  - Previews show how a flow looks and moves, but they aren't working screens. Only the three key flows get previews. The other screens are written specs with a simple static layout.
  - Later phases can adjust small details while building. Anything that changes what a screen does comes back to the owner.
  - Contrast is checked on both colour sets, not on every preview frame.
  - Only the Overview preview is shown in dark. The dark colours for other screens are covered by the colour set.
- **Test limit:** there's no QA round, because nothing is built. The session running the phase checks each criterion against `design.md` and records the result. Security is the independent check.

## Out of scope

- Any app code, or any change to tests or packages.
- The rules behind the "worth noticing" lines (Phase 5). The design only shows where they sit.
- How old a balance must be to get flagged (Phase 8). The design only shows how the flag looks.
- AI behaviour rules, what the chatbot says, and its tools (Phases 9 to 11).
- Any feature that isn't in `docs/PROJECT_BRIEF.md`.

## Tasks

Riskiest first, in thin slices.

1. Designer: flow maps with every failure point, including locking partway through a task.
2. Designer: look and feel, colours, type and the shared header.
3. Designer: login, upload and setup screens, then the first-time setup preview, for an early owner look.
4. Designer: the four dashboards, Settings and the rest of the specs.
5. Security, fresh agent: threat review of the flows and wording.
6. Designer: fix findings and finish the remaining previews.
7. Session running the phase: check each criterion, run the merge checklist, and ask the owner to sign off.

## Owner-only steps

1. Look at the early preview and say what to change.
2. Look at the finished previews and approve the screens in chat.

Nothing needs running. Each preview opens for you in the app.

## Questions for the owner

All answered by the owner on 2026-11-07.

1. **Light or dark:** follow the Mac's light and dark setting. This changes the default.
2. **Forgotten password:** the login screen explains what to do, and the wipe is one command pasted into Terminal. There's no wipe button on the login screen. **Settings does get a "delete my data" action**, which changes the default.
3. **Which period shows first:** This month. This changes the default.
4. **Money and dates:** Indian digit grouping (₹12,34,567), no paise on tiles and charts, and a financial year from April to March.
5. **Chat and AI settings:** design only the outline now, meaning where the panel sits, how it opens, and what shows when no AI key is set. The detail waits for Phase 12.

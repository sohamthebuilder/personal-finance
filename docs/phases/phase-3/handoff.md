# Phase 3 handoff

## Usage

| When | 5-hour | Weekly |
|---|---|---|
| Start (2026-11-07) | 8% | 52% |
| After the redesign (2026-11-07) | 37% | 56% |
| After the tasteskill.dev look (2026-11-07) | 52% | 58% |
| Fresh session start (2026-11-07) | 54% | 58% |
| After specs, previews and Security's review (2026-11-07) | 77% | 62% |
| After fixes and Security's re-check (2026-11-07) | 94% | 64% |
| End of phase, after the README (2026-11-07) | 97% | 64% |
| After Security's fixes and criteria check (2026-11-07) | 91% | 64% |

## State

Brief approved by the owner on 2026-11-07. The owner rejected the first preview as looking like a prototype, and asked for a redesign and a design system. The owner then called the result okay, and asked for the look of tasteskill.dev and a collapsible sidebar (D-023). The owner approved the look on 2026-11-07, in their words "Approve the look". That covers the design system and the first-time flow: `docs/design-system/` and `previews/first-time.html`. `design.md` part 1 matches the redesign. Nothing is committed.

Now done: `design.md` has screens 1 to 16 with every change from `security.md` (2 Blockers, 6 Majors, 9 Minors). All three previews exist and match the new wording. Nothing is committed.

Committed and pushed to `phase-3` at the owner's request, leaving out `skills-lock.json`. Next: a pull request and merge, only when the owner asks.

**Closed out by the session finishing the phase.** AC-6, AC-8, AC-9 and AC-23 were finished after the fix run stopped at 91%. Security's re-check is in `security.md`. Its ruling on S3-16 is in screen 1's Fields rule. The owner has been asked to sign off.

## Checks (2026-11-07)

| Check | Result |
|---|---|
| `npm test` | 335 passed, 0 failed |
| `npm run typecheck` | Passed |
| `npm audit` | 0 vulnerabilities |
| `npm run guard` | 145 files checked, nothing blocked |
| Sideways scroll, all three previews | None at 1280, 375 and 320, light and dark, every preview menu state |
| Screenshots, password and upload steps | Seen at 1280, 375 and 320, light and dark. No faults. The 320 shots came back small, so they show layout, not fine detail |
| Gallery at 320 | No sideways scroll, seen at the top and middle only |
| `accent` on note colours | Light failed: 4.49, 4.42 and 4.29 to 1. Fixed, now 4.81, 4.74 and 4.60. Dark passed: 6.08, 5.85 and 6.28 |

## Criteria results

| Criterion | Result | Reason |
|---|---|---|
| AC-1 | Pass | All 7 steps in order, each linked to a screen |
| AC-2 | Pass | All 5 steps in order, each linked to a screen |
| AC-3 | Pass | Wrong password, wrong file, partial file, cancelling and locking are covered, plus half-finished deletes in the new start-up table |
| AC-4 | Pass | Every screen has a spec. Screens 15 and 16 are outlines, as the brief allows |
| AC-5 | Pass | Each screen lists its states or says why one can't happen. Screens 15 and 16 name theirs for Phases 10 to 12 |
| AC-6 | Pass | Upload rules have named states. All 26 refusals in `errors.ts` are now listed word for word under "Import refusals", taken from the file by script |
| AC-7 | Pass | Lock, slow-down and forgotten-password wording is in, with one command and no wipe button |
| AC-7a | Pass | Password, tick box, lists what goes and what stays, ends on Create password. A half-finished delete can now finish |
| AC-7b | Pass | Opens on This month. Few-row and no-row states are on screen 9 |
| AC-8 | Pass | Compared with brief section 3 and the `PeriodMetrics` and `NetWorthBreakdown` fields. Every line shows, including Unmatched transfers |
| AC-9 | Pass | Compared with brief section 4, screen by screen. Everything listed is on its screen. AI settings and chat are outlines, as agreed |
| AC-10 | Pass | Only bars, lines and one allocation bar |
| AC-11 | Pass | Blank labels, savings rate (F-2) and "All" (F-4) are settled |
| AC-12 | Pass | Every screen has width notes. Measured clean on all three previews |
| AC-13 | Pass | Keyboard orders are written. The `accent` fix is checked by script. The other colour pairs weren't re-run: only light `accent` changed, and it got darker |
| AC-14 | Pass | Motion notes give cause, length and the reduced-motion result. Nothing loops |
| AC-15 | Pass | All three previews exist |
| AC-16 | Pass | Made-up data, no logos. All work in light, and Overview in dark |
| AC-17 | Pass | `git diff` shows `package.json` and `package-lock.json` unchanged |
| AC-18 | Pass | Security's narrow re-check found S3-1 to S3-8 in as written, and the owner accepted S3-3 |
| AC-19 | Pass | The text rule is in Foundations (14, 27), fixed wording stays (24), whole files are removed (28) |
| AC-20 | Pass, once committed as agreed | The four checks pass. The owner chose to leave `skills-lock.json` out of the commit |
| AC-21 | Pass | The owner approved the screens in chat on 2026-11-07: "Approve all four" |
| AC-22 | Pass | Rules, code, icons and gallery are there, and the previews sync from them. The designer skill reads it. The other persona skills changed but weren't read this run |
| AC-23 | Pass | Tested on the preview. The button collapses the sidebar to 72px and expands it to 256px. It's a real button, so the keyboard works, its name changes with its state, and collapsed links show their names on hover and focus |

**`skills-lock.json` (AC-20).** It has one new entry, `design-taste-frontend`, from `Leonxlnx/taste-skill`, with its hash. That's the skill the owner asked for. It's outside `docs/`, `.claude/skills/` and `CLAUDE.md`, so AC-20 fails as written. It was left as it is. The owner decides whether to keep it in this phase, or leave it out of the commit.

**System spacing fixes (small, noted as the README requires).** `.shell` has `overflow-x: clip`, so a step change can't flash a scrollbar. At 480px or less, `.seg span` is tighter and `.note > .btn-row` wraps under the text.

**System colour change.** Light `accent` went from `#C2410C` to `#BA3E0B`, so Undo and Dismiss pass on the note colours. Dark is unchanged. The README says any change to the look needs the owner's yes, so it's listed below. `--glow-1` keeps the old colour.

**Waiting for the owner's yes: S3-3.** The 15-character minimum and common-password check are in `design.md` and `first-time.html`, but the owner hasn't answered. Security's merge condition needs that answer.

**Minors.** S3-9 to S3-17 are all in `design.md`. Three things for the re-check:
- S3-15 gave no wording for the new warning line, so the Designer wrote "Most of your current accounts aren't in this file." The preview's sample doesn't show that line.
- S3-16 says the field empties on error. `design.md` uses those words. The preview hides the password on submit, but keeps the text on a page check such as "too short", so the owner can fix it. Security should say whether that's allowed.
- S3-13 says a restart opens on Overview. `design.md` adds that an unfinished first-time flow still returns to its step, since Overview can't show before the summary.

The sentence on row-number errors (condition 24) moved to "Screen errors", because Security's new text rule leaves it out.

The session's memory passed the 60% limit during the redesign, so the rest of the phase should run in a fresh session or agent. It starts from `brief.md`, this file, `design.md` and `docs/design-system/README.md`.

**Budget stop, 2026-11-07:** the fresh session started at 54%, which is 46 of the 50 budget points and 4 short of the 58% stop line. Work stopped before step 1 to ask the owner. Nothing else changed. The owner then raised the budget by 40 points, to 90: their words were "yes", in the session running the phase, and "Yes, add 40 points", in this session. Work carried on.

## Owner sign-off, 2026-11-07

The owner approved the screens in chat, in their words "Approve all four". That covers the screens and the four recommended answers: the 15-character password with a common-password check (S3-3), the darker light `accent`, leaving `skills-lock.json` out of the commit, and keeping the design additions in the list below. Nothing is committed yet, and the GitHub checks run after a commit.

**README, added after sign-off.** On 2026-11-07 the owner asked for a product README with screenshots, and for the commit and push. `README.md` sits outside the paths AC-20 lists, so this is an owner-requested addition to the phase, and it changes no app code. The images are in `docs/images/`, taken from the previews with made-up data, and the README says they aren't the running app.

## Design choices confirmed

- **Password rule (S3-3):** at least 15 characters plus a common-password check, as Security proposes. Approved.
- **Accent colour:** light `accent` is slightly darker, for contrast on notes. Approved.
- **`skills-lock.json`:** keep it in this phase, or leave it out of the commit.
- **Screen 8, "New income categories":** a design addition, because a new returns category would otherwise raise Earned without anyone noticing.
- **Screen 13, three-way Settings:** Setup, Your data and AI is a design addition.
- **Trends start date:** a Phase 2 setup answer that the brief's screen list doesn't name. It sits in setup part 3, as a month and year.
- **Overview extras:** a small net worth line and a net worth change sit beside the figure. Neither is in the brief's Overview list. Both use existing numbers, and the owner decides whether to keep them.
- **Navigation:** a side list that collapses to icons, and a tab bar on narrow windows. The collapsed choice is remembered.
- **Font in the app:** Phase 4 adds the Google Sans Flex file to the app's own files. Its Security review needs to cover this.

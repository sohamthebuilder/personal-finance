# Constraints

The quality bar for every phase. Don't weaken this file to make a change pass. Only the owner can change it.

## Always

- No real financial data anywhere. Never open a spreadsheet outside this repo.
- No secrets in code, tests, docs, logs or commit messages.
- No skipped or deleted tests without a written reason.
- No weakened checks to get a pass.
- Every acceptance criterion has a recorded result.
- No design, review or build starts until the owner has accepted the PM and AI PM work in chat and that's recorded in the brief. This holds in auto mode. Changed requirements need accepting again.

## Checks that must pass before merge

| Check | Command |
|---|---|
| Tests | `npm test` |
| Types | `npm run typecheck` |
| Dependency audit | `npm audit` |
| Data guard | `npm run guard` |
| Pull request check | All three GitHub checks pass on the final commit |

## Finding levels

| Level | Meaning | What happens |
|---|---|---|
| Blocker | Fails a criterion, or could expose data, a key or a password | Fix before merge |
| Major | A real problem inside this phase's scope | Fix before merge, or the owner accepts it in writing |
| Minor | Small, unlikely, or outside this phase's scope | Log it in the handoff. No extra test round |

## Budget and limits

- **Phase budget:** half of one 5-hour limit. At that point, stop and ask the owner.
- **Test rounds:** one full QA run and one narrow re-test. A third needs the owner's approval.
- **Memory:** hand over to a fresh agent at a clean stopping point before 60% of its context is used.
- **Accepted gaps:** each phase brief lists its own. Earlier gaps stay in that phase's `security.md`.

## Merge checklist

Show the owner this list before asking to merge. An open item means the answer is "not yet", unless the owner accepts it in writing.

- [ ] The owner's approval of the brief, and of any later requirement change, is recorded
- [ ] Every criterion has a result, and no Blocker or Major finding is open
- [ ] All checks pass on the final commit
- [ ] Every "before merge" security condition is met, with evidence
- [ ] Every owner-only step is done, with its output recorded

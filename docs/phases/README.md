# Phases guide

How to run each phase. Scope and acceptance criteria go in each phase's `brief.md`, made from `TEMPLATE.md`.

## Steps in every phase

| Step | Who | Skill | Model |
|---|---|---|---|
| 1. Write the brief and question batch | PM, plus AI PM for AI phases | `persona-pm`, `persona-ai-pm` | Top model |
| **Owner approval gate** | Owner | Stop and wait, even in auto mode | None |
| 2. Design screens, where there's UI | Designer | `persona-designer` | Top model |
| 3. Threat review, where marked | Security | `persona-security` | Top model |
| 4. Build | Engineer or AI FDE | `persona-engineer`, `persona-ai-fde` | Top model |
| 5. Full QA run | QA, fresh agent | `persona-qa` | Top model |
| 6. Fixes | Engineer or AI FDE | Same as step 4 | Top model, medium effort for simple fixes |
| 7. Narrow re-test | QA, fresh agent | `persona-qa` | Sonnet (trial in Phase 1) |
| 8. Security sign-off, where marked | Security, fresh agent | `persona-security` | Top model |
| 9. Merge checklist and owner sign-off | Session running the phase | `CONSTRAINTS.md` | Any |

**Owner approval gate:** everything from the PM and AI PM needs the owner's acceptance in chat before the next step starts. That includes Phase 9's AI rules and evals, and any requirement change during a phase. See D-018.

**Sonnet trial:** in Phase 1, compare what the Sonnet re-test finds with what the top model would be expected to catch. Keep it only if quality holds.

## Phase plan

| # | Phase | Personas | Main tasks | Security | stageshow |
|---|---|---|---|---|---|
| 1 | Sample data and import | PM, Security, Engineer, QA | Sample generator, parser, row and balance checks | Yes | No |
| 2 | Setup logic and metrics | PM, Engineer, QA | Setup rules, earned, spent, saved, net worth | No | No |
| 3 | User flow and screens | PM, Designer, Security | All screens with states and motion notes | Yes | Yes: previews of key flows |
| 4 | Login, shell, upload, setup | PM, Designer, Engineer, QA, Security | Password gate, shell, upload, preview, undo | Yes | Rules only |
| 5 | Overview screen | PM, Designer, Engineer, QA | Tiles, charts, "worth noticing" lines | No | Rules only |
| 6 | Spending screen | PM, Designer, Engineer, QA | Category bars, drill-down, trend | No | Rules only |
| 7 | Savings and Net worth | PM, Designer, Engineer, QA | Net worth line, savings rate, breakdown | No | Rules only |
| 8 | Accounts and Investments | PM, Designer, Engineer, QA | Groups, stale flags, allocation bar | No | Rules only |
| 9 | AI rules and evals | PM, AI PM, Security | Boundaries, eval set, pass marks | Yes | No |
| 10 | AI settings and adapter | PM, AI PM, Security, AI FDE, QA | Key storage, provider adapter, connection test | Yes | No |
| 11 | Chat tools and evals | AI PM, AI FDE, QA, Security | Tools, outbound limits, eval run | Yes | No |
| 12 | Chat panel | PM, Designer, AI FDE, QA | Right-hand panel on every screen | No | Rules only |
| 13 | Final hardening and release | All | Full regression, final security review, README, real-file check by the owner | Yes | Optional: README demo |

"Rules only" means the designer applies the motion rules in `persona-designer`, without loading stageshow.

Phases marked "No" under Security still get a sign-off if they turn out to touch data, files, keys or AI.

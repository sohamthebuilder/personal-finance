# Design system

The one source for how the app looks and behaves. Every screen, preview and later phase uses it. To see it live, open `gallery.html`.

| File | What it holds |
|---|---|
| `README.md` | The rules, and how to change them |
| `system.css` | Every colour, size and component, as real code |
| `icons.svg` | The icon set |
| `gallery.html` | Every component, in light and dark |
| `sync-previews.mjs` | Copies `system.css` and `icons.svg` into the gallery and previews |

## The bar

The app should feel like a finished product you'd pay for, calm and exact, never like a prototype. Before showing any screen, ask: would this pass next to tasteskill.dev? If it wouldn't, it isn't done.

**Signs of a prototype, which are never allowed:**
- A browser-default dropdown, date field or dialog
- A form in a box, floating in the middle of an empty page
- A screen with no app frame
- Words with no icon or hierarchy where a person scans
- Five boxes of equal weight, so the eye has nowhere to land
- "Preview", "sample" or test notes inside the screen itself

## Principles

1. **Numbers lead.** The figure is the loudest thing on the screen, and everything else steps back.
2. **One thing matters most.** Each view has one clear focus and one filled button.
3. **Mostly neutral.** 90 to 95% of a screen is neutral. Colour carries meaning, never decoration.
4. **One way to do each thing.** One button set, one card, one picker, one radius family. Don't add a second.
5. **Every state is designed.** Loading, empty, error and stale data get as much care as the normal view.
6. **Calm motion.** Things move because something changed. Nothing loops.

## Colour

Warm and quiet: cream paper, espresso ink, white cards, and orange used sparingly. The direction comes from tasteskill.dev (D-023). Use tokens only, and never write a colour value in a screen. The app follows the Mac's light or dark setting.

| Token | Use |
|---|---|
| `bg`, `surface`, `surface-2`, `sunk` | Cream page, white cards, soft areas, segmented tracks |
| `line`, `control` | Dividers, control borders |
| `ink`, `ink-2` | Main text, secondary text |
| `action`, `on-action` | The main button: espresso on light, cream on dark |
| `accent`, `accent-soft` | Orange labels, links and focus |
| `earned`, `spent` | Earned is warm taupe, Spent is orange |
| `gain`, `gain-soft` | Figures going up, success notes |
| `warn`, `warn-soft`, `danger`, `on-danger`, `danger-soft` | Warnings, errors and refusals |
| `rail`, `rail-ink`, `rail-ink-2`, `rail-line`, `rail-gain`, `glow-1`, `glow-2` | Espresso panels: task rail, sidebar, hero card, and their orange glow |
| `tip`, `on-tip` | Chart tooltips and sidebar labels |

**Orange is never the main button.** It would read as a warning beside errors. It's kept for Spent, labels, focus and the one lit thing on a screen.

**The glow** sits only on espresso panels, low in a corner, away from text. Never put it behind a figure or on a light surface.

**Contrast:** every text pairing passes 4.5 to 1, and chart marks and control borders pass 3 to 1, in both themes, including text over the glow. Last checked by script on 2026-11-07. Check again after any colour change.

## Type

**Google Sans Flex**, set tight. Headings and figures use 600 weight with negative letter spacing, which gives the app its confident look. It's an open-licence font. The app must serve it from its own files, never from Google (D-023). Sentence case everywhere. Nothing is smaller than 13px, except chart axis labels at 12px.

| Token | Size | Use |
|---|---|---|
| `--t-display` | 44px | The one lead figure on a screen |
| `--t-h1` | 32px | Screen title |
| `--t-figure` | 26px | Other key figures |
| `--t-h2` | 18px | Card titles |
| `--t-body` | 15px | Text and controls |
| `--t-label` | 13px | Labels, hints, field errors |

## Space and shape

- **Spacing:** 4, 8, 12, 16, 24, 32, 48, 64 (`--s-1` to `--s-8`). No other values.
- **Radius:** controls 11, pop-ups 14, cards 18.
- **Heights:** controls 44, compact controls 36, text fields 48.
- **Depth:** cards have no border. A faint ring and a soft warm shadow lift them off the cream. Pop-ups and dialogs float higher.
- **Nesting:** two boxes deep at most.

## Layouts

| Layout | Use | Parts |
|---|---|---|
| **Task** | Password, login, locked, first upload, setup, summary | `.task`: dark `.rail` with step list, content in `.task__body`. On narrow windows the rail becomes a top bar with a progress line |
| **Shell** | Every screen after setup | `.shell`: espresso `.side` navigation, `.top` header with period, Upload, Settings and Log out, then `.page`. The sidebar collapses to icons with `.is-collapsed`, and the choice is remembered. Collapsed links show a label on hover or focus. On narrow windows the side becomes `.tabbar`, and Settings and Log out move into a menu |

Dashboards use `.grid` (12 columns). Lead with one espresso `.card--hero` panel beside a group of smaller figures. Works at 1280, 375 and 320 pixels wide, with no sideways page scroll.

## Components

All are in `system.css`, and shown in `gallery.html`.

| Need | Use | Rule |
|---|---|---|
| Action | `.btn`, `--primary`, `--danger`, `--quiet`, `--sm`, `--icon` | One primary per view. Labels name the action |
| Text link | `.link` | In-line actions like Dismiss |
| Text field | `.field`, `.input`, `.input-wrap` | Label above, hint below |
| Tick box | `.check` | Never the browser's own look |
| Choose one of many | `.picker`, `.pop` | Replaces every browser dropdown. Arrow keys move, Enter picks, Esc closes |
| Choose one of two or three | `.seg` | Selection slides across |
| Message on the page | `.note`, `--ok`, `--warn`, `--danger` | Icon first. Text says what happened, then what to do |
| Error on a field | `.field__error`, `.is-bad` | Sits on the field, clears when fixed |
| Figure | `.figure`, `--display`, `.delta` | One display figure per screen |
| Lead panel | `.card--hero` | One per screen at most |
| Group of figures | `.card.stats`, `.stat` | One card split by lines, not separate boxes |
| Rows | `.list`, `.pick-rows`, `.pick-row` | Lines between rows, no boxes |
| Progress | `.meter` | Named stage beside it |
| Command to copy | `.cmd` | One fixed line in the code font, with a small Copy button that reads "Copied" for 2 seconds. The text stays selectable if copying fails |
| Confirmation | `.scrim`, `.dialog` | Say exactly what happens. Never the browser's own dialog |
| Icon in a tile | `.glyph` | Neutral, for account groups and files |
| Long list in groups | `.folds`, `.fold`, `.fold__btn`, `.fold__body`, `.fold__empty` | Each group is one button with a name, a short count and a chevron, closed unless it needs the owner first. Enter or Space opens it. One level only, never a group inside a group. A row whose answer changes stays where it is, with a `Moved to …` tag, and settles into its new group when a group opens or closes, the search changes or the page loads |
| Find in a list | `.search`, `.search__count`, `.search__none` | Icon first, a hidden label, a Clear button once there's text. Typing narrows the list at once and opens every group with a match. Esc clears. The count is a polite live region |
| Name something in place | `.inline-edit`, `.add-row` | Label above, the field with its buttons beside it, then the hint or error. Enter saves, Esc cancels. The error sits under the field and clears once it's fixed |
| Save on a long page | `.savebar` | The page's one primary button. It sticks to the bottom of the window only while there's something to say (unsaved, saved, couldn't save), otherwise it sits at the end of the page |
| Drill-down path | `.path` | A `nav` with an `ol`. Earlier steps are `.link` buttons, the last is plain with `aria-current`. Goes back up, like the browser's Back |
| Ranked rows that open | `.ranks`, `.rank`, `.rank__line`, `.rank__name`, `.rank__meta` | The whole row is one button: name and amount, a `.meter` bar, then share and change. Lines between rows. A right chevron moves 2px on hover |
| Transactions | `.txns`, `.txn`, `.txn__note`, `.txn__amt`, `.txn__meta`, `.txn__orig` | Note and amount with paise, then date and account. Long notes wrap. File text is plain text only |
| Loading | `.skel-wrap`, `.skel`, `--label`, `--figure`, `--display`, `--line`, `--spark`, `--chart`, `--row` | Blocks at the real content's shape, in `sunk` (or `rail-line` on the hero). No shimmer, no movement. Only shows when a load takes 200ms or more. The wrapper has `aria-busy="true"` and a "Loading" label |

## Charts

Only bars, lines and one allocation bar. Hairline gridlines, three at most. Axis labels in short form (`₹1L`). Earned is `earned` and Spent is `spent`. Hovering a bar dims the others and shows exact figures in a dark tooltip. Every chart has a text label for screen readers. A chart with more bars than fit (bars under 7px apart) scrolls sideways inside its card with `.chart--scroll`, opens at the latest month, and keeps its axis still beside it in `.chart-split`. The page itself never scrolls sideways.

## Icons

From `icons.svg`, on a 24 grid with a 1.75 line, rounded ends and no fill. To add one, draw it to match. No emoji, no sparkles, and no bank or card logos.

## Motion

| Movement | Cause | Duration | Reduced motion |
|---|---|---|---|
| Hover on a button | Pointer | 140ms, up 1px | Colour only |
| Press | Click | 90ms, down, scale .985 | None |
| Step change | Owner moved on or back | 180ms fade, 8px in the direction of travel | Instant |
| Pop-up opens | Click | 200ms, drops 6px | Instant |
| Field error | Failed check, or fixed | 140ms fade, no shake | Instant |
| Segment slides | New choice | 240ms | Instant |
| Sidebar collapses or expands | Owner clicked | 240ms, charts redraw at the end | Instant |
| Number changes | Data or period changed | 500ms roll from old value to new | New value |
| Bar changes | Data or period changed | 400ms from old length to new | New length |
| Group opens | Click, Enter or Space | 200ms: body fades in and drops 6px, chevron turns | Instant |
| Group closes | Click, Enter or Space | Body goes at once, chevron turns 200ms | Instant |
| Search narrows | Typing | Rows hide and show at once, no movement | Same |

One easing for everything: `cubic-bezier(.2, .8, .2, 1)`. No bounce. Nothing loops, and skeletons don't shimmer. Numbers roll up from zero only once, the first time the dashboard appears. Sliding content is clipped, so a step change can't flash a scrollbar.

## Writing

- Plain words, short sentences, and a warm, direct tone.
- Titles are short: "Group your accounts", not "Account grouping configuration".
- Errors say what happened and what to do next. They never contain text from the file.
- Buttons say what they do: "Looks right", "Start over".

## Money and dates

`₹12,34,567` Indian grouping. No paise on tiles and charts, and paise on transaction rows. A real minus sign (`−₹2,400`), and never colour alone. Dates read `7 Nov 2026`. The financial year runs April to March.

## Accessibility

Every control works by keyboard, with a 2px `accent` focus ring. Tab follows reading order. Colour is never the only signal. Everything still makes sense with reduced motion.

## Build rules

- **Phase 4 starts by copying `system.css` into the app**, as an ordinary stylesheet, and adding the font file to the app's own files.
- **No `style="..."` in server-rendered HTML** (D-010). Use classes, or set sizes from script after load. Chart sizes use SVG attributes. Check this in plain Chrome on a page the app serves.
- **Text from the file** is shown as plain text only, and never used in a web address, log or error (conditions 14 and 27).

## Previews

Previews are real-size pages you can click, in `docs/phases/phase-N/previews/`, with made-up data. Each has `<style data-system></style>` and `<svg data-icons ...></defs></svg>` blocks. After any system change, run:

```bash
node docs/design-system/sync-previews.mjs
```

The preview control sits in a corner, not on the screen, and is the only thing a preview may add. Previews load the font from Google Fonts, for review only. The app never does.

## Changing the system

1. **A new need comes first.** Check whether an existing component can do the job.
2. **Change the system, not the screen.** A one-off colour, size or component in a screen isn't allowed.
3. **Who decides:** the Designer proposes. A small fix, such as a spacing bug, needs a note in that phase's handoff. A new component or any change to how the app looks goes to the owner for a yes in chat.
4. **Then:** update `system.css`, this file and `gallery.html` together, run the sync script, recheck contrast if colours changed, and log the change below.

## Change log

| Date | Phase | Change | Owner approved |
|---|---|---|---|
| 2026-11-07 | 3 | First version | Asked for by the owner |
| 2026-11-07 | 3 | Warm look from tasteskill.dev, Google Sans Flex, espresso panels, collapsible sidebar | Yes, 2026-11-07: "Approve the look" |
| 2026-11-07 | 3 | Small fixes: `.shell` `overflow-x: clip`; at 480px or less, tighter `.seg span` and `.note > .btn-row` wraps under the text | Small fix, noted in the handoff |
| 2026-11-07 | 3 | Light `accent` from `#C2410C` to `#BA3E0B`, so links pass 4.5 to 1 on `gain-soft`, `warn-soft` and `danger-soft` | Yes, 2026-11-07: "Approve all four" |
| 2026-11-08 | 4 | New `.cmd` part and `--font-code` (the Mac's own code font, nothing downloaded) for the forgotten-password command. New `copy` and `trash` icons | Yes, 2026-11-08: "Yes, approve all" |
| 2026-11-08 | 4 | Build helpers at the end of `system.css`: `.sprite`, a few spacing classes, `.steps`, `.with-glyph`, `.meter` step widths, `.menu`, `.date-row`, and no underline on links styled as `.btn` or `.pop__opt`. They hold the approved previews' inline spacings, because the app can't use `style="..."` (D-010). No change to how anything looks | Small fix, noted in the handoff |
| 2026-11-08 | 4 | Small fix: the header picker width rules now read `.top > .picker`, so they reach only the header's own period picker and not the date pickers in the "Choose a period" dialog, which sits inside the header (QA Q4-1). No change to how anything looks | Small fix, noted in the handoff |
| 2026-11-10 | 4 | Long setup lists for the setup change (accounts, and income and expense groups, which work the same): `.folds`/`.fold` (groups that open and close), `.search`, `.inline-edit` and `.add-row`, `.savebar`, three icons (`search`, `x`, `plus`), and a base rule `[hidden] { display: none !important; }` so `hidden` always hides (before, a `.btn` with `hidden` still showed) | Approved by the owner on 2026-11-10 ("Yes, approve all") |
| 2026-11-11 | 4 | Small fix: `.pick-row__name`, `.pick-row__sub` and `.fold__name` get `overflow-wrap: anywhere`, so a very long unbroken name wraps inside its row instead of running under the picker or off the screen (QA Q4B-1). No change for normal names | Small fix, noted in the handoff |
| 2026-11-13 | 5 | New `.skel` loading skeleton (no new colours: `sunk`, and `rail-line` on the hero). Small fix: at 380px or less `.date-row` puts the year on its own row, so the Custom dialog's year no longer cuts off to "202…" (Q4-9) | Yes, 2026-11-13: "Yes, approve all" |
| 2026-11-13 | 5 | Overview build helpers at the end of `system.css`: `.hero__figure`, `.hero__delta`, `.hero__spark`, `.stat--wide`, `.card__head`, `.card__title`, `.cat-row` and `.sr-only`. They hold the approved Overview preview's inline spacings as classes (D-010), with the same values, plus `overflow-wrap` on a long category name | Small fix, noted in the handoff |
| 2026-11-14 | 5 | Small fix: `.card--hero .delta` uses `rail-ink-2`, so a flat or falling change on the hero reads at 10.2 to 1 (was `ink-2`, 2.9 to 1 in light mode) in both themes. Gains keep `rail-gain`, and the minus sign stays (QA Q5-2) | Small fix, noted in the handoff |
| 2026-11-14 | 5 | Small fix: each `.stat` is a size container and `.stat .figure` is `min(var(--t-figure), 15cqi)` on one line, so a crore-sized figure fits a narrow tile at 320 without touching the divider. Wide tiles look the same (QA Q5-3) | Small fix, noted in the handoff |
| 2026-11-14 | 6 | Spending drill-down parts: `.path`, `.ranks`/`.rank`, `.txns`/`.txn`, `.chart--scroll` with `.chart-split` for long monthly charts, `.seg--2`, `.grid__side` and `.enter--back`. No new colours | Yes, 2026-11-14: "Yes, approve all" |

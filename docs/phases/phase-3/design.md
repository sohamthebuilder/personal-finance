# Phase 3 design

Owner: Designer. Follows `docs/phases/phase-3/brief.md`. Part 1 covers both flows and screens 1 to 6. Part 2 covers screens 7 to 16 and the Phase 2 open items.

## Foundations

The look, colours, type, components and motion are in `docs/design-system/README.md`. This file only covers what's specific to each flow and screen. Screens 1 to 6 use the Task layout. Screens 7 to 16 use the Shell layout.

**Sidebar (Shell layout).** The owner can collapse it to icons and expand it again with the button at its foot. Collapsed items show their name on hover or focus. The choice stays until it's changed, and charts redraw to fit. Narrow windows use the tab bar instead.

**Text from the file (conditions 14 and 27).** Account, category and note text is set as plain text only, on every screen, including chart labels and tooltips. It's never read as HTML, and it never builds a link. It's never placed in a web address, tab title, browser history state, log, error or the browser's storage. Tab titles are the app's fixed screen names. Drill-down uses a number the app gives each category for that session. A number from an old session opens Spending level 1. Hidden direction-changing characters in names don't change how the text around them reads, and one long unbroken name wraps. The upload's file name is never shown or kept.

## Flow: first time

| Step in brief section 5 | Screen | If it goes wrong |
|---|---|---|
| 1. Run one command and open the local address | App opens on screen 1 when there's no database | Nothing to handle in the app |
| 2. Create your password | 1 Create password | Too short, too long, too common, or the two don't match: error on the field |
| 3. Drop in the Excel file | 4 First upload | Refused file: note with the reason, and the drop area stays ready |
| 4. Complete the short setup step | 5 Setup | Unanswered account: error on that row. Back keeps the answers |
| 5. Check the summary and confirm | 6 Summary | Numbers look wrong: Start over removes the import and returns to screen 4 |
| 6. Dashboard appears | 9 Overview, with the delete-the-export reminder | Nothing to handle here |
| 7. Add an AI key in Settings | 15 Settings: AI (outline only) | Dashboards work without one |

**Locking partway through.** The file's rows are saved at step 3, because setup needs them (`NO_DATA`), and the app keeps no copy of the file. Setup answers stay on the screen until the owner saves them at step 4.

- **Locked in screen 5:** after login the app returns to screen 5 at part 1, with suggestions showing again. Unsaved answers are lost. Note: "The app locked, so your unsaved answers are gone. Your rows are still here."
- **Locked in screen 6:** answers are saved by then. After login the app returns to screen 6.
- **Closed before finishing:** same as locking. The dashboard never shows until the summary is confirmed.

## Flow: each update

| Step in brief section 5 | Screen | If it goes wrong |
|---|---|---|
| 1. Export and AirDrop | Outside the app | None |
| 2. Log in, click Upload, drop the file | 2 Log in, then 8 Update upload | Wrong password: see screen 2. Refused file: note with the reason, and old data stays |
| 3. Review the preview | 8 Update upload | Partial file: a warning that needs a clear choice. Cancel: nothing changes |
| 4. Confirm, and every screen updates | Back on the screen the owner came from | Save fails: "Nothing was changed" |
| 5. Delete the export when reminded | Reminder note | Reminder can be dismissed. The app can't delete the file itself |

**Locking partway through.** Nothing changes until Confirm. If the app locks on the preview, the pending file is thrown away. After login: "The app locked before you confirmed, so nothing changed. Upload the file again."

Undo stays available after Confirm, and is specified with screen 8.

## What opens when the app starts

| Files found | Opens |
|---|---|
| No database, no salt file, no marker | Screen 1 |
| Database and salt file, no marker | Screen 2 |
| Marker | The app finishes the delete, then shows screen 1 with "Everything in the app is deleted." |
| Only one of database and salt file, no marker | Screen 2, new state "Error, files incomplete". Nothing is deleted automatically, because the missing file may be in a backup |

## Screen 1: Create password

Shown only when there's no database, no salt file and no marker. See "What opens when the app starts".

- **On it:** step rail, title "Create your password", password field, repeat field, a show/hide control on each, tick box, button "Create password".
- **Wording:** "It locks everything in the app. There's no reset, so choose one you'll remember."
- **Hint:** "At least 15 characters. A short phrase works well."
- **Tick box:** "I understand that if I forget this, I'd start again from my latest export."
- **Leads to:** screen 4.

| State | What shows |
|---|---|
| Loading | Button reads "Creating…" and is disabled. The slow key step takes about a second |
| Empty | The screen itself |
| Error, too short | On the field: "Use at least 15 characters." |
| Error, too common | On the field: "That one's too easy to guess. Try a short phrase of your own." |
| Error, too long | On the field: "Use 256 characters or fewer." |
| Error, no match | On the repeat field: "These don't match." |
| Error, box not ticked | On the tick box: "Please confirm you've read this." |
| Error, save failed | Note: "The password couldn't be saved. Try again." |
| Stale | Can't happen: there's no data yet |

**Password rules (condition 33).** Phase 4 follows condition 33 for how the minimum is counted, the common-password list and form handling.

**Fields (S3-16).** Spell check and auto-correct are off. The field goes back to hidden and empty on submit, lock and error. A check made on the page, before anything is sent, keeps the text and hides it.

**Before login (S3-14).** The create-password request gets the same `Host`, same-origin and size checks as every other, because it's the one action that works with no session.

**Widths:** the same column at all widths. **Keyboard:** password, show, repeat, show, tick box, button.

## Screen 2: Log in

- **On it:** app name, password field with show/hide, button "Log in", link "Forgot your password?".
- **Leads to:** the screen the owner was on, or Overview. An unfinished first-time flow returns to its step.

| State | What shows |
|---|---|
| Loading | Button reads "Unlocking…" |
| Empty | The screen itself |
| Error, wrong password | On the field: "That password isn't right." |
| Error, slowed down | On the field: "Too many tries. Try again in 30 seconds." The seconds count down and the button stays off until zero |
| Error, files incomplete | Note, with no password field: "Some of the app's files are missing, so it can't open. Nothing was changed." Then the forgotten-password steps |
| Error, can't open | Note: "The app couldn't check your password. Nothing was changed. Quit the app and try again." |
| Forgotten password | Opens in place: "There's no reset, because a reset would be a way in for anyone else. To start again, stop the app by pressing Control-C in its Terminal window. Then, in that same Terminal window, paste this and press Return. It lists what it will delete and asks you to type DELETE. It deletes everything in the app, including setup answers, the undo copy and AI keys. Export files on your Mac aren't touched. It downloads nothing and never asks for your Mac password. Only use this command from this screen." Then the command, Copy, and "Then run the app again and create a new password." |
| Copy, done | The button reads "Copied" for 2 seconds |
| Copy, failed | "Couldn't copy. Select the command and copy it yourself." The command must stay selectable |
| Stale | Can't happen: nothing shows before login |

"That password isn't right." shows only for `WrongPasswordError`. A badly damaged file also gives that error, and the code can't tell the two apart (see Known limits in `security.md`).

**Slow-down (condition 32).** Three wrong tries are free. Then the wait is 30 seconds, doubling each time, up to 15 minutes. It never locks for good.

**Fields (S3-16).** Spell check and auto-correct are off. The field goes back to hidden and empty on submit, lock and error.

The command is a short call to a script that ships with the app, so it can be read first. Phase 4 writes it and meets condition 29. There's no wipe button on this screen. **Keyboard:** password, show, Log in, Forgot your password?

## Screen 3: Locked

The same layout as screen 2, with the title "Locked" and one line saying why. All data leaves the page before this shows, so nothing is left to scroll to or read.

| Cause | Line |
|---|---|
| 15 minutes idle | "Locked after 15 minutes without use." |
| Restart | "The app restarted, so it's locked." |
| Log out, confirmed | "You're logged out." |
| Log out, not confirmed | "Logging out didn't finish. Quit the app to be sure it's locked." |

"You're logged out." shows only after the server confirms, or if the server can't be reached at all, because a stopped server holds no key.

The return screen and the reason line are picked from fixed lists held by the server. After a restart, the app opens on Overview. The same goes for "Everything in the app is deleted." Neither ever comes from the web address. An unfinished first-time flow still returns to its step.

States match screen 2, and the field follows the same Fields rule: spell check and auto-correct are off, and the field goes back to hidden and empty on submit, lock and error. A task in progress follows the rules in the flows above.

## Screen 4: First upload

- **On it:** title "Add your export", the line "Use the Excel file from Money Manager. It's read here, and the file is never sent anywhere.", a drop area reading "Drop your export here", and a "Choose file" button.
- **Leads to:** screen 5.

| State | What shows |
|---|---|
| Loading | The drop area shows a progress line and one named stage at a time: "Checking the file", "Reading rows", "Adding up balances" |
| Empty | The screen itself |
| Drag over | Drop area border turns `accent` |
| Error, refused | Note above the drop area, in `danger-soft`, with the fixed text from `REJECTION_MESSAGES`, then "Nothing was saved. Export again from Money Manager and drop the new file here." Row refusals add row numbers only: "Rows 12, 48 and 3 more." The note clears when a new file is dropped |
| Stale | Can't happen: there's no data yet |

`ALREADY_IMPORTED` must go when Phase 4 adds replacing. Every other message is used as it stands. **Widths:** on narrow windows, the wording becomes "Choose your export", since dragging is unusual there. **Keyboard:** Choose file is the one stop.

## Screen 5: Setup

*Changed 2026-11-10 for the owner's setup change, and again the same day for the second change, income groups (brief sections "Requirement change, setup answers" and "Second change, income groups"). Lines marked **(new)** are new wording waiting for the owner's yes.*

Three parts with a "Part 1 of 3" label: Accounts, Income and Expenses. Back keeps the answers. Names come from the file, and generic keyword suggestions fill in what they can for accounts only. Income and expenses start with no groups, and there's no Earned, Returns or Loan choice anywhere. There's no reimbursement or "reliable from" question any more. Balances aren't shown: the summary and dashboards show them.

All three parts use the same long-list parts from the design system: groups that open and close (`.fold`), a search field (`.search`), and rows (`.pick-row`). It must stay quick with 60 or more accounts and 40 income and 40 expense categories with subcategories (AC-27).

**Part 1: "Group your accounts".** Lede: "We found these in your file and suggested what we could."
- Search field: "Find an account" **(new)**.
- Groups in this order, each a closed row with its icon, name and count ("8 accounts", "1 account", "No accounts"): **"Needs a group"** **(new)**, open, holding every account with no suggestion; then Bank, Cards, Wallets, Investments, Money with others and Business, closed.
- Opening a group lists its accounts. Each row has the name, a "Suggested" tag if the answer came from a suggestion (it goes once the owner changes it), and a group picker. The picker lists Bank, Cards, Wallets, Investments, Money with others and Business. An empty picker reads "Choose a group".
- **Rows don't jump.** After a picker changes, the row stays where it is, so nothing moves under the pointer. In a named group it shows a tag, "Moved to Cards" **(new)**. Counts update at once. Rows settle into their new group when any group opens or closes, the search changes, or the part is shown again.
- Under the groups: the count and progress line, "52 of 60 grouped".

**Part 2: "Group your income"** **(new)**. Lede: "Make groups such as Work and Savings, and put each category in one. You can do this later in Settings." **(new)**
- It works exactly like part 3, with its own list of groups: search "Find a category", "Not grouped" first (closed until the first group exists), the owner's groups with Options, category rows with their subcategories under the name and a group picker once a group exists, and "Add a group".
- The Add hint reads "Up to 12 groups, such as Work and Savings." **(new)** until there's a group, then "4 of 12 groups."
- No suggestions. This part is optional: "Continue" works with every category still Not grouped. All income counts as Earned whatever its group.
- Income groups and expense groups are separate lists, so "Family" can be used once in each.

**Part 3: "Group your expenses"** **(new)**. Lede: "Make groups such as Needs and Wants, and put each category in one. You can do this later in Settings." **(new)**
- Search field: "Find a category".
- **"Not grouped"** comes first and holds every category to start with. It's closed while there are no groups, and opens by itself when the first group is added, because then there's something to do in it.
- Under the groups: "Add a group" **(new)** with the hint "Up to 12 groups, such as Needs and Wants." **(new)**, or "4 of 12 groups." **(new)** once there are some.
- Add, rename and remove work as on screen 13, with the same checks and wording. Removing a group here says "Its 9 categories go back to Not grouped." without "Nothing changes until you save."
- Each category row shows its name, its subcategories as a line under it ("Vegetables · Staples · Dairy · Snacks"), and once there's at least one group, a picker with "Not grouped" and the owner's groups. Subcategories always follow their category, so they have no picker.
- This part is optional. "Save and continue" works with every category still Not grouped.

Buttons: "Continue" and "Back" (from part 2), then "Save and continue" on the last part. **Leads to:** screen 6.

| State | What shows |
|---|---|
| Loading | Step 1 skeleton: group rows at their real height, then "Saving…" on the button |
| Empty | Can't happen: a file with no rows is refused |
| Error, account not grouped | On each empty row: "Choose a group." Continue opens "Needs a group" if it was closed, clears the search if it hid the row, and moves focus to the first empty picker. The error clears when it's fixed |
| Error, group name | On the name field: "Give the group a name.", "Use 40 characters or fewer.", "You already have a group called “Wants”." or "“Not grouped” is kept for categories without a group." **(all new)** |
| Group limit reached | The Add button goes, and the hint reads "You have 12 groups, the most you can have. Remove one to add another." **(new)** |
| Search, no match | In place of the list: "Nothing matches “yacht”." with a "Clear search" link **(new)**. While searching, a count reads "1 match" or "15 matches" **(new)** |
| Error, save failed | Note with the fixed text: "Setup couldn't be saved. Nothing was changed." Other setup refusals can't normally be reached from this screen, so they show the same note |
| No income categories | Part 2 is skipped, and the labels read "Part 1 of 2" and "Part 2 of 2" |
| No expense categories | Part 3 is skipped, the same way |
| Stale | Can't happen: answers are about the file just added |

**Search rules.** Matching ignores case and looks anywhere in the name. Accounts match on the account name, or on the group name, which shows the whole group. Income and expenses match on the category or any subcategory, or on the group name, which shows the whole group. Every group with a match opens while searching. Clearing the search puts back the groups the owner had open. Search never changes an answer.

**Widths.** The content column is the wide task column (640px). At 1280, the name is on the left and the control on the right (280px). At 560 and below, the control sits under the name at full width, and the rows inside a group step in by 16px instead of 48px (24px for groups without an icon). No sideways scroll at 1280, 375 or 320.

**Keyboard.** Search, Clear (only once there's text), then each group row in order; inside an open group, its rows' pickers or choices in order. A group row is a button: Enter or Space opens and closes it, and it says whether it's open (`aria-expanded`). Pickers open with Enter, arrow keys move, Enter picks and Esc closes. In the search field, Esc clears it. In a group name field, Enter saves and Esc cancels. Parts 2 and 3: search, Not grouped, each group row and its Options button, then Add a group, then the buttons.

**Motion.** Group opens: 200ms, the rows fade in and drop 6px, and the chevron turns. Group closes: at once, chevron turns. Search narrows the list at once, with no movement. Errors fade in 140ms. Step change between parts: 180ms in the direction of travel. Reduced motion: all instant.

## Screen 6: Summary

Title: "Does this look right?"

- **On it:** the line "Compare this with your Money Manager app before you carry on.", then one card with Net worth today, rows and date range, and each group with its account count and total.
- **Notes, only if needed:** "2 transfers have no partner. They get their own line in the net worth breakdown." and "3 rows are dated in the future. They count from their date."
- **Buttons:** "Looks right" (main), "Back to setup", "Start over".
- **Start over:** a dialog: "This removes the import and your setup answers. You'll add the file again." Buttons: "Start over" and "Keep going".
- **Leads to:** screen 9, with the note "Your data is in. Now delete the export file from your Mac and empty the Trash, because it isn't protected there." and a Dismiss link. A lock before Dismiss doesn't lose it: it shows again after login until it's dismissed.
- **Start over on the server (S3-14):** it needs no password, so the server must refuse it once the summary has been confirmed.

| State | What shows |
|---|---|
| Loading | Skeleton at the real shape |
| Empty | Can't happen |
| Error | Note: "This couldn't be finished. Nothing was lost." with Try again |
| Stale | Can't happen: this data was just added |

**Motion:** the first time Overview appears, tile numbers roll up from zero once, because this is the first data the owner sees. **Keyboard:** Looks right comes first after the figures.

# Part 2

## Rules shared by screens 7 to 16

**Period.** One period for the whole app. It opens on This month at every login, and a change lasts until logout or lock. It's kept in memory only, never in a web address or on disk.

| Choice | Dates used | Range line shows |
|---|---|---|
| This month | 1st of this month to today | "1 to 7 Nov 2026" |
| Last 12 months | Same day last year, plus one, to today | "8 Nov 2025 to 7 Nov 2026" |
| Financial year | 1 April to today | "1 Apr to 7 Nov 2026" |
| All | The first row's date to today | "Apr 2021 to Nov 2026" |
| Custom | The two dates chosen | "1 Apr to 30 Jun 2026" |

**"All" (F-4).** The picker reads "All", and the range line gives the real first and last months. The app always sends the first row's date, never a made-up start like `0000-01-01`.

**Compared with.** Spending compares with the same number of days just before the period. This month on the 7th compares with 1 to 7 Oct. Financial year compares with the same dates a year earlier. All has nothing before it, so no comparison shows. A period with no earlier rows reads "Nothing earlier to compare".

**Blank names (AC-11).** A blank category reads "No category", and a blank subcategory reads "No subcategory". The labels are the app's own. They're shown in the same plain style as real names and can't be picked up as file text.

**What Earned means (second change, 2026-11-10).** Earned is all income rows, except balance corrections, whatever group the owner put them in. The tile keeps the name "Earned". Accepted gap: a loan or investment gain logged as income counts in Earned and raises the savings rate.

**Savings rate (AC-11, F-2).** The rate shows only when Earned is above zero.

| Earned in the period | Tile shows | Help line |
|---|---|---|
| Above zero | "Saved · 44%". A rate below zero reads "Saved · −12%" | None |
| Zero | "Saved · no rate" | "There's no savings rate because nothing was earned in this period." |
| Below zero | "Saved · no rate" | "There's no savings rate because Earned is below zero in this period." |

The code gives `null` for zero. Phase 5 must treat below zero the same way on screen. In the monthly chart, those months have no bar, and the axis label stays.

**Screen errors.** All dashboards share one: a `.note--danger` in place of the content: "This screen couldn't load. Your data is safe." with a Try again button. Nothing technical shows. Errors are fixed wording, plus row numbers where the import code gives them (condition 24).

**Loading.** Each dashboard shows a skeleton at its real shape, with no shimmer. Anything under 200ms shows no skeleton, so a fast load doesn't flicker. The shell stays in place.

**Stale data.** Two states, in `.note--warn` at the top of each dashboard:
- **Old upload, more than 30 days:** "Your last upload was 12 Oct 2026, so recent months may be missing." with an Upload link. It's dismissed until next login.
- **Changed in another window:** "Your data changed in another window." with a Reload link. Numbers don't change until Reload.

**Locking.** Screens clear at once and screen 3 shows. Pop-ups and dialogs close, unsaved Settings answers are lost, and a pending upload is thrown away. After login, the owner returns to the same screen on This month.

Only something the owner does counts as use: a click, a key press or an action they started. Background checks never count. A file being read counts only until the reader's time limit. Idle time is worked out from the clock on every request, so sleep counts as idle. When a window wakes or gets focus, it asks first and clears straight away if locked. A lock clears every window. The server decides, and the page's timer only follows it.

**Motion for all dashboards.** Period change: numbers roll 500ms from old to new, bars move 400ms from old length to new, and lines redraw at once. Drill-down: step change 180ms. With reduced motion, the new values show at once. No screen has any other movement.

## Screen 7: Shared header and navigation

- **On it:** screen title, period picker, Upload, Settings, Log out. The side list has Overview, Spending, Savings & Net worth, Accounts & Investments and the collapse button.
- **Period picker:** shows on every Shell screen. On Settings and Upload it still works, and the new period applies on the way back.
- **Custom:** opens a dialog titled "Choose a period" with From and To, each with day, month and year pickers. Buttons: "Show this period" and "Cancel". Cancel keeps the previous period. The earliest year is the first row's year, and the latest date is today.
- **Upload:** opens screen 8. **Settings:** opens screen 13. **Log out:** locks at once with no dialog, and shows screen 3. Its line follows the "Error, Log out fails" row below.

| State | What shows |
|---|---|
| Loading | Can't happen: the header draws at once and only the page loads |
| Empty | Can't happen: Shell screens only show once there's data |
| Error, To before From | On the field: "The end date must be on or after the start date." Show this period stays on, and pressing it moves focus to the field |
| Error, date doesn't exist | On the field: "That date doesn't exist." For example 31 Jun |
| Error, date after today | On the field: "Choose a date up to today." |
| Error, Log out fails | The page clears at once and shows screen 3. It sends the logout and tries once more if that fails. If the server still hasn't confirmed, screen 3's line reads "Logging out didn't finish. Quit the app to be sure it's locked." instead of "You're logged out." |
| Stale | See the shared rules above |

**Widths.** 1280: side list 256px, or 72px collapsed, and the header holds everything. 375 and 320: the side list becomes the tab bar with Overview, Spending, Savings and Accounts. Upload becomes an icon button, Settings and Log out move into the "More" menu, and the header's title is hidden, because the tab bar says where you are. Upload and Settings have no tab, so their title sits at the top of the page. The picker fills the row (the design system rule for 480px or less), and long custom ranges stay on the range line, not in the picker. The dialog goes full width with a 16px margin, and the date pickers wrap under their label.

**Keyboard.** Side links, collapse, period, Upload, Settings, Log out, then the page. On narrow windows: period, Upload, More, page, tab bar. The collapse button says what it will do. Collapsed links show their name on hover and on focus.

**Motion.** Sidebar 240ms, charts redraw at the end. Pop-ups 200ms. Dialogs 180ms fade. Reduced motion: all instant.

## Screen 8: Update upload

Reached with Upload. Title: "Update your data". Uses the Shell layout, so the owner never feels they've left the app.

**Stage 1, choose the file.** Line: "A new export replaces everything here, so edits and deletions from your phone come through too. You'll check the changes first." Then the drop area and Choose file, as on screen 4, plus a Cancel link.

**Stage 2, review.** Title changes to "Check the changes". Nothing has changed yet.

- **Lead panel:** "Net worth after this update", the new figure, and the change with old figure: "+₹48,250 from ₹18,42,350".
- **Counts:** New rows, Changed rows and Removed rows, in one `.card.stats` with the file's total: "8,469 rows from 1 Apr 2021 to 28 Nov 2026".
- **Rows:** a three-way choice for New, Changed and Removed, each showing date, account, category and amount as plain text. Changed rows show the new amount, with "was ₹1,200.00" under it. The first 10 show, then "Show 50 more", or the smaller number left.
- **New accounts, only if any:** title "New accounts", line "These go in Ungrouped until you choose a group." One row each with a group picker that starts on Ungrouped. The owner can choose now or later.
- **New income categories, only if any** *(changed again 2026-11-10, second change)*: title "New income categories", line "These show as Not grouped. You can put them in a group in Settings." Same rows as new expense categories below: the name with a "Not grouped" tag, and its subcategories under it. Nothing to choose here.
- **New expense categories, only if any** *(new 2026-11-10)*: title "New expense categories" **(new)**, line "These show as Not grouped. You can put them in a group in Settings." **(new)** One row each: the name with a "Not grouped" tag, and its subcategories under it. No picker here, so the review stays short.
- **Removed names, only if any:** "1 account and 2 categories are no longer in this file. Their setup answers go when you confirm, and Undo brings them back." Phase 4 follows condition 36.
- **Buttons:** "Replace my data" (main) and "Cancel". Under them: "Your current data is kept, encrypted, so you can undo this until your next update."

**Stage 3, after confirming.** The app returns to the screen the owner came from. Numbers roll from old to new, and this note shows at the top: "Your data is updated. Now delete the export file from your Mac and empty the Trash, because it isn't protected there." with Undo and Dismiss links. A lock before Dismiss doesn't lose it: it shows again after login until it's dismissed.

**Undo.** Undo opens a dialog titled "Undo this update?": "Your data and setup answers go back to how they were before this update on 28 Nov 2026. To use this file again, you'd upload it again." Buttons: "Undo update" and "Keep this update". After it, numbers roll back and this note shows: "Your data is back to how it was." with Dismiss.

- There's one undo copy. It stays until the next confirmed upload replaces it, an undo uses it, or delete my data clears it.
- Dismissing the note doesn't lose Undo. It stays in Settings, under Your data, with the date.
- There's no redo. Undo restores rows and setup answers together, in one step, which settles the Phase 2 item on answers for names no longer in the data.

| State | What shows |
|---|---|
| Loading, reading | Progress line and the stages from screen 4, plus "Comparing with your current data". Cancel stays available |
| Loading, saving | Button reads "Replacing…", Cancel goes off. It takes one step, so it all happens or none of it does |
| Empty, same file | Note: "This file matches your current data, so there's nothing to update." with a Done button. No review shows |
| Empty, one list | The list reads "No new rows", "No changed rows" or "No removed rows" |
| Error, wrong columns | `.note--danger` over the drop area: "The columns don't match the expected export." then "Nothing was changed. Export again from Money Manager and drop the new file here." |
| Error, other refusal | The same note, with the fixed `REJECTION_MESSAGES` text and the same second line. Row refusals add row numbers only |
| Warning, partial file | See below |
| Error, save failed | `.note--danger`: "The import couldn't be saved. Nothing was changed." with Try again. If the app locks after a failed save, the file is gone by then, and the note says to upload it again. A lock can't happen during a save |
| Error, undo failed | Note: "The undo couldn't be finished. Nothing was changed." with Try again |
| No undo available | Settings reads "Nothing to undo yet." |
| Stale | Can't happen: the comparison is made when the file arrives. If data changes in another window first, the review is thrown away with "Your data changed in another window, so upload the file again." |

**Partial file warning.** Shown on the review when the file starts later than the current data, ends earlier, has at least 10% fewer rows, or is missing most of the accounts in the current data. `.note--warn`, with only the lines that apply:

- "This file looks incomplete."
- "It starts in Jan 2024, but your data starts in Apr 2021."
- "It ends in Aug 2026, but your data ends in Nov 2026."
- "It has 2,140 rows, and your data has 8,412."
- "Most of your current accounts aren't in this file."
- "A new file replaces everything, so anything missing from it would go."

Below it, a tick box: "I've checked, and I want to use this file." Replace my data stays off until it's ticked. Cancel gets focus, so the safe choice comes first. That's a page rule only, so the server must also refuse a save without the tick when a warning applied.

**Where things live.** The pending file is held only in the server's memory, tied to this session. There's one at most. It's never written to disk, to the database or to the browser. It goes on Cancel, lock, logout, restart or a new upload. The undo copy is kept in the same encrypted database as a second set of tables, so replacing and keeping the copy are one saved step, and deleting the database removes it. AI keys live in the same database.

**One change at a time.** Replace, undo, setup save, Start over and delete take turns, using one lock. Each review and each Settings page carries a data version. The server refuses a save if the version has changed, whatever the page shows. A second window's review can't be confirmed after the first has saved.

**Saving and locking.** Saving counts as use. If a logout from another window arrives during a save, the save finishes or rolls back before the database closes.

**Widths.** 1280: lead panel beside the counts. 375 and 320: stacked, the row date sits above the name, and the amount stays right-aligned. New-account pickers go full width under the name. Buttons go full width. **Keyboard.** Stage 1: Choose file, Cancel. Stage 2: row choice, rows, Show 50 more, new-account pickers, tick box if shown, Replace my data, Cancel. The note's Undo comes before Dismiss. The dialog traps focus and starts on the safe button, "Keep this update".

**Motion.** Stage change: step change 180ms. List change: the choice slides 240ms and rows swap at once. After confirm or undo: numbers roll 500ms and bars move 400ms, which is how the owner sees what changed. Reduced motion: instant, and the note still says what happened.

## Screen 9: Overview

- **On it:** one hero panel with Net worth, the change in the period, the range line and a small line of the last 12 months. Beside it, one card with Earned, Spent, Saved with savings rate, and Invested. Then "Worth noticing" with three lines, "Earned and spent by month" bars, and "Top categories" with the top 5.
- **Controls:** hover or focus on a month shows exact figures. A top category opens it on screen 10. Each tile is plain figures with no link.
- **Net worth is always today's.** The period changes the change line beside it, not the figure, and the label stays "Net worth".
- **Months shown:** bars show the last 12 months for This month and Last 12 months, the months in the period for Financial year and Custom, and years for All when it's over 24 months.
- **Worth noticing:** this design only sets the place, the count and the style. Rules are for Phase 5. If there are fewer than three, fewer show. If none: "Nothing stands out in this period."

| State | What shows |
|---|---|
| Loading | Skeleton of hero, four stats and two charts |
| Few rows (AC-7b) | When This month has fewer than 10 rows: figures show as they are, and a line in the stats card reads "It's early in November, so these figures are small so far." Worth noticing, charts and categories still show what exists. A one-category list stays a one-row list |
| Empty, no rows (AC-7b) | All figures read ₹0, and the rate reads "no rate". Bars still show earlier months. Top categories reads "Nothing spent yet this month." For other periods: "Nothing in this period." with a link "Show this month" |
| Earned zero or below | See savings rate above |
| Error | Shared note |
| Stale | Shared notes |

**First time only:** numbers roll up from zero once, and the delete-the-export note shows (screen 6).

**Widths.** 1280: hero 5 columns, stats 7, notices across, bars 7, categories 5. 375: one column in that order, and the bars label every second month. 320: the same, with the display figure at 36px and "₹18,42,350" still on one line. **Keyboard.** Header, then months in the chart with arrow keys, then each top category. The chart is one stop.

**Motion.** See shared rules. The hero's small line doesn't animate.

## Screen 10: Spending

- **Level 1, categories:** ranked bars of Spent by category with amount, share and a change against the earlier period, for example "+₹1,240 vs 1 to 7 Oct". Total Spent leads as the screen's one figure.
- **Level 2, subcategories:** the same bars for one category, plus "Monthly trend": bars of Spent by month for that category.
- **Level 3, transactions:** rows with date, account, amount with paise and note. Newest first, 50 at a time, with "Show 50 more". Totals sit on top.
- **Controls:** a click on a bar row goes down a level. A path at the top, "Spending / Groceries / Vegetables", goes back up. The browser's Back does the same. Changing the period keeps the level, and if the category has nothing in the new period, the level's empty state shows.
- **Trends start** at the first month in the file (setup change, 2026-11-10: there is no "reliable from" answer any more).
- **Labels:** every amount here is Spent, meaning `Exp.` rows as logged. Blank names use the shared labels.

| State | What shows |
|---|---|
| Loading | Skeleton of ranked rows |
| Few rows | The list shows what exists. The comparison reads "Nothing earlier to compare" where needed |
| Empty | "Nothing spent in this period." with "Show this month" when another period is chosen, or "Nothing spent yet this month." on This month. A drilled level reads "Nothing in Groceries for this period." The name is plain text |
| Error | Shared note |
| Stale | Shared notes |

**Widths.** 1280: ranked bars on the left at 7 columns, trend on the right at 5. 375 and 320: one column. Each row has the name and amount on the first line, the bar under it, and the change below. Transaction rows put the date and account on the second line, and long notes wrap, never pushing the page wide. **Keyboard.** Path, then each row as a button. Enter goes down. Backspace isn't used. Focus moves to the new level's heading.

**Motion.** Level change: 180ms in the direction of travel. Bars move from old to new when the period changes. Reduced motion: instant.

## Screen 11: Savings & Net worth

- **On it:** hero with Net worth and the change in the period. "Net worth over time", a line for the full history with the period marked by a soft band. "Savings rate by month", bars above and below a zero line. "What changed your net worth", the breakdown.
- **Breakdown lines, in this order:** Net worth on [start date], Earned, Spent (shown with a minus), Other corrections, Unmatched transfers, then Net worth on [end date] and Change in net worth. Every line always shows, even at ₹0.
- **Help lines, on a small help button per line:**
  - Earned: "All your income, whatever group it's in." **(new)**
  - Other corrections: "Balance corrections on your accounts."
  - Unmatched transfers: "Transfers with no partner in the file, which changes your balances. It's normally ₹0."
- **Gone in the second change (2026-11-10):** the Investment returns and Loans lines. That money now counts in Earned, and the list still adds up to the change in net worth.
- **Not in the list:** Invested, because it moves money between your own accounts. Line under the list: "Invested isn't here because that money stays yours."
- **Hover or focus** on the line or bars shows exact figures in the tooltip. No click action.

| State | What shows |
|---|---|
| Loading | Skeleton of hero, line, bars and list |
| Few rows | A line with one month shows as a dot with its figure. The rate chart shows what exists |
| Empty | Net worth still shows, because it's today's balance. Bars read "No months in this period." The breakdown shows with ₹0 lines |
| Earned zero or below in a month | That month has no bar, and hovering says "No rate: nothing was earned" or "No rate: Earned was below zero" |
| Unmatched not zero | The line shows its amount, plus the note "2 transfers have no partner." |
| Error | Shared note |
| Stale | Shared notes |

**Widths.** 1280: hero 5 and line 7, then bars 7 and breakdown 5, side by side. 375 and 320: one column. The line chart keeps three axis labels, and the list keeps the label on the left and amount on the right. **Keyboard.** Line chart, bars chart, then the help buttons in order. Charts use arrow keys, one stop each, and Esc closes a help line. Every chart has a text label giving the start, end and highest figure.

**Motion.** Period change: the band moves 400ms and bars change length. The line doesn't redraw, because the history doesn't change. Reduced motion: instant.

## Screen 12: Accounts & Investments

- **Accounts:** Total net worth leads. Then one section per group in setup order: icon, name, total, and rows with account name, balance and "Updated 12 Oct 2026", the date of its latest row. Cards show as negative. Balances are always today's, and the period doesn't change them. A line at the top says so: "Balances are as of today."
- **Old balances:** the row gets a `.tag` reading "Old balance", with a warn icon, so colour isn't the only signal. How old is set in Phase 8.
- **Ungrouped:** this section shows only when it has accounts, at the top: "2 accounts aren't grouped yet." with a Settings link. They still count in net worth.
- **Investments:** one card with Value, Net put in and Returns, then one allocation bar by account with a text list of each account, amount and share. Net put in and Returns follow the period. Value is today's. Returns here are worked out from balances and money put in, never from income groups.
- **Controls:** a Settings link in Ungrouped. Rows have no other action.

| State | What shows |
|---|---|
| Loading | Skeleton of groups and rows |
| Few rows | A group with one account stays a group. Empty groups don't show |
| Empty, no investments | The Investments card reads "No accounts are in the Investments group." with a Settings link |
| Error | Shared note |
| Stale | "Old balance" tags, plus the shared notes |

**Widths.** 1280: accounts at 7 columns, investments at 5. 375 and 320: one column, with investments after accounts. The account's date goes under its name. The allocation bar keeps full width, and its text list carries the detail. **Keyboard.** Settings links only, in reading order. The bar has a text label. **Motion.** Period change: figures roll and the bar's parts move 400ms. Reduced motion: instant.

## Screen 13: Settings, account and category setup

*Changed 2026-11-10 for the owner's setup change, and again for the second change, income groups. Lines marked **(new)** are new wording waiting for the owner's yes.*

Settings has one page with a three-way choice at the top: Setup, Your data and AI. Title: "Settings".

**Setup.** Three cards, each with the same controls as screen 5, then a save bar. The "Paid back and history" card is gone.

- **Accounts.** Line: "The group decides where each account shows and what counts towards net worth." Search "Find an account". Groups in this order: **Ungrouped** first and open, then Bank, Cards, Wallets, Investments, Money with others and Business, closed, each with its icon and count. Ungrouped always shows, even with "No accounts", so the owner can see where an account would go. Opening a group lists its accounts, each with a group picker that includes Ungrouped (an allowed answer here). No balances. A moved row shows "Moved to Cards" and settles as on screen 5. An empty group reads "Nothing in this group yet." **(new)**
- **Income.** Line: "Make your own groups, such as Work and Savings, and put each category in one. Subcategories go with their category." **(new)** Exactly like Expenses below, with its own groups: search "Find a category", "Not grouped" first and open, the owner's groups with Options, category rows with pickers, then "Add a group". No Earned, Returns or Loan choice. No income categories hides this card.
- **Expenses.** Title "Expenses" **(new)**. Line: "Make your own groups, such as Needs and Wants, and put each category in one. Subcategories go with their category." **(new)** Search "Find a category". **"Not grouped"** first and open, then the owner's groups in the order they were made, each with its count ("9 categories") and an Options button (`more` icon, label "Options for Wants") **(new)** that opens a menu: "Rename" and "Remove" **(new)**. Each category row: name, subcategories under it, and a picker with "Not grouped" and the groups. Under the groups: "Add a group" and "4 of 12 groups.", or the limit line.

Everything below about groups applies to Income and Expenses alike. Each has its own 12-group limit, and the duplicate check looks only within the same list.

**Adding and renaming a group.** The Add button, or the group's row for Rename, turns into a name field in place (`.inline-edit`): label "New group name" or "Group name" **(new)**, the field, then "Add group" or "Rename" **(new)**, and "Cancel". Hint under it: "Up to 40 characters." **(new)** Enter saves and Esc cancels. Checks run on Add or Rename and then again as the owner types, and the error replaces the hint:
- Empty, or only spaces: "Give the group a name." **(new)**
- Over 40 characters, counted as characters people see: "Use 40 characters or fewer." **(new)**
- Same as another group, ignoring case and spaces at the ends: "You already have a group called “Wants”." **(new)**, naming the group as it was saved.
- "Not grouped": "“Not grouped” is kept for categories without a group." **(new)**
- The 13th group can't be started: the Add button goes and the hint reads "You have 12 groups, the most you can have. Remove one to add another." **(new)**
The field has no character limit of its own, so a pasted long name shows the error rather than being cut silently. The server checks all of these again (AC-28). Names show as plain text only. After Add or Rename, focus goes to that group's row. A new group starts empty and closed.

**Removing a group.** From the menu, "Remove". If the group has categories, a dialog: title "Remove “Wants”?" **(new)**, text "Its 9 categories go back to Not grouped. Nothing changes until you save." **(new)**, buttons "Keep group" **(new)** and "Remove group" (danger) **(new)**. Focus starts on "Keep group". An empty group is removed straight away, with no dialog, because nothing is lost. After removing, its categories show under Not grouped, and focus goes to the Not grouped row.

**Save bar** (`.savebar`, new in the design system). At the end of the Setup tab. It holds "Save changes" (the one primary button) and "Discard". Its line reads:
- No changes: "No unsaved changes." **(new)** Save is off, Discard is hidden, and the bar sits at the end of the page.
- After a change: "You have unsaved changes." **(new)** Save on, Discard shows, and the bar sticks to the bottom of the window (above the tab bar on narrow windows), so Save is always in reach on a long page.
- Saving: "Saving…" on the button, every control off, Discard hidden.
- Saved: a tick and "Saved. Every screen now uses these answers." (the existing line, moved here from the top note so the owner sees it where they pressed Save). Focus moves to this line. Rows settle into their groups.
- Couldn't save: an alert icon and "Setup couldn't be saved. Nothing was changed." (existing), and the button reads "Try again" **(new label)**.

**Your data.** Last upload date and rows, "Undo last update" (the dialog from screen 8) and the Delete my data row, which opens screen 14. No change.

- **Leaving with changes:** a dialog: "Leave without saving? Your changes will be lost." Buttons: "Keep editing" and "Leave".

| State | What shows |
|---|---|
| Loading | Skeleton group rows at their real height, then "Saving…" on the button |
| Empty | Can't happen: settings only opens with data. No income categories hides that card. No expense categories shows the Expenses card with "Nothing in this group yet." under Not grouped |
| Error, save failed | In the save bar: "Setup couldn't be saved. Nothing was changed." with "Try again" |
| Error, group name | On the name field, as above |
| Group limit reached | As above |
| Search, no match | "Nothing matches “yacht”." with "Clear search", in place of that card's list |
| Error, account left without a group | Can't happen here: Ungrouped is an allowed answer |
| Stale | If data changed in another window: the shared note at the top with Reload, and every control is off until Reload. Search and opening groups still work |

**Widths.** The column is 640px wide. 1280: name left, control right (280px). 560 and below: control under the name, full width, rows inside a group step in 16px. 480 and below: the save bar's line takes its own row and the two buttons share the row under it. No sideways scroll at 1280, 375 or 320.

**Keyboard.** The Setup, Your data and AI choice; then per card: search, Clear, group rows in order (Enter or Space opens), rows inside open groups, and in Income and Expenses each group's Options button after its row, then Add a group; then Save changes, Discard. Options menu: arrow keys move, Enter picks, Esc closes and returns focus to the Options button. Name field: Enter saves, Esc cancels and returns focus to where it started. Dialogs trap focus and start on the safe button.

**Motion.** Choice slides 240ms and the section swaps at once. Groups open in 200ms (fade and 6px drop) and close at once; the chevron turns 200ms. Search narrows at once. The menu opens like a picker, 200ms. Errors fade in 140ms. The save bar doesn't animate: it simply sticks when there are changes. Reduced motion: instant.

## Screen 14: Settings, delete my data

Reached from Your data. A full page in the Shell layout, not a dialog, so it can't be confirmed by accident.

- **Title:** "Delete my data".
- **Line:** "This can't be undone. The app keeps no copy to go back to."
- **What goes:** "All your data", "Your setup answers", "The undo copy" and "Your AI keys", in a list with an icon each.
- **What stays:** "Export files on your Mac aren't touched. If you still have any, they aren't protected. Time Machine or other backups of this Mac may still hold the encrypted database."
- **Field:** "Enter your password to confirm".
- **Tick box:** "I understand this can't be undone."
- **Buttons:** "Delete everything" (danger) and "Keep my data". Delete everything stays off until the field has text and the box is ticked.
- **Leads to:** screen 1, with the note "Everything in the app is deleted." It removes the database file with its side files and the salt file, which takes the data, setup tables, undo copy and AI keys together (condition 28). It ends the session in every window, and clears the pending file and anything else held in memory.
- **How it runs:** The password is checked first. Then the app ends the session, writes a small marker with no data in it, removes the files, and removes the marker last. From the marker on, the delete always finishes. It never needs the password again.

| State | What shows |
|---|---|
| Loading | Button reads "Deleting…", and everything else is off. The idle timer can't lock halfway |
| Empty | Can't happen: the page needs a login, and login needs a database |
| Error, wrong password | On the field: "That password isn't right. Nothing was deleted." |
| Error, slowed down | On the field: "Too many tries. Try again in 30 seconds." It's the same count as login, so this page can't be used to guess faster |
| Error, delete failed | Before the marker: `.note--danger`: "This couldn't be started, so nothing was deleted. Try again." After the marker: the session has ended and the password field goes. `.note--danger`: "Some files couldn't be deleted yet." with Try again. Try again doesn't ask for the password. If it fails again: "This still couldn't be finished. Quit the app and use the command on the login screen." |
| Locked before confirming | Nothing is deleted, and the password field is cleared |
| Stale | Can't happen: the page shows no figures |

After 5 wrong tries here, the app locks. The count and the wait follow condition 32.

**Fields (S3-16).** Spell check and auto-correct are off. The field goes back to hidden and empty on submit, lock and error. Screen 14's field isn't autofilled.

**Widths.** The same column at all widths, up to 520px. Buttons go full width at 375 and 320. **Keyboard.** Password, show, tick box, Keep my data, Delete everything. Focus starts on the title. **Motion.** Field errors fade 140ms. Reduced motion: instant.

## Screen 15: Settings, AI (outline only)

The third part of Settings. The detail waits for Phases 10 to 12.

- **On it:** provider picker, key field with show and hide, model picker, a "Test connection" button, and the note on what's sent.
- **Note on what's sent:** its place is fixed here, directly above the key field. Its words come from Phases 9 to 11.
- **With no key:** "Add a key to turn on chat. The dashboards work without one."
- **States:** loading, saved, wrong key and no connection are all named here and worded in Phase 10.
- **Key field (S3-16, S3-17):** Spell check and auto-correct are off. The field goes back to hidden and empty on submit, lock and error. A saved key is never sent back to the page. Show works only on what's being typed.
- **Provider:** a fixed list, with no free-typed address.
- **Widths:** one column at all widths. **Keyboard:** reading order.

## Screen 16: Chat panel (outline only)

- **Where it sits:** a right-hand panel on every Shell screen, 380px wide. The page narrows to make room, so nothing is covered. On 375 and 320, it covers the page, with a close button at the top.
- **How it opens:** a Chat button in the header, after Upload. It's added in Phase 12. The panel keeps the period as context and shows it at the top, for example "Using This month".
- **With no key:** "Chat needs an AI key. Add one in Settings. Your dashboards work without it." with a Settings link.
- **Motion:** slides in 240ms when the owner opens it. Reduced motion: instant.
- **On lock:** the panel closes and clears. Chat text is cleared from the page on lock, and isn't kept in the browser.
- Anything more waits for Phase 12.

## Added to the flows

- **Log out during a task:** it follows the same rules as locking. "You're logged out." shows only after the server confirms, or if the server can't be reached at all. Otherwise screen 3 reads "Logging out didn't finish. Quit the app to be sure it's locked."
- **Delete my data partway through:** see screen 14. Nothing goes before Delete everything is pressed.
- **Undo after a lock:** Undo stays available in Settings after login, because the undo copy is saved.
- **Cancel on screen 8:** returns to the screen the owner came from and throws away the pending file. Nothing changes.
- **First time, cancelling:** there's no Cancel before the summary, because nothing is live yet. Closing the app follows the rules above, and Start over covers the rest.

## Import refusals

Each refusal is a named state on screens 4 and 8, with this exact wording from `src/lib/import/errors.ts`. Screen 4 adds "Nothing was saved. Export again from Money Manager and drop the new file here." Screen 8 adds "Nothing was changed. Export again from Money Manager and drop the new file here." Row refusals add row numbers only.

| State | Wording |
|---|---|
| `EMPTY_FILE` | This file is empty or has no rows. |
| `FILE_TOO_LARGE` | This file is too large. |
| `NOT_EXCEL` | This isn't an Excel export. |
| `PROTECTED_OR_OLD_FILE` | This file is password-protected or in the old Excel format. Export it again as .xlsx. |
| `MACRO_FILE` | This file contains macros, so it can't be imported. |
| `EXTERNAL_LINK` | This file links to other files, so it can't be imported. |
| `TOO_MANY_ENTRIES` | This file has too many parts inside it. |
| `UNPACKED_TOO_LARGE` | This file is too large once unpacked. |
| `DAMAGED_FILE` | This file is damaged. |
| `UNSAFE_XML` | This file contains content that isn't allowed. |
| `NOT_ONE_SHEET` | The export must have exactly one sheet. |
| `TOO_MANY_COLUMNS` | This file has too many columns. |
| `TOO_MANY_ROWS` | This file has too many rows. |
| `CELL_TOO_LONG` | A cell in this file is too long. |
| `TOO_MUCH_TEXT` | This file holds too much text. |
| `BAD_STRUCTURE` | This file's layout isn't one the app understands. |
| `UNSUPPORTED_CELL` | This file has a kind of cell the app doesn't understand. |
| `WRONG_COLUMNS` | The columns don't match the expected export. |
| `FORMULA_IN_VALUE` | A date, amount, type or account cell holds a formula, which isn't allowed. |
| `UNKNOWN_ROW_TYPE` | Some rows have a type the app doesn't recognise. |
| `BAD_DATE` | Some rows have a date the app can't read. |
| `BAD_AMOUNT` | Some rows have an amount the app can't read. |
| `MISSING_ACCOUNT` | Some rows have no account. |
| `AMOUNTS_TOO_LARGE` | The amounts in this file are too large to add up safely. |
| `SAVE_FAILED` | The import couldn't be saved. Nothing was changed. |
| `INTERNAL_ERROR` | The import failed. Nothing was changed. |

`ALREADY_IMPORTED` goes in Phase 4, when replacing arrives, so it has no state here.

## Notes for the build phases

- **All phases:** All app data lives in one folder, `~/Library/Application Support/personal-finance/`, with access for the owner's Mac user only. It's never in the project folder.
- **Phase 4:** must meet conditions 29 to 37 in `security.md`, including the font (30, 31) and removing whole files on delete (28). If Phase 4 ever clears tables instead, that needs a new review. The "changed" count needs a way to match rows between files, because the export has no row numbers of its own. A new income category counts as Earned by default, which is why the review shows it.
- **Phase 5:** savings rate below zero Earned needs handling on screen (F-2).
- **Phase 8:** the allocation bar needs a new system part with its own colours. It goes through "Changing the system", and each part also has a text label. F-1 means a broken transfer pair can leave Invested short, and the Unmatched transfers line is where it shows.

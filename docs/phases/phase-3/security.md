# Phase 3 security review (before build)

Reviewer: independent Security, fresh agent. This reviews the design only. Nothing is built, so nothing here is a sign-off of working code.

## Decision

**Not ready for the owner's sign-off yet.** There are 2 Blockers, 6 Majors and 9 Minors. Every Blocker and Major has an exact design change below, and all of them are wording or spec changes to `design.md`. No screen needs rethinking. AC-18 is met once those changes are in. A narrow re-check of the changed lines is enough.

**The design does a lot right.** Nothing shows before login. Errors use fixed wording with row numbers only. Period and drill-down stay out of web addresses. Delete is a full page with a password. There's no wipe button on the login screen.

**Password rule:** I propose 15 characters, not 12, plus a check against common passwords (S3-3).

**Font:** approved, with the conditions in the font section. The Google Fonts link in previews is fine for review.

## How I checked

Read: `CONSTRAINTS.md`, the brief, `design.md`, `PROJECT_BRIEF.md` section 10, the design system's rules, D-023, `errors.ts`, `encrypted-db.ts`, `request-policy.ts`, `proxy.ts`, `server.ts`, and `data-guard.mjs` for its size limit. Conditions 14, 24, 27 and 28 are quoted from the earlier reports. No spreadsheet was opened and no code was run.

From outside the repo I read the font's licence in the `google/fonts` repo and NIST SP 800-63B-4.

## Findings

### Blockers

**S3-1 Blocker: "You're logged out" can show while the session is still live.** Screen 7 says: "Error, Log out fails: The screen locks anyway. The session is cleared on the server first, and the page never waits for it." Those two sentences can't both hold. If the logout request fails while the server is up, the page says "You're logged out." but the session and the key are still live. Anyone who reloads the page is in. The owner walks away believing it's locked.

Change screen 7's row to:

> | Error, Log out fails | The page clears at once and shows screen 3. It sends the logout and tries once more if that fails. If the server still hasn't confirmed, screen 3's line reads "Logging out didn't finish. Quit the app to be sure it's locked." instead of "You're logged out." |

"You're logged out." shows only after the server confirms, or if the server can't be reached at all, because a stopped server holds no key. Add the same rule to "Log out during a task".

**S3-2 Blocker: a part-finished delete can leave the app stuck, and data behind.** This fails AC-7a ("ends on Create password") and AC-3. Screen 14's "Try again" isn't safe, for three reasons:

- Try again asks for the password. If the database is gone by then, nothing is left to check the password against, so the owner can never finish. `openEncryptedDb` needs both the database and its salt file.
- `createEncryptedDb` refuses to run if either the database or the salt file exists. Screen 1 is "shown only when there's no database". So with a leftover salt file, screen 1 shows, and every try ends in "The password couldn't be saved." for good.
- With a database and no salt file, login fails with a raw file error, and screen 2 has no state for it.

The wipe command (S3-4) and a crash during Create password can leave the same half states. Separately, `openEncryptedDb` can fail for reasons other than a wrong password, and screen 2 has nowhere to show that. An owner who sees the wrong message might wipe good data.

Make these changes:

1. **Screen 14, add "How it runs":** "The password is checked first. Then the app ends the session, writes a small marker with no data in it, removes the files, and removes the marker last. From the marker on, the delete always finishes. It never needs the password again."
2. **Screen 14, replace the "Error, delete failed" row:**

   > | Error, delete failed | Before the marker: `.note--danger`: "This couldn't be started, so nothing was deleted. Try again." After the marker: the session has ended and the password field goes. `.note--danger`: "Some files couldn't be deleted yet." with Try again. Try again doesn't ask for the password. If it fails again: "This still couldn't be finished. Quit the app and use the command on the login screen." |

3. **Add a "What opens when the app starts" table under Flows:**

   | Files found | Opens |
   |---|---|
   | No database, no salt file, no marker | Screen 1 |
   | Database and salt file, no marker | Screen 2 |
   | Marker | The app finishes the delete, then shows screen 1 with "Everything in the app is deleted." |
   | Only one of database and salt file, no marker | Screen 2, new state below. Nothing is deleted automatically, because the missing file may be in a backup |

4. **Screen 2, add two states:**

   > | Error, files incomplete | Note, with no password field: "Some of the app's files are missing, so it can't open. Nothing was changed." Then the forgotten-password steps |
   > | Error, can't open | Note: "The app couldn't check your password. Nothing was changed. Quit the app and try again." |

   "That password isn't right." shows only for `WrongPasswordError`. A badly damaged file also gives that error, and the code can't tell the two apart, so see Known limits.

### Majors

**S3-3 Major: the password rule (screen 1).** 12 is too low, and length alone lets `123456789012` through. This password is the only thing protecting the data. It's single-factor, it's the encryption key, and anyone with a copy of the files can guess at it offline, where the slow-down doesn't apply. Argon2id at the code's settings slows that guessing a lot, but people's 12-character passwords are far weaker than 12 random characters. NIST SP 800-63B-4 sets 15 for single-factor passwords, with a common-password check and no "must include a number" rules. There's also no "change password" screen, so a weak password can't be fixed later without deleting everything.

15 costs the owner almost nothing, because three short words reach it. Changes to screen 1:

- Hint: "At least 15 characters. A short phrase works well."
- Error, too short: "Use at least 15 characters."
- New state, Error, too common: on the field: "That one's too easy to guess. Try a short phrase of your own."
- New state, Error, too long: on the field: "Use 256 characters or fewer."
- Remove "The minimum is a proposal for Security to confirm."

Rules for Phase 4 are in condition 33. This changes a requirement, so it needs the owner's yes.

**S3-4 Major: the Terminal wipe (screen 2).** A pasted delete command is the riskiest step in the app, and the design has three gaps:

- Nothing says where the data lives. The code has no default path yet, so the command has nothing safe to point at.
- "Close the app" is unclear. Closing the browser tab leaves the server running.
- It teaches the owner to paste commands from a web page, and that's how fake "fix it" pages attack people. A look-alike page could show a harmful command.

Changes:

1. **Add to "Notes for the build phases":** "All app data lives in one folder, `~/Library/Application Support/personal-finance/`, with access for the owner's Mac user only. It's never in the project folder." The project sits in Documents, which iCloud can sync, and the leftovers check treats database files in the project as a failure.
2. **Replace the Forgotten password row's text with:**

   > "There's no reset, because a reset would be a way in for anyone else. To start again, stop the app by pressing Control-C in its Terminal window. Then paste this into Terminal and press Return. It lists what it will delete and asks you to type DELETE. It deletes everything in the app, including setup answers, the undo copy and AI keys. Export files on your Mac aren't touched. It downloads nothing and never asks for your Mac password. Only use this command from this screen."

   Then the command, Copy, and "Then run the app again and create a new password."
3. **Add Copy's states:** the button reads "Copied" for 2 seconds. If copying fails: "Couldn't copy. Select the command and copy it yourself." The command must stay selectable.
4. **Add a line:** "The command is a short call to a script that ships with the app, so it can be read first." Phase 4 meets condition 29.

**S3-5 Major: where the pending file and undo copy live, and what stops two actions colliding (screen 8).** The design promises "It takes one step, so it all happens or none of it does", but doesn't say where anything is kept. If the undo copy were a second file, that promise couldn't be kept, because two files can't be saved in one step. It would also be one more thing for delete and the wipe to miss. "The review is thrown away" is also only described on the screen, and a page can be bypassed.

Add under screen 8:

> **Where things live.** The pending file is held only in the server's memory, tied to this session. There's one at most. It's never written to disk, to the database or to the browser. It goes on Cancel, lock, logout, restart or a new upload. The undo copy is kept in the same encrypted database as a second set of tables, so replacing and keeping the copy are one saved step, and deleting the database removes it. AI keys live in the same database.
>
> **One change at a time.** Replace, undo, setup save, Start over and delete take turns, using one lock. Each review and each Settings page carries a data version. The server refuses a save if the version has changed, whatever the page shows. A second window's review can't be confirmed after the first has saved.
>
> **Saving and locking.** Saving counts as use. If a logout from another window arrives during a save, the save finishes or rolls back before the database closes.

Also, the row "Error, save failed" should read "The file is gone by then if the app has locked" only if a lock can still happen mid-save, and with this rule it can't. Keep the sentence for a save that failed before a later lock.

**S3-6 Major: delete wording promises more than the app can deliver (screens 2, 14).** "There's no copy to go back to." and "Everything in the app is deleted." are true of the app, but Time Machine or another backup of this Mac can still hold the old database. It stays encrypted, but it does exist, and anyone with the old password could open it. A security promise should be exactly true.

Changes on screen 14:

- Line: "This can't be undone. The app keeps no copy to go back to."
- What stays: "Export files on your Mac aren't touched. If you still have any, they aren't protected. Time Machine or other backups of this Mac may still hold the encrypted database."
- **Leads to:** replace "It clears the data and setup tables, the undo copy and AI keys (condition 28), then ends the session." with "It removes the database file with its side files and the salt file, which takes the data, setup tables, undo copy and AI keys together (condition 28). It ends the session in every window, and clears the pending file and anything else held in memory."

Removing whole files is stronger than clearing tables, because cleared rows can linger inside the file. If Phase 4 ever clears tables instead, that needs a new review.

Add the same backup sentence to the forgotten-password text only if it stays short. Otherwise the Known limits entry covers it.

**S3-7 Major: the 15-minute lock has gaps (shared Locking rule, screen 3).** Three of the design's own features can defeat it:

- "Your data changed in another window" needs some way to notice. If that's a background check to the server, and any request counts as use, the app never locks.
- "A file being read counts as use" has no limit stated.
- A Mac that sleeps pauses timers, so an open dashboard can show figures on waking for a moment or longer.

Add to the Locking rule:

> Only something the owner does counts as use: a click, a key press or an action they started. Background checks never count. A file being read counts only until the reader's time limit. Idle time is worked out from the clock on every request, so sleep counts as idle. When a window wakes or gets focus, it asks first and clears straight away if locked. A lock clears every window. The server decides, and the page's timer only follows it.

**S3-8 Major: file text can reach browser history through page titles (conditions 14, 27).** The rule covers web addresses, logs and errors, but not the browser tab title. Chrome saves titles to its history on disk, unencrypted, so a title like "Groceries – Spending" leaks file text outside the app. Saved browser history state has the same risk. The rule is also filed under "screens 7 to 16", while screens 5, 6 and 8 show file text too.

Move the "Text from the file" rule to Foundations, so it covers every screen, and replace it with:

> **Text from the file (conditions 14 and 27).** Account, category and note text is set as plain text only, on every screen, including chart labels and tooltips. It's never read as HTML, and it never builds a link. It's never placed in a web address, tab title, browser history state, log, error or the browser's storage. Tab titles are the app's fixed screen names. Drill-down uses a number the app gives each category for that session. A number from an old session opens Spending level 1. Hidden direction-changing characters in names don't change how the text around them reads, and one long unbroken name wraps. The upload's file name is never shown or kept.

### Minors

**S3-9 Minor: slow-down has no numbers.** "The wait grows" needs a rule, and "30 seconds" is only an example. Add to screen 2: "Three wrong tries are free. Then the wait is 30 seconds, doubling each time, up to 15 minutes. It never locks for good." Details are in condition 32. The wording on screens 2 and 14 is fine, and the shared count is right.

**S3-10 Minor: guessing from an open session.** Screen 14 lets someone at an unlocked app try passwords. Add: "After 5 wrong tries here, the app locks." Otherwise they could keep guessing inside the session, though the wait still applies.

**S3-11 Minor: other wording that overstates.**

- Locked in screen 5: "Your file is still here." The file has gone, and only its rows are kept. Use: "The app locked, so your unsaved answers are gone. Your rows are still here."
- First-time flow: "the file is deleted straight away" reads as the owner's export. Use: "the app keeps no copy of the file."
- Screen 8: "Your current data is kept, encrypted, so you can undo this." There's only one undo. Use: "Your current data is kept, encrypted, so you can undo this until your next update."
- Screen 4: "It's read here and never leaves this Mac." Chat will send some data out from Phase 12. Use: "It's read here, and the file is never sent anywhere."

**S3-12 Minor: the delete reminder.** Deleted files go to the Trash, where they're still readable. The reminder on screens 6 and 8 should read: "Now delete the export file from your Mac and empty the Trash, because it isn't protected there." A lock before Dismiss shouldn't lose it, so show it again after login until it's dismissed.

**S3-13 Minor: returning after login.** "The screen the owner was on" and the lock reasons must not come from the web address, or a crafted link could show a false message or send the owner elsewhere. Add: "The return screen and the reason line are picked from fixed lists held by the server. After a restart, the app opens on Overview." The same goes for "Everything in the app is deleted."

**S3-14 Minor: what shows before login, and Start over.** Nothing leaks, but two things need saying. The create-password request gets the same `Host`, same-origin and size checks as every other, because it's the one action that works with no session. Start over needs no password, so the server must refuse it once the summary has been confirmed.

**S3-15 Minor: partial warning is checked on the page only.** Replace my data staying off is a page rule. The server must refuse a save without the tick when a warning applied. Also add one trigger: most accounts in the current data are missing from the file. A wrong person's or wrong profile's file can have similar dates and row counts.

**S3-16 Minor: password and key fields.** The Delete page's field shouldn't be filled in by the browser, or the check means less. Show/hide makes a password plain text, and some browser spell checkers send text out. Add to screens 1, 2, 3, 14 and 15: "Spell check and auto-correct are off. The field goes back to hidden and empty on submit, lock and error. Screen 14's field isn't autofilled."

**S3-17 Minor: AI screens (outline).** Fine for now. Add to screen 15: "A saved key is never sent back to the page. Show works only on what's being typed." Add to screen 16: "Chat text is cleared from the page on lock, and isn't kept in the browser." Provider is a fixed list, with no free-typed address. Phases 10 to 12 set the rest.

## Your specific questions

| Area | Answer |
|---|---|
| Terminal wipe | Allowed, with S3-2, S3-4 and condition 29 |
| Delete my data | Sound once S3-2 and S3-6 are in. The password check, full page and shared count are right |
| Password | 15 characters plus a common-password check, S3-3 |
| Font | Approved with conditions 30 and 31 |
| Update, replace, undo | Sound once S3-5 is in. Partial warning: S3-15. Wording: S3-11 |
| Conditions 14, 27 | Met once S3-8 is in. `Nothing in Groceries for this period.` is an empty state, not an error, so it's allowed |
| Condition 24 | Met. Screens 4, 5, 8 and the shared error all use fixed wording, and row refusals add numbers only. `ALREADY_IMPORTED` going in Phase 4 is right |
| Condition 28 | Met by removing the whole database, S3-6 |
| Before login | Clean. See S3-13 and S3-14 |
| Period in memory | Good. Keep it in the server's session and send it in a request body, never a query string (conditions 25 and 26 still apply) |
| Sidebar choice | Fine. It's one yes/no value in the browser and says nothing about money. Store only that fixed value, and wrap the read in a try, as the preview does. It can survive a delete |
| Chat outline | Fine for now, S3-17 |

## Font (D-023)

**Licence.** The `google/fonts` repo lists Google Sans Flex under SIL Open Font License 1.1, with no Reserved Font Name. So it can be bundled, cut down to fewer characters and keep its name. The licence must travel with the font.

**Content Security Policy.** No change needed. `font-src 'self'` is already set, so even a mistaken Google link would be blocked in the app. Don't loosen it, and don't add `data:`.

**No calls to Google.** `system.css` holds no web addresses, which is correct. The trap is `next/font/google`, which fetches from Google at build time and looks harmless. See condition 30.

**Previews.** Loading from Google Fonts for review is acceptable. Previews hold only made-up data, aren't part of the app, and Google sees only the font's name and the viewer's network address. They must never be served by the app (condition 31).

## Conditions

Numbering carries on from Phase 2.

**Before this phase's merge:**

- All Blockers and Majors above are in `design.md`, and the owner has answered S3-3. Minors go in the handoff, and I'd take them too, since each is a line of wording.

**Before Phase 4 finishes:**

29. **The wipe.** It's a script that ships in the repo, called by one short command.
    - **Copy button:** the text comes from one fixed value, the same one shown on screen. It's a single line with no line break at the end, so pasting can't run it by itself. Nothing in it comes from a web address, a request or the file. If the project path goes in the command, it's set by the server at start and safely quoted.
    - **The command must not contain:** `sudo`, `curl`, `eval`, encoded text, a pipe to a shell, a wildcard, or `rm -rf` on a variable.
    - **What it may touch:** only the exact named files in the data folder: database, side files, salt, marker. The list comes from the same code the app uses. Then the folder, if it's empty.
    - **What it must not touch:** anything else, including exports, Desktop, Downloads, Trash, the project folder, `.git`, settings files and anything it doesn't recognise, which it reports and leaves. It never searches the disk.
    - **Refusals:** it stops if `HOME` is unset, if the data folder is a symbolic link or isn't where expected, if any target is a link, or if the app is running.
    - **Flow:** it lists what it will delete and needs DELETE typed. It removes the database first and the salt last, and can safely run twice. It prints fixed lines only, and ends by saying everything went or naming what's left.
    - **Tests:** using a made-up folder, sibling files and link targets survive, a half-wiped folder finishes, and the copied text equals the shown text.
30. **Font.** Add it as a local file, using `next/font/local` or a plain `@font-face` in the app's own CSS. Never use `next/font/google`, `@import`, `src: local()`, or a package that fetches at install. Use `woff2` only. Download it once from the official `google/fonts` repo and record its SHA-256 and source in `docs/DECISIONS.md`. Put `OFL.txt` beside it. The guard refuses files over 5 MiB, so cut the font down rather than change the guard, and keep ₹ (U+20B9) and the 400 to 700 weights. It loads before login, so the session gate may let through only that one fixed path, or `/_next/static/`. Security checks the file at sign-off.
31. **No Google in the app.** A test fails if `fonts.googleapis.com` or `fonts.gstatic.com` appears in `src/`, `public/` or the build. A browser run across login and a dashboard shows requests to `127.0.0.1` only. Previews and `gallery.html` are never served by the app.
32. **Slow-down.** The server enforces it, not the page. One count covers login, Locked and screen 14. A try during a wait is refused before any password work, even if it's correct. Password checks run one at a time, so repeated tries can't use up the Mac's memory. The count can sit in memory, because anyone able to restart the app can copy the files and guess offline anyway. It's a speed bump, and Argon2id is the real protection. The check on screen 14 needs a second open of the database, because the code clears the key from memory after opening.
33. **Password handling.** The minimum counts characters, not code units. Allow up to 256 and refuse more before any hashing. No "must include" rules. Don't trim spaces. Normalise to one Unicode form before hashing, and decide this now, because it can't change without making existing data unreadable. The common-password list ships in the app, and is never an online lookup. It also refuses one repeated character and simple runs. All password forms use `method="post"`, so a page that hasn't finished loading can't put a password in a web address. No password appears in a log or a stored state.
34. **Screens after lock.** After lock or logout, browser Back shows no figures. Test this in plain Chrome. `no-store` is already set, so this is a check.
35. **Screens.** No `dangerouslySetInnerHTML` or `innerHTML` for file text, chart tooltips included. Test with made-up marker names holding HTML, a long unbroken string and direction-changing characters. Check the tab title and web address across a full drill-down. Add the `Referrer-Policy`, CSP and same-origin checks to every new route.
36. **Removed names on replace.** Screen 8 says answers for names no longer in the file go when the owner confirms, but condition 28 says answers survive a replace. Phase 4 must follow the screen, keep the old answers only in the undo copy, and test that a removed account's name is gone from the live setup tables.
37. **Earlier conditions still stand.** 12 and 13 (worker limits, size limit before reading, bytes dropped) and 23 to 28 apply to Phase 4. The upload must not spill to a temporary file on disk.

**Later:**

38. **Phases 10 to 12:** S3-17, with a fresh review of screens 15 and 16 when they're worded.
39. **Before real data (Phase 13):** decide with the owner whether to leave the data folder out of Time Machine. Being in backups means more encrypted copies, but also a way to recover.

## Known limits

- **Backups.** Delete and the wipe can't reach Time Machine or other backups. Old copies stay encrypted, and open with the old password.
- **Anyone at the logged-in Mac** can run the wipe. That destroys the data but doesn't expose it, and the export restores it.
- **No password change.** If the password is ever exposed, the only fix is delete and start again. There's no such feature in the brief, so I'm reporting it, not asking for it.
- **Damaged database.** A badly damaged file looks the same as a wrong password, so the owner could wipe it. They'd lose nothing they can't rebuild from a new export.
- **Slow-down** does nothing against a stolen copy of the files. The password's strength and Argon2id do that work.
- **One undo.** Two bad uploads in a row lose the good copy, and the fix is a fresh export.
- **Browser extensions** can read what's on the page, the same as a compromised Mac.

## Not verified

- Nothing was built, so every control here is unproven until Phase 4's sign-off.
- I didn't test how Chrome handles Back after lock, or what it saves in history. Conditions 34 and 35 cover this.
- I didn't download the font, so its size, its ₹ character and its file contents are unchecked.
- I read the licence in the `google/fonts` repo only. I didn't compare it with the font's own source repo.
- I reviewed the written design, not `previews/first-time.html` line by line. I checked only its font links and sidebar storage.

## Narrow re-check

Reviewer: independent Security, fresh agent. I compared S3-1 to S3-8 with the matching lines of `design.md`, and read the three rulings below. This is still a design review. Nothing is built, and the Not verified list above still applies.

**Result: all Blockers and Majors are in, and this replaces the "Not ready" decision at the top of this file.** The design can go to the owner for sign-off. S3-3 still needs the owner's yes.

| Finding | Result | Where in `design.md` |
|---|---|---|
| S3-1 Blocker | In as written | Screen 7's "Error, Log out fails" row, screen 3's table, "Log out during a task" |
| S3-2 Blocker | In as written, all four changes | "What opens when the app starts", screen 2's two new states, screen 14's "How it runs" and "Error, delete failed" row |
| S3-3 Major | Wording in as written, and the old proposal line is gone. **Waits for the owner's yes** | Screen 1 |
| S3-4 Major | In as written, all four changes | Screen 2, "Notes for the build phases" |
| S3-5 Major | In as written, including the "Error, save failed" row | Screen 8 |
| S3-6 Major | In as written. The old "There's no copy" line is gone. The backup sentence isn't in the forgotten-password text, which S3-6 allowed, so Known limits covers it | Screen 14 |
| S3-7 Major | In as written | Shared Locking rule |
| S3-8 Major | In as written, and moved to Foundations | Foundations |

### Rulings

1. **S3-15 wording: accepted.** "Most of your current accounts aren't in this file." is plain, and it names no account or figure. For Phase 4, "most" means more than half of the current accounts, and the server makes this check as well as the page.

2. **S3-16, keeping the text after a page check: allowed, within limits.** My rule protects a password that has already been sent or that the app has finished with. A check made on the page sends nothing, and making the owner retype adds no safety.
   - **Allowed:** screen 1 only, for "too short", "too long", "no match" and "box not ticked", and only when no request was sent. The text stays, and the field goes back to hidden.
   - **Still empties:** anything after a request was sent, including "too common" if the server finds it and "save failed". Every lock also empties it. Screens 2, 3, 14 and 15 have no exception.
   - **The server repeats every check.** A page check never replaces it.
   - **One line needed:** `design.md` and the preview now differ, so the Designer should add this to screen 1's Fields rule: "A check made on the page, before anything is sent, keeps the text and hides it." This is a Minor and doesn't hold up AC-18.
   - **Checked:** the preview's submit step sets the fields back to hidden. I didn't confirm from the code that it keeps the text, and I took that from the request.

3. **S3-13, unfinished first-time flow: allowed.** S3-13 exists so a web address can't choose the return screen or the message. The added line doesn't weaken that, and Overview can't show before the summary is confirmed. For Phase 4, the server works out the step from what's saved: no rows, rows, saved answers, or confirmed summary. The step never comes from the web address or the page. Phase 4 tests that a crafted address can't skip a step or reach Overview early, and adds this to its checks for S3-13.

### AC-18

**Met for the design as it stands.** My first review said AC-18 is met once the Blockers and Majors are in, and they are. If the owner says no to S3-3, the password rule comes back to Security before sign-off, because the 15-character rule is part of this result.

**Before this phase's merge:** the owner answers S3-3. The ruling 2 line is a Minor and goes in with the other Minors.

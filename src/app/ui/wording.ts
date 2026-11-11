/** Fixed wording from design.md. No text from a file or an error ever reaches the page (condition 24). */
export const WORDS = {
  tooShort: "Use at least 15 characters.",
  tooCommon: "That one's too easy to guess. Try a short phrase of your own.",
  tooLong: "Use 256 characters or fewer.",
  noMatch: "These don't match.",
  notTicked: "Please confirm you've read this.",
  saveFailed: "The password couldn't be saved. Try again.",
  wrong: "That password isn't right.",
  wrongDelete: "That password isn't right. Nothing was deleted.",
  cantOpen: "The app couldn't check your password. Nothing was changed. Quit the app and try again.",
  filesIncomplete: "Some of the app's files are missing, so it can't open. Nothing was changed.",
  deleted: "Everything in the app is deleted.",
  deleteBefore: "This couldn't be started, so nothing was deleted. Try again.",
  deleteAfter: "Some files couldn't be deleted yet.",
  deleteAfterAgain: "This still couldn't be finished. Quit the app and use the command on the login screen.",
  copyFailed: "Couldn't copy. Select the command and copy it yourself.",
  toBeforeFrom: "The end date must be on or after the start date.",
  notADate: "That date doesn't exist.",
  afterToday: "Choose a date up to today.",
  summaryFailed: "This couldn't be finished. Nothing was lost.",
  firstRefused: "Nothing was saved. Export again from Money Manager and drop the new file here.",
  updateRefused: "Nothing was changed. Export again from Money Manager and drop the new file here.",
  sameFile: "This file matches your current data, so there's nothing to update.",
  uploadLost: "The app locked before you confirmed, so nothing changed. Upload the file again.",
  changedElsewhereUpload: "Your data changed in another window, so upload the file again.",
  changedElsewhere: "Your data changed in another window.",
  replaceFailed: "The import couldn't be saved. Nothing was changed.",
  setupFailed: "Setup couldn't be saved. Nothing was changed.",
  setupSaved: "Saved. Every screen now uses these answers.",
  leaveTitle: "Leave without saving?",
  leaveText: "Your changes will be lost.",
  undoFailed: "The undo couldn't be finished. Nothing was changed.",
  noteImported: "Your data is in. Now delete the export file from your Mac and empty the Trash, because it isn't protected there.",
  noteUpdated: "Your data is updated. Now delete the export file from your Mac and empty the Trash, because it isn't protected there.",
  noteUndone: "Your data is back to how it was.",
  nothingToUndo: "Nothing to undo yet.",
} as const;

export const LOCK_LINES = {
  idle: "Locked after 15 minutes without use.",
  restart: "The app restarted, so it's locked.",
  logout: "You're logged out.",
  unconfirmed: "Logging out didn't finish. Quit the app to be sure it's locked.",
} as const;

export function waitWords(seconds: number): string {
  return `Too many tries. Try again in ${seconds} seconds.`;
}

/** Row refusals add row numbers only: "Rows 12, 48 and 3 more." */
export function rowsLine(rows: readonly number[], rowCount: number): string {
  const shown = rows.slice(0, 2);
  const [first, second] = shown;
  if (first === undefined) return "";
  const more = Math.max(0, rowCount - shown.length);
  if (second === undefined) return more === 0 ? `Row ${first}.` : `Rows ${first} and ${more} more.`;
  return more === 0 ? `Rows ${first} and ${second}.` : `Rows ${first}, ${second} and ${more} more.`;
}

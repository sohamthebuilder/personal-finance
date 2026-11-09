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

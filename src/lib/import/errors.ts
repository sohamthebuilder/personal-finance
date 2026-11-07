/**
 * Every reason an import can fail. Messages are fixed text, so nothing from a
 * file can reach an error, a log or the screen. Only row numbers are added.
 */
export const REJECTION_MESSAGES = {
  ALREADY_IMPORTED: "Data has already been imported. Replacing it isn't available yet.",
  EMPTY_FILE: "This file is empty or has no rows.",
  FILE_TOO_LARGE: "This file is too large.",
  NOT_EXCEL: "This isn't an Excel export.",
  PROTECTED_OR_OLD_FILE: "This file is password-protected or in the old Excel format. Export it again as .xlsx.",
  MACRO_FILE: "This file contains macros, so it can't be imported.",
  EXTERNAL_LINK: "This file links to other files, so it can't be imported.",
  TOO_MANY_ENTRIES: "This file has too many parts inside it.",
  UNPACKED_TOO_LARGE: "This file is too large once unpacked.",
  DAMAGED_FILE: "This file is damaged.",
  UNSAFE_XML: "This file contains content that isn't allowed.",
  NOT_ONE_SHEET: "The export must have exactly one sheet.",
  TOO_MANY_COLUMNS: "This file has too many columns.",
  TOO_MANY_ROWS: "This file has too many rows.",
  CELL_TOO_LONG: "A cell in this file is too long.",
  TOO_MUCH_TEXT: "This file holds too much text.",
  BAD_STRUCTURE: "This file's layout isn't one the app understands.",
  UNSUPPORTED_CELL: "This file has a kind of cell the app doesn't understand.",
  WRONG_COLUMNS: "The columns don't match the expected export.",
  FORMULA_IN_VALUE: "A date, amount, type or account cell holds a formula, which isn't allowed.",
  UNKNOWN_ROW_TYPE: "Some rows have a type the app doesn't recognise.",
  BAD_DATE: "Some rows have a date the app can't read.",
  BAD_AMOUNT: "Some rows have an amount the app can't read.",
  MISSING_ACCOUNT: "Some rows have no account.",
  AMOUNTS_TOO_LARGE: "The amounts in this file are too large to add up safely.",
  SAVE_FAILED: "The import couldn't be saved. Nothing was changed.",
  INTERNAL_ERROR: "The import failed. Nothing was changed.",
} as const;

export type RejectionCode = keyof typeof REJECTION_MESSAGES;

export class ImportRejected extends Error {
  readonly code: RejectionCode;
  readonly rows: readonly number[];
  readonly rowCount: number;

  constructor(code: RejectionCode, rows: readonly number[] = [], rowCount = rows.length) {
    super(REJECTION_MESSAGES[code]);
    this.name = "ImportRejected";
    this.code = code;
    this.rows = rows;
    this.rowCount = rowCount;
  }
}

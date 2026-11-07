import { ImportRejected, type RejectionCode } from "./errors.ts";
import { type Cell, LIMITS, type Limits, readXlsx, type ReadStats } from "./xlsx-reader.ts";

/** The format's fixed labels, from docs/export-format.md. Columns are read by position only. */
export const EXPECTED_HEADER = [
  "Period",
  "Accounts",
  "Category",
  "Subcategory",
  "Note",
  "INR",
  "Income/Expense",
  "Tag",
  "Description",
  "Amount",
  "Currency",
  "Accounts",
] as const;

export const ROW_TYPES = [
  "Exp.",
  "Income",
  "Transfer-In",
  "Transfer-Out",
  "Income Balance",
  "Expense Balance",
] as const;

export type RowType = (typeof ROW_TYPES)[number];

const COLUMN = {
  period: 0,
  account: 1,
  category: 2,
  subcategory: 3,
  note: 4,
  inr: 5,
  type: 6,
  originalAmount: 9,
  currency: 10,
  secondAccount: 11,
} as const;

export interface ImportRow {
  /** The row's number in the sheet. */
  rowNumber: number;
  /** Local date and time, as YYYY-MM-DDTHH:MM:SS. */
  occurredAt: string;
  account: string;
  category: string;
  subcategory: string;
  note: string;
  /** The `INR` column in whole paise. All maths uses this. */
  amountPaise: number;
  type: RowType;
  /** Kept as written, for reference only. */
  originalAmount: string;
  currency: string;
  secondAccount: string;
}

export interface ParsedExport {
  rows: ImportRow[];
  /** Amounts with real detail below a paisa, which were rounded to the nearest paisa. */
  roundedAmounts: number;
}

const DECIMAL = /^([+-]?)([0-9]{1,18})(?:\.([0-9]{1,30}))?(?:[eE]([+-]?[0-9]{1,2}))?$/;
/** Digits this long after the paisa are how decimal numbers come out of a spreadsheet, not real detail. */
const NUMBER_NOISE = /^(?:0{6,}|9{6,})/;

/** Exact decimal to paise, with no floating-point maths. Returns null if it isn't a plain, safe number. */
export function toPaise(text: string): { paise: number; rounded: boolean } | null {
  const match = DECIMAL.exec(text);
  if (match === null) return null;
  const [, sign, whole = "", fraction = "", exponent = "0"] = match;
  const digits = whole + fraction;
  const paiseDigits = whole.length + Number(exponent) + 2;

  let kept: string;
  let dropped: string;
  if (paiseDigits <= 0) {
    kept = "0";
    dropped = "0".repeat(-paiseDigits) + digits;
  } else {
    const padded = digits.padEnd(paiseDigits, "0");
    kept = padded.slice(0, paiseDigits);
    dropped = padded.slice(paiseDigits);
  }

  let paise = BigInt(kept);
  if (dropped.startsWith("5") || (dropped[0] ?? "0") > "5") paise += 1n;
  if (paise > BigInt(Number.MAX_SAFE_INTEGER)) return null;

  const rounded = /[1-9]/.test(dropped) && !NUMBER_NOISE.test(dropped);
  const value = Number(paise);
  return { paise: sign === "-" && value !== 0 ? -value : value, rounded };
}

const PERIOD_TEXT = /^([0-9]{2})\/([0-9]{2})\/([0-9]{4}), ([0-9]{2}):([0-9]{2}):([0-9]{2})$/;
const SERIAL = /^[0-9]{1,7}(?:\.[0-9]{1,20})?$/;
const FIRST_SERIAL = 61; // 1 March 1900, past Excel's false leap day.
const LAST_SERIAL = 2_958_465; // 31 December 9999.
const DAYS_FROM_1900_TO_1904 = 1462;
const SECONDS_PER_DAY = 86_400;

function isoFrom(year: number, month: number, day: number, hour: number, minute: number, second: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  // Date quietly rolls 31 February into March, so check it kept what it was given.
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute ||
    date.getUTCSeconds() !== second
  ) {
    return null;
  }
  return date.toISOString().slice(0, 19);
}

function parsePeriod(cell: Cell, uses1904Dates: boolean): string | null {
  if (cell.kind === "text") {
    const match = PERIOD_TEXT.exec(cell.text);
    if (match === null) return null;
    const [, day, month, year, hour, minute, second] = match;
    return isoFrom(Number(year), Number(month), Number(day), Number(hour), Number(minute), Number(second));
  }
  if (!SERIAL.test(cell.text)) return null;
  const serial = Number(cell.text) + (uses1904Dates ? DAYS_FROM_1900_TO_1904 : 0);
  if (serial < FIRST_SERIAL || serial > LAST_SERIAL) return null;
  const seconds = Math.round(serial * SECONDS_PER_DAY);
  return new Date(Date.UTC(1899, 11, 30) + seconds * 1000).toISOString().slice(0, 19);
}

function textOf(cell: Cell | null | undefined): string {
  return cell?.text ?? "";
}

function isRowType(value: string): value is RowType {
  return (ROW_TYPES as readonly string[]).includes(value);
}

const MAX_ROWS_LISTED = 20;

class RowProblems {
  private readonly byCode = new Map<RejectionCode, { rows: number[]; count: number }>();

  add(code: RejectionCode, rowNumber: number): void {
    const problem = this.byCode.get(code) ?? { rows: [], count: 0 };
    if (problem.rows.length < MAX_ROWS_LISTED) problem.rows.push(rowNumber);
    problem.count += 1;
    this.byCode.set(code, problem);
  }

  throwFirst(): void {
    for (const [code, { rows, count }] of this.byCode) throw new ImportRejected(code, rows, count);
  }
}

/** Reads a whole export and checks every row. Nothing is saved here. */
export async function parseExport(
  bytes: Uint8Array,
  limits: Limits = LIMITS,
  stats?: ReadStats,
): Promise<ParsedExport> {
  type Pending = { rowNumber: number; cells: ReadonlyArray<Cell | null> };
  const pending: Pending[] = [];
  let sawHeader = false;

  const { uses1904Dates } = await readXlsx(
    bytes,
    (rowNumber, cells) => {
      if (!sawHeader) {
        sawHeader = true;
        const matches = rowNumber === 1 && EXPECTED_HEADER.every((name, index) => textOf(cells[index]) === name);
        if (!matches) throw new ImportRejected("WRONG_COLUMNS");
      } else if (cells.some((cell) => cell !== null)) {
        pending.push({ rowNumber, cells });
      }
    },
    limits,
    stats,
  );

  if (pending.length === 0) throw new ImportRejected("EMPTY_FILE");

  const problems = new RowProblems();
  const rows: ImportRow[] = [];
  let roundedAmounts = 0;

  for (const { rowNumber, cells } of pending) {
    const period = cells[COLUMN.period];
    const inr = cells[COLUMN.inr];
    const original = cells[COLUMN.originalAmount];
    const typeCell = cells[COLUMN.type];
    const accountCell = cells[COLUMN.account];
    if (period?.formula || inr?.formula || original?.formula || typeCell?.formula || accountCell?.formula) {
      problems.add("FORMULA_IN_VALUE", rowNumber);
      continue;
    }

    const type = textOf(typeCell);
    const occurredAt = period ? parsePeriod(period, uses1904Dates) : null;
    const amount = inr ? toPaise(inr.text) : null;
    const account = textOf(accountCell);

    if (!isRowType(type)) problems.add("UNKNOWN_ROW_TYPE", rowNumber);
    if (occurredAt === null) problems.add("BAD_DATE", rowNumber);
    if (amount === null) problems.add("BAD_AMOUNT", rowNumber);
    if (account === "") problems.add("MISSING_ACCOUNT", rowNumber);
    if (!isRowType(type) || occurredAt === null || amount === null || account === "") continue;

    if (amount.rounded) roundedAmounts += 1;
    rows.push({
      rowNumber,
      occurredAt,
      account,
      category: textOf(cells[COLUMN.category]),
      subcategory: textOf(cells[COLUMN.subcategory]),
      note: textOf(cells[COLUMN.note]),
      amountPaise: amount.paise,
      type,
      originalAmount: textOf(original),
      currency: textOf(cells[COLUMN.currency]),
      secondAccount: textOf(cells[COLUMN.secondAccount]),
    });
  }

  problems.throwFirst();
  return { rows, roundedAmounts };
}

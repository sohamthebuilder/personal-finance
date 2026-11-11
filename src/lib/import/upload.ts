/**
 * What the two upload routes do, kept apart from Next.js so tests can run it.
 * The file is read in the worker, the bytes are gone afterwards, and nothing
 * is written to disk before the rows are saved in the encrypted database.
 */
import { changeFor, sessionStore, type Unlocked } from "../auth/session.ts";
import { buildPending, saveFirstRows } from "../data/update.ts";
import { firstTimeStep } from "../setup/progress.ts";
import { amountsAddUpSafely } from "./balances.ts";
import { ImportRejected, type RejectionCode } from "./errors.ts";
import type { ImportRow } from "./parse-export.ts";
import { type ReadOptions, readInWorker, ReaderBusy } from "./read-in-worker.ts";

/** How many row numbers a refusal carries. The screen shows two, then a count. */
const ROWS_SHOWN = 2;

export type UploadRefusal = {
  ok: false;
  /** BUSY: a file is already being read. LOCKED: the session ended. WRONG_STEP: this isn't the screen for it. */
  code: RejectionCode | "BUSY" | "LOCKED" | "WRONG_STEP";
  rows: number[];
  rowCount: number;
};

const refuse = (code: UploadRefusal["code"], rows: readonly number[] = [], rowCount = 0): UploadRefusal => ({
  ok: false,
  code,
  rows: rows.slice(0, ROWS_SHOWN),
  rowCount,
});

async function read(bytes: Uint8Array, options: ReadOptions): Promise<ImportRow[] | UploadRefusal> {
  try {
    const { rows } = await readInWorker(bytes, options);
    // The amounts limit, before anything is compared or saved (AC-24).
    return amountsAddUpSafely(rows) ? rows : refuse("AMOUNTS_TOO_LARGE");
  } catch (error) {
    if (error instanceof ReaderBusy) return refuse("BUSY");
    if (error instanceof ImportRejected) return refuse(error.code, error.rows, error.rowCount);
    return refuse("INTERNAL_ERROR");
  }
}

/** Screen 4. The only place ALREADY_IMPORTED can show (AC-18). */
export async function firstUpload(session: Unlocked, bytes: Uint8Array, today: string, options: ReadOptions = {}): Promise<{ ok: true; rows: number } | UploadRefusal> {
  if (firstTimeStep(session.db) !== "upload") return refuse("ALREADY_IMPORTED");
  const rows = await read(bytes, options);
  if (!Array.isArray(rows)) return rows;
  const saved = await changeFor(session, (db) => saveFirstRows(db, rows, today));
  if (saved === null) return refuse("LOCKED");
  return saved.ok ? saved : refuse(saved.code);
}

/**
 * Screen 8, stage 1. Nothing is saved: the parsed rows wait in the session for
 * the owner's yes. The same file again leaves nothing waiting.
 */
export async function updateUpload(session: Unlocked, bytes: Uint8Array, today: string, options: ReadOptions = {}): Promise<{ ok: true; same: boolean } | UploadRefusal> {
  if (firstTimeStep(session.db) !== "shell") return refuse("WRONG_STEP");
  // A new upload throws away the one before it.
  session.pending = null;
  const rows = await read(bytes, options);
  if (!Array.isArray(rows)) return rows;
  try {
    const pending = await changeFor(session, (db) => buildPending(db, rows, today));
    if (pending === null || sessionStore().unlocked !== session) return refuse("LOCKED");
    session.pending = pending.review.same ? null : pending;
    return { ok: true, same: pending.review.same };
  } catch {
    return refuse("INTERNAL_ERROR");
  }
}

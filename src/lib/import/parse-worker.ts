/**
 * The upload reader's worker (Decision 10). It only parses: it never opens the
 * database, never sees the session, and has no environment. It lives outside
 * app/ and public/, so it can't be called as a route.
 */
import { parentPort, workerData } from "node:worker_threads";
import { ImportRejected } from "./errors.ts";
import { parseExport } from "./parse-export.ts";
import type { Limits } from "./xlsx-reader.ts";

const { bytes, limits } = workerData as { bytes: Uint8Array; limits?: Limits };

try {
  const parsed = await parseExport(bytes, limits);
  parentPort?.postMessage({ ok: true, rows: parsed.rows, roundedAmounts: parsed.roundedAmounts });
} catch (error) {
  // Only a fixed code and row numbers leave the worker, never error text.
  const rejected = error instanceof ImportRejected ? error : new ImportRejected("INTERNAL_ERROR");
  parentPort?.postMessage({ ok: false, code: rejected.code, rows: [...rejected.rows], rowCount: rejected.rowCount });
}

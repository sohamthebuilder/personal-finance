/**
 * Reads an uploaded export in a worker with memory and time limits
 * (Decision 10, condition 54). The bytes are handed over, not copied, so the
 * main thread holds no copy afterwards, and nothing is written to disk.
 */
import { join } from "node:path";
import { Worker, type ResourceLimits } from "node:worker_threads";
import { ImportRejected, REJECTION_MESSAGES, type RejectionCode } from "./errors.ts";
import type { ImportRow, ParsedExport } from "./parse-export.ts";
import { LIMITS, type Limits } from "./xlsx-reader.ts";

export const WORKER_LIMITS: ResourceLimits = {
  maxOldGenerationSizeMb: 768,
  maxYoungGenerationSizeMb: 64,
  stackSizeMb: 4,
};
export const WORKER_TIMEOUT_MS = 60_000;

/** Thrown when a second upload arrives while one is still being read. */
export class ReaderBusy extends Error {
  constructor() {
    super("A file is already being read.");
    this.name = "ReaderBusy";
  }
}

export interface ReadOptions {
  timeoutMs?: number;
  resourceLimits?: ResourceLimits;
  limits?: Limits;
}

/** One flag for the whole process, on globalThis because Next.js bundles its own copy of this file into each route. */
const KEY = Symbol.for("personal-finance.reader");
function reader(): { busy: boolean } {
  const holder = globalThis as unknown as Record<symbol, { busy: boolean } | undefined>;
  holder[KEY] ??= { busy: false };
  return holder[KEY];
}

export function isReading(): boolean {
  return reader().busy;
}

/** Built at run time, so the bundler never pulls the worker into a route. The app always runs from the project folder. */
function workerFile(): string {
  return join(process.cwd(), "src", "lib", "import", "parse-worker.ts");
}

type WorkerAnswer =
  | { ok: true; rows: ImportRow[]; roundedAmounts: number }
  | { ok: false; code: RejectionCode; rows: number[]; rowCount: number };

function isAnswer(value: unknown): value is WorkerAnswer {
  if (typeof value !== "object" || value === null) return false;
  const answer = value as { ok?: unknown; rows?: unknown; code?: unknown };
  if (!Array.isArray(answer.rows)) return false;
  return answer.ok === true || (answer.ok === false && typeof answer.code === "string" && Object.hasOwn(REJECTION_MESSAGES, answer.code));
}

/**
 * Parses the file in a worker. Throws ImportRejected with a fixed code, and
 * ReaderBusy if a read is already running. Running out of memory, taking too
 * long or crashing all become INTERNAL_ERROR.
 */
export async function readInWorker(bytes: Uint8Array, options: ReadOptions = {}): Promise<ParsedExport> {
  const state = reader();
  if (state.busy) throw new ReaderBusy();
  const limits = options.limits ?? LIMITS;
  // The same first checks the reader makes, before a worker is started.
  if (bytes.byteLength === 0) throw new ImportRejected("EMPTY_FILE");
  if (bytes.byteLength > limits.maxFileBytes) throw new ImportRejected("FILE_TOO_LARGE");

  state.busy = true;
  let worker: Worker | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    // A view on a shared pool can't be handed over, so it's copied once and the copy is handed over.
    const whole = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength && bytes.buffer instanceof ArrayBuffer;
    const own = whole ? bytes : new Uint8Array(bytes);
    const answer = await new Promise<WorkerAnswer>((resolve, reject) => {
      const failed = () => reject(new ImportRejected("INTERNAL_ERROR"));
      worker = new Worker(workerFile(), {
        workerData: { bytes: own, limits: options.limits },
        transferList: [own.buffer as ArrayBuffer],
        resourceLimits: options.resourceLimits ?? WORKER_LIMITS,
        env: {},
        argv: [],
        stdin: false,
        stdout: true,
        stderr: true,
      });
      timer = setTimeout(failed, options.timeoutMs ?? WORKER_TIMEOUT_MS);
      worker.once("message", (message: unknown) => (isAnswer(message) ? resolve(message) : failed()));
      // The error itself is dropped: it can quote the file.
      worker.once("error", failed);
      worker.once("exit", failed);
    });
    if (!answer.ok) throw new ImportRejected(answer.code, answer.rows, answer.rowCount);
    return { rows: answer.rows, roundedAmounts: answer.roundedAmounts };
  } finally {
    if (timer !== null) clearTimeout(timer);
    try {
      await (worker as Worker | null)?.terminate();
    } catch {
      // The worker has gone either way.
    }
    state.busy = false;
  }
}

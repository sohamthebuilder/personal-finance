/**
 * What the password routes do, kept apart from Next.js so tests can run them.
 * Every result is a fixed code. No password, token or caught error is ever
 * logged or put in a result (condition 53).
 */
import { createEncryptedDb, openEncryptedDb, WrongPasswordError } from "../db/encrypted-db.ts";
import { type DataFiles, prepareDataFolder } from "../data-files.ts";
import { type DeleteResult, deleteEverything } from "./delete-data.ts";
import { checkNewPassword, type PasswordProblem } from "./password-rules.ts";
import {
  beginExclusive,
  beginPasswordCheck,
  DELETE_TRIES_BEFORE_LOCK,
  lock,
  type ReturnScreen,
  sessionStore,
  startSession,
  waitSeconds,
} from "./session.ts";
import { startScreen } from "./start-screen.ts";

export type CreateError = PasswordProblem | "NO_MATCH" | "NOT_TICKED" | "SAVE_FAILED" | "WRONG_STEP";
export type CreateResult = { ok: true; token: string } | { ok: false; error: CreateError };

export async function createPassword(
  input: { password: string; repeat: string; confirmed: boolean },
  files: DataFiles,
): Promise<CreateResult> {
  // Only when there's no database, no salt and no marker (screen 1).
  if (startScreen(null, files).screen !== "create") return { ok: false, error: "WRONG_STEP" };
  const problem = checkNewPassword(input.password);
  if (problem !== null) return { ok: false, error: problem };
  if (input.password !== input.repeat) return { ok: false, error: "NO_MATCH" };
  if (!input.confirmed) return { ok: false, error: "NOT_TICKED" };

  const release = beginExclusive();
  if (release === null) return { ok: false, error: "SAVE_FAILED" };
  try {
    prepareDataFolder(files.folder);
    const db = await createEncryptedDb(files.database, input.password);
    const token = await startSession(db);
    const store = sessionStore();
    store.justDeleted = false;
    store.returnTo = "/";
    return { ok: true, token };
  } catch {
    return { ok: false, error: "SAVE_FAILED" };
  } finally {
    release();
  }
}

export type CheckError = { error: "WRONG" } | { error: "WAIT"; seconds: number } | { error: "CANT_OPEN" } | { error: "WRONG_STEP" };

/** A wrong try that has started a wait shows the wait, not "wrong". */
function wrongOrWait(): CheckError {
  const seconds = waitSeconds();
  return seconds > 0 ? { error: "WAIT", seconds } : { error: "WRONG" };
}

/** Opens a handle with this password, counted by the one slow-down (Decision 6). */
async function checkedOpen(password: string, files: DataFiles): Promise<{ ok: true; db: Awaited<ReturnType<typeof openEncryptedDb>> } | ({ ok: false } & CheckError)> {
  const started = beginPasswordCheck();
  if (!started.ok) return { ok: false, error: "WAIT", seconds: started.waitSeconds };
  try {
    const db = await openEncryptedDb(files.database, password);
    started.finish(true);
    return { ok: true, db };
  } catch (error) {
    started.finish(false);
    if (error instanceof WrongPasswordError || (error as Error).message === "The password is too long.") {
      return { ok: false, ...wrongOrWait() };
    }
    return { ok: false, error: "CANT_OPEN" };
  }
}

export type LogInResult = { ok: true; token: string; next: ReturnScreen } | ({ ok: false } & CheckError);

export async function logIn(password: string, files: DataFiles): Promise<LogInResult> {
  const screen = startScreen(null, files).screen;
  if (screen !== "login" && screen !== "locked") return { ok: false, error: "WRONG_STEP" };
  const opened = await checkedOpen(password, files);
  if (!opened.ok) return opened;
  try {
    const token = await startSession(opened.db);
    return { ok: true, token, next: sessionStore().returnTo };
  } catch {
    opened.db.close();
    return { ok: false, error: "CANT_OPEN" };
  }
}

export type DeleteCheckResult = DeleteResult | ({ ok: false } & CheckError) | { ok: false; error: "LOCKED" };

/** Screen 14. The password is checked with a second handle, closed at once. */
export async function deleteMyData(password: string, confirmed: boolean, files: DataFiles): Promise<DeleteCheckResult> {
  if (!confirmed || password.length === 0) return { ok: false, error: "WRONG" };
  const store = sessionStore();
  const triesBefore = store.failures;
  const opened = await checkedOpen(password, files);
  if (!opened.ok) {
    // Only a real wrong try counts, not one refused during a wait.
    if (store.failures > triesBefore && opened.error !== "CANT_OPEN") {
      store.deleteFailures += 1;
      if (store.deleteFailures >= DELETE_TRIES_BEFORE_LOCK) {
        await lock(null);
        return { ok: false, error: "LOCKED" };
      }
    }
    return opened;
  }
  opened.db.close();
  store.deleteFailures = 0;
  return deleteEverything(files);
}

export async function logOut(): Promise<void> {
  await lock("logout");
}

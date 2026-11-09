/**
 * The one session store for the whole process (Decision 2).
 *
 * server.ts runs this file directly, and Next.js bundles its own copies into
 * the proxy and each route. So nothing lives in a module variable: the state
 * sits on globalThis under one symbol, and every copy of these functions works
 * on that same object. Lock and restart drop it all.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type Database from "better-sqlite3-multiple-ciphers";

export const COOKIE_NAME = "pf_session";
export const IDLE_MS = 15 * 60 * 1000;
export const SWEEP_MS = 30 * 1000;
const FREE_TRIES = 3;
const FIRST_WAIT_MS = 30 * 1000;
const LONGEST_WAIT_MS = 15 * 60 * 1000;
export const DELETE_TRIES_BEFORE_LOCK = 5;

export type LockReason = "idle" | "logout" | "restart";

/** The screens a log in can return to. A fixed list, never taken from a request. */
export const RETURN_SCREENS = ["/", "/settings", "/settings/delete", "/upload"] as const;
export type ReturnScreen = (typeof RETURN_SCREENS)[number];

export type Period =
  | { kind: "this-month" | "last-12" | "financial-year" | "all" }
  | { kind: "custom"; from: string; to: string };

export interface Unlocked {
  db: Database.Database;
  tokenHash: Buffer;
  lastUse: number;
  period: Period;
}

export interface SessionStore {
  unlocked: Unlocked | null;
  /** Why the last lock happened, for screen 3. Null after a log in or a restart. */
  lastLock: LockReason | null;
  failures: number;
  deleteFailures: number;
  waitUntil: number;
  checking: boolean;
  /** The one-change-at-a-time chain. Lock waits for it before closing the database. */
  changes: Promise<unknown>;
  /** Set when a delete finishes, so screen 1 can say so. */
  justDeleted: boolean;
  /** The last screen the owner was on, from the fixed list, for after log in. */
  returnTo: ReturnScreen;
  sweeper: ReturnType<typeof setInterval> | null;
  now: () => number;
}

const KEY = Symbol.for("personal-finance.session");

function freshStore(): SessionStore {
  return {
    unlocked: null,
    lastLock: null,
    failures: 0,
    deleteFailures: 0,
    waitUntil: 0,
    checking: false,
    changes: Promise.resolve(),
    justDeleted: false,
    returnTo: "/",
    sweeper: null,
    // The wall clock, so time asleep counts as idle (S4-4).
    now: () => Date.now(),
  };
}

export function sessionStore(): SessionStore {
  const holder = globalThis as unknown as Record<symbol, SessionStore | undefined>;
  holder[KEY] ??= freshStore();
  return holder[KEY];
}

/** For tests only: closes anything open and starts again. */
export function resetSessionStore(): SessionStore {
  const current = sessionStore();
  if (current.sweeper) clearInterval(current.sweeper);
  current.unlocked?.db.close();
  const holder = globalThis as unknown as Record<symbol, SessionStore | undefined>;
  holder[KEY] = freshStore();
  return holder[KEY];
}

function hashToken(token: string): Buffer {
  return createHash("sha256").update(token, "utf8").digest();
}

/** Starts a new session for an open database. Any old session is locked first. Returns the new token. */
export async function startSession(db: Database.Database): Promise<string> {
  const store = sessionStore();
  if (store.unlocked) await lock(null);
  const token = randomBytes(32).toString("base64url");
  store.unlocked = {
    db,
    tokenHash: hashToken(token),
    lastUse: store.now(),
    period: { kind: "this-month" },
  };
  store.lastLock = null;
  store.failures = 0;
  store.deleteFailures = 0;
  store.waitUntil = 0;
  return token;
}

/** Ends the session. The handle is closed only once any change in progress has finished. */
export async function lock(reason: LockReason | null): Promise<void> {
  const store = sessionStore();
  const unlocked = store.unlocked;
  store.unlocked = null;
  if (reason !== null) store.lastLock = reason;
  if (!unlocked) return;
  try {
    await store.changes;
  } catch {
    // A failed change has already rolled back.
  }
  try {
    unlocked.db.close();
  } catch {
    // Nothing more can be done, and the handle is gone from the store.
  }
}

function isIdle(store: SessionStore, unlocked: Unlocked): boolean {
  const now = store.now();
  // A clock that has gone backwards can't be trusted, so it locks too.
  return now - unlocked.lastUse >= IDLE_MS || unlocked.lastUse > now;
}

/**
 * The live session for a cookie token, or null. Checks idle first. `touch`
 * counts the request as use: only actions the owner started do that, never
 * the status check.
 */
export function sessionFor(token: string | null, options: { touch: boolean }): Unlocked | null {
  const store = sessionStore();
  const unlocked = store.unlocked;
  if (!unlocked) return null;
  if (isIdle(store, unlocked)) {
    void lock("idle");
    return null;
  }
  if (token === null || token.length === 0 || token.length > 128) return null;
  if (!timingSafeEqual(hashToken(token), unlocked.tokenHash)) return null;
  if (options.touch) unlocked.lastUse = store.now();
  return unlocked;
}

/** Locks an idle session with no request arriving. Called by the timer. */
export function sweep(): void {
  const store = sessionStore();
  if (store.unlocked && isIdle(store, store.unlocked)) void lock("idle");
}

export function startSweeper(): void {
  const store = sessionStore();
  if (store.sweeper) return;
  store.sweeper = setInterval(sweep, SWEEP_MS);
  store.sweeper.unref();
}

/** Runs changes one at a time. Lock waits for the one running. */
export function runChange<T>(change: () => T | Promise<T>): Promise<T> {
  const store = sessionStore();
  const result = store.changes.then(change, change);
  store.changes = result.catch(() => undefined);
  return result;
}

function waitFor(failures: number): number {
  if (failures <= FREE_TRIES) return 0;
  return Math.min(FIRST_WAIT_MS * 2 ** (failures - FREE_TRIES - 1), LONGEST_WAIT_MS);
}

export type CheckStart =
  | { ok: true; finish: (success: boolean) => void }
  | { ok: false; waitSeconds: number };

function secondsLeft(store: SessionStore): number {
  return Math.max(1, Math.ceil((store.waitUntil - store.now()) / 1000));
}

/**
 * Starts a password check (Decision 6). Refused at once, with no hashing,
 * during a wait or while another check runs. The count goes up before the
 * hashing starts, so a crash halfway still counts. Only success resets it.
 */
export function beginPasswordCheck(): CheckStart {
  const store = sessionStore();
  if (store.checking) return { ok: false, waitSeconds: store.waitUntil > store.now() ? secondsLeft(store) : 2 };
  if (store.waitUntil > store.now()) return { ok: false, waitSeconds: secondsLeft(store) };
  store.checking = true;
  store.failures += 1;
  const wait = waitFor(store.failures);
  store.waitUntil = wait === 0 ? 0 : store.now() + wait;
  let finished = false;
  return {
    ok: true,
    finish(success: boolean) {
      if (finished) return;
      finished = true;
      store.checking = false;
      if (success) {
        store.failures = 0;
        store.waitUntil = 0;
      }
    },
  };
}

/** Seconds left to wait, or 0. */
export function waitSeconds(): number {
  const store = sessionStore();
  return store.waitUntil > store.now() ? secondsLeft(store) : 0;
}

/** One password job at a time for create password, which isn't counted as a try. */
export function beginExclusive(): (() => void) | null {
  const store = sessionStore();
  if (store.checking) return null;
  store.checking = true;
  return () => {
    store.checking = false;
  };
}

/** The Set-Cookie value for a new session (Decision 2). No Domain, no expiry, no Secure on plain 127.0.0.1. */
export function sessionCookie(token: string): string {
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Strict`;
}

export function expiredCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

/** Reads our cookie from a Cookie header. A repeated cookie is treated as none. */
export function tokenFromCookieHeader(header: string | null | undefined): string | null {
  if (!header) return null;
  const found: string[] = [];
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    if (part.slice(0, index).trim() === COOKIE_NAME) found.push(part.slice(index + 1).trim());
  }
  return found.length === 1 ? (found[0] ?? null) : null;
}

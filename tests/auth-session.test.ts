/**
 * Session store, cookie, auto-lock and slow-down (conditions 41, 42, 45).
 * Uses a made-up database in a temporary HOME and a fake clock.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, it } from "node:test";
import { createPassword, deleteMyData, logIn, logOut } from "../src/lib/auth/actions.ts";
import {
  beginPasswordCheck,
  COOKIE_NAME,
  expiredCookie,
  IDLE_MS,
  resetSessionStore,
  sessionCookie,
  sessionFor,
  sessionStore,
  sweep,
  tokenFromCookieHeader,
  waitSeconds,
} from "../src/lib/auth/session.ts";
import { MADE_UP_PASSWORD, makeDatabase, type TempHome, tempHome } from "./support/app-helpers.ts";

let home: TempHome;
let clock = 1_000_000;

beforeEach(() => {
  home = tempHome();
  resetSessionStore().now = () => clock;
});

afterEach(() => {
  resetSessionStore();
  home.cleanup();
});

async function loggedIn(): Promise<string> {
  await makeDatabase(home.files, "shell");
  const result = await logIn(MADE_UP_PASSWORD, home.files);
  assert.ok(result.ok);
  return result.token;
}

describe("one session store (Decision 2)", () => {
  it("lives on globalThis under the shared symbol, so every bundled copy sees it", () => {
    const store = sessionStore();
    assert.equal((globalThis as unknown as Record<symbol, unknown>)[Symbol.for("personal-finance.session")], store);
  });
});

describe("session cookie (condition 41)", () => {
  it("has exactly HttpOnly, SameSite=Strict and Path=/, with no Domain, expiry or Secure", () => {
    assert.equal(sessionCookie("abc"), `${COOKIE_NAME}=abc; Path=/; HttpOnly; SameSite=Strict`);
  });

  it("is sent back expired on log out", () => {
    assert.match(expiredCookie(), /^pf_session=; Path=\/; HttpOnly; SameSite=Strict; Expires=Thu, 01 Jan 1970/);
  });

  it("gets a new 32-byte token at every log in, and the old one stops working", async () => {
    const first = await loggedIn();
    const second = await logIn(MADE_UP_PASSWORD, home.files);
    assert.ok(second.ok);
    assert.notEqual(first, second.token);
    assert.equal(Buffer.from(second.token, "base64url").length, 32);
    assert.equal(sessionFor(first, { touch: false }), null);
    assert.notEqual(sessionFor(second.token, { touch: false }), null);
  });

  it("refuses a planted token the server never issued", async () => {
    await loggedIn();
    assert.equal(sessionFor("planted-by-another-app", { touch: false }), null);
    assert.equal(sessionFor(null, { touch: false }), null);
  });

  it("treats a repeated cookie as none", () => {
    assert.equal(tokenFromCookieHeader("pf_session=a; pf_session=b"), null);
    assert.equal(tokenFromCookieHeader("other=1; pf_session=a"), "a");
  });

  it("creates a session at create password, and log out ends it", async () => {
    const created = await createPassword({ password: MADE_UP_PASSWORD, repeat: MADE_UP_PASSWORD, confirmed: true }, home.files);
    assert.ok(created.ok);
    assert.notEqual(sessionFor(created.token, { touch: false }), null);
    await logOut();
    assert.equal(sessionFor(created.token, { touch: false }), null);
    assert.equal(sessionStore().lastLock, "logout");
  });
});

describe("auto-lock (condition 42)", () => {
  it("locks after 15 minutes idle with no request arriving", async () => {
    const token = await loggedIn();
    const db = sessionStore().unlocked?.db;
    clock += IDLE_MS;
    sweep();
    assert.equal(sessionStore().unlocked, null);
    assert.equal(sessionStore().lastLock, "idle");
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(db?.open, false, "the database handle is closed");
    assert.equal(sessionFor(token, { touch: false }), null);
  });

  it("doesn't count a status check as use", async () => {
    const token = await loggedIn();
    clock += IDLE_MS - 1000;
    assert.notEqual(sessionFor(token, { touch: false }), null);
    clock += 1000;
    assert.equal(sessionFor(token, { touch: false }), null);
  });

  it("counts an action the owner started as use", async () => {
    const token = await loggedIn();
    clock += IDLE_MS - 1000;
    assert.notEqual(sessionFor(token, { touch: true }), null);
    clock += IDLE_MS - 1000;
    assert.notEqual(sessionFor(token, { touch: false }), null);
  });

  it("locks when the clock goes backwards", async () => {
    const token = await loggedIn();
    clock -= 60_000;
    assert.equal(sessionFor(token, { touch: false }), null);
    assert.equal(sessionStore().unlocked, null);
  });
});

describe("slow-down (condition 45)", () => {
  it("gives three free tries, then 30 seconds doubling to 15 minutes", async () => {
    await makeDatabase(home.files, "shell");
    for (let i = 0; i < 3; i += 1) assert.deepEqual(await logIn("wrong made-up phrase", home.files), { ok: false, error: "WRONG" });
    assert.deepEqual(await logIn("wrong made-up phrase", home.files), { ok: false, error: "WAIT", seconds: 30 });
    clock += 30_000;
    assert.deepEqual(await logIn("wrong made-up phrase", home.files), { ok: false, error: "WAIT", seconds: 60 });
    const store = sessionStore();
    store.failures = 20;
    clock += 60_000;
    assert.deepEqual(await logIn("wrong made-up phrase", home.files), { ok: false, error: "WAIT", seconds: 900 });
  });

  it("refuses a correct password during a wait, with no hashing started", async () => {
    await makeDatabase(home.files, "shell");
    for (let i = 0; i < 4; i += 1) await logIn("wrong made-up phrase", home.files);
    const failures = sessionStore().failures;
    const started = performance.now();
    const result = await logIn(MADE_UP_PASSWORD, home.files);
    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.error, "WAIT");
    assert.ok(performance.now() - started < 30, "no Argon2 work was done");
    assert.equal(sessionStore().failures, failures, "a refused try isn't counted");
    clock += 30_000;
    assert.ok((await logIn(MADE_UP_PASSWORD, home.files)).ok);
    assert.equal(sessionStore().failures, 0);
  });

  it("refuses a second check while one runs", async () => {
    await makeDatabase(home.files, "shell");
    const running = logIn(MADE_UP_PASSWORD, home.files);
    const second = await logIn(MADE_UP_PASSWORD, home.files);
    assert.equal(second.ok, false);
    assert.equal(!second.ok && second.error, "WAIT");
    assert.ok((await running).ok);
  });

  it("counts before hashing, so a crash halfway still counts", () => {
    const started = beginPasswordCheck();
    assert.ok(started.ok);
    assert.equal(sessionStore().failures, 1);
  });

  it("gives a correct log in after a wait no second wait, even while it's being checked (S4-14)", async () => {
    await makeDatabase(home.files, "shell");
    for (let i = 0; i < 4; i += 1) await logIn("wrong made-up phrase", home.files);
    clock += 30_000;
    const running = logIn(MADE_UP_PASSWORD, home.files);
    // What a page load or a second request sees while the correct try is hashing.
    assert.equal(waitSeconds(), 0, "no wait shows during the check");
    assert.deepEqual(beginPasswordCheck(), { ok: false, waitSeconds: 2 }, "a second try gets the short fixed wait, not the next wait");
    assert.ok((await running).ok);
    assert.equal(waitSeconds(), 0);
    assert.equal(sessionStore().failures, 0);
  });

  it("still starts the wait when the try turns out wrong (S4-14)", async () => {
    await makeDatabase(home.files, "shell");
    for (let i = 0; i < 3; i += 1) await logIn("wrong made-up phrase", home.files);
    const started = beginPasswordCheck();
    assert.ok(started.ok);
    assert.equal(sessionStore().failures, 4, "counted before hashing");
    assert.equal(waitSeconds(), 0);
    started.finish(false);
    assert.equal(waitSeconds(), 30);
  });

  it("guards the log in form with a ref, so a second Return can't send a second request (S4-14)", () => {
    const page = readFileSync("src/app/ui/log-in.tsx", "utf8");
    assert.match(page, /const sending = useRef\(false\)/);
    assert.match(page, /if \(sending\.current \|\| busy \|\| wait > 0\) return;\n\s+sending\.current = true;/);
  });

  it("shares one count across log in, Locked and Delete my data", async () => {
    const token = await loggedIn();
    assert.ok(sessionFor(token, { touch: false }));
    await deleteMyData("wrong made-up phrase", true, home.files);
    await deleteMyData("wrong made-up phrase", true, home.files);
    await logOut();
    await logIn("wrong made-up phrase", home.files);
    assert.deepEqual(await logIn("wrong made-up phrase", home.files), { ok: false, error: "WAIT", seconds: 30 });
  });

  it("locks the app after 5 wrong tries on Delete my data, and deletes nothing", async () => {
    await loggedIn();
    const results = [];
    for (let i = 0; i < 5; i += 1) {
      clock += 15 * 60_000 - 1000;
      sessionStore().unlocked!.lastUse = clock;
      results.push(await deleteMyData("wrong made-up phrase", true, home.files));
    }
    assert.deepEqual(results.at(-1), { ok: false, error: "LOCKED" });
    assert.equal(sessionStore().unlocked, null);
    assert.equal((await import("node:fs")).existsSync(home.files.database), true);
  });
});

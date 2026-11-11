/**
 * The server-chosen start screen (condition 46, ruling 3, S3-13). Every row of
 * the start-up table, and every first-time step, from made-up files.
 */
import assert from "node:assert/strict";
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { createPassword, logIn } from "../src/lib/auth/actions.ts";
import { lock, resetSessionStore } from "../src/lib/auth/session.ts";
import { startScreen } from "../src/lib/auth/start-screen.ts";
import { prepareDataFolder, UnsafeFolderError } from "../src/lib/data-files.ts";
import { MADE_UP_PASSWORD, makeDatabase, type TempHome, tempHome } from "./support/app-helpers.ts";

let home: TempHome;
beforeEach(() => {
  home = tempHome();
  resetSessionStore();
});
afterEach(() => {
  resetSessionStore();
  home.cleanup();
});

describe("what opens when the app starts", () => {
  it("no database, no salt, no marker: Create password", () => {
    assert.deepEqual(startScreen(null, home.files), { screen: "create", deleted: false });
  });

  it("database and salt, no marker: Log in", async () => {
    await makeDatabase(home.files, "shell");
    assert.deepEqual(startScreen(null, home.files), { screen: "login" });
  });

  it("marker: finish the delete", async () => {
    await makeDatabase(home.files, "shell");
    writeFileSync(home.files.marker, "");
    assert.deepEqual(startScreen(null, home.files), { screen: "finish-delete" });
  });

  it("only one of database and salt: files incomplete, and nothing is deleted", async () => {
    await makeDatabase(home.files, "shell");
    rmSync(home.files.salt);
    assert.deepEqual(startScreen(null, home.files), { screen: "files-incomplete" });
    assert.ok(statSync(home.files.database).isFile());
  });

  it("only the salt: files incomplete", async () => {
    await makeDatabase(home.files, "shell");
    rmSync(home.files.database);
    assert.deepEqual(startScreen(null, home.files), { screen: "files-incomplete" });
  });

  it("a cookie this process never issued: Locked, because the app restarted", async () => {
    await makeDatabase(home.files, "shell");
    assert.deepEqual(startScreen("from-before-the-restart", home.files), { screen: "locked", reason: "restart" });
  });

  it("after an idle lock or log out: Locked with that reason", async () => {
    await makeDatabase(home.files, "shell");
    await logIn(MADE_UP_PASSWORD, home.files);
    await lock("idle");
    assert.deepEqual(startScreen(null, home.files), { screen: "locked", reason: "idle" });
    await logIn(MADE_UP_PASSWORD, home.files);
    await lock("logout");
    assert.deepEqual(startScreen("old", home.files), { screen: "locked", reason: "logout" });
  });

  it("a data folder that's a link: can't open", async () => {
    const elsewhere = join(home.home, "elsewhere");
    mkdirSync(elsewhere);
    mkdirSync(join(home.files.folder, ".."), { recursive: true });
    symlinkSync(elsewhere, home.files.folder);
    assert.deepEqual(startScreen(null, home.files), { screen: "cant-open" });
    assert.throws(() => prepareDataFolder(home.files.folder), UnsafeFolderError);
  });
});

describe("first-time steps come from what's saved", () => {
  for (const step of ["upload", "setup", "summary", "shell"] as const) {
    it(`${step}`, async () => {
      await makeDatabase(home.files, step);
      const result = await logIn(MADE_UP_PASSWORD, home.files);
      assert.ok(result.ok);
      assert.deepEqual(startScreen(result.token, home.files), { screen: step });
    });
  }

  it("create password leads to the upload step, never further", async () => {
    const created = await createPassword({ password: MADE_UP_PASSWORD, repeat: MADE_UP_PASSWORD, confirmed: true }, home.files);
    assert.ok(created.ok);
    assert.deepEqual(startScreen(created.token, home.files), { screen: "upload" });
  });

  it("create password is refused once a database exists, so it can't overwrite one", async () => {
    await makeDatabase(home.files, "shell");
    const again = await createPassword({ password: MADE_UP_PASSWORD, repeat: MADE_UP_PASSWORD, confirmed: true }, home.files);
    assert.deepEqual(again, { ok: false, error: "WRONG_STEP" });
  });

  it("makes the data folder owner-only (0700)", async () => {
    await createPassword({ password: MADE_UP_PASSWORD, repeat: MADE_UP_PASSWORD, confirmed: true }, home.files);
    assert.equal(statSync(home.files.folder).mode & 0o777, 0o700);
    for (const name of readdirSync(home.files.folder)) assert.equal(statSync(join(home.files.folder, name)).mode & 0o077, 0);
  });
});

describe("no shortcut in 4A (condition 52)", () => {
  it("has no route, flag or setting that seeds data or skips a step", () => {
    const routes = readdirSync("src/app/api", { recursive: true }).map(String).filter((name) => name.endsWith("route.ts"));
    assert.deepEqual(routes.sort(), [
      "delete/finish/route.ts",
      "delete/route.ts",
      "login/route.ts",
      "logout/route.ts",
      "note/dismiss/route.ts",
      "password/create/route.ts",
      "period/route.ts",
      "setup/route.ts",
      "start-over/route.ts",
      "status/route.ts",
      "summary/confirm/route.ts",
      "undo/route.ts",
      "update/cancel/route.ts",
      "update/confirm/route.ts",
      "update/rows/route.ts",
      "update/upload/route.ts",
      "upload/route.ts",
    ]);
    for (const file of readdirSync("src", { recursive: true }).map(String)) {
      if (!/\.(ts|tsx)$/.test(file)) continue;
      const text = readFileSync(join("src", file), "utf8");
      assert.doesNotMatch(text, /process\.env\.(?!HOME\b|APP_PORT\b|NODE_ENV\b)/, `${file} reads an unexpected setting`);
      assert.doesNotMatch(text, /searchParams|useSearchParams/, `${file} reads the web address`);
      if (!file.startsWith("lib/setup/progress.ts") && file !== "lib/data/update.ts") assert.doesNotMatch(text, /confirmSummary/, `${file} confirms the summary`);
    }
  });
});


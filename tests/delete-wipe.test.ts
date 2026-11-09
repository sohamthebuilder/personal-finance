/**
 * Delete my data and the forgotten-password wipe (conditions 28, 29, 47).
 *
 * Safety: every folder here is a made-up HOME inside the system temp folder.
 * process.env.HOME is pointed there too for the whole file, and each wipe
 * checks its home is under the temp folder before it runs, so nothing here
 * can reach the real data folder.
 */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import { deleteMyData, logIn } from "../src/lib/auth/actions.ts";
import { finishDelete } from "../src/lib/auth/delete-data.ts";
import { resetSessionStore, sessionStore } from "../src/lib/auth/session.ts";
import { startScreen } from "../src/lib/auth/start-screen.ts";
import { dataFolder } from "../src/lib/data-files.ts";
import { WIPE_COMMAND } from "../src/lib/wipe-command.ts";
import { createInterface } from "node:readline";
import { PassThrough } from "node:stream";
import { askLine, runWipe, type WipeOptions } from "../scripts/wipe-data.ts";
import { MADE_UP_PASSWORD, makeDatabase, type TempHome, tempHome } from "./support/app-helpers.ts";

const realHome = process.env.HOME;
const TEMP = realpathSync(tmpdir());
let home: TempHome;

before(() => {
  // A fallback to HOME, if one ever crept back in, lands in the temp folder.
  process.env.HOME = join(TEMP, "pf-no-such-home");
});
after(() => {
  process.env.HOME = realHome;
});
beforeEach(() => {
  home = tempHome();
  resetSessionStore();
});
afterEach(() => {
  resetSessionStore();
  home.cleanup();
});

function sideFiles(): void {
  for (const path of [home.files.journal, home.files.wal, home.files.shm]) writeFileSync(path, "made-up");
}

describe("the data folder has no hidden default", () => {
  it("gives no folder for a missing HOME, rather than falling back to the real one", () => {
    assert.equal(dataFolder(undefined), null);
    assert.equal(dataFolder(""), null);
    assert.equal(dataFolder("relative/home"), null);
  });
});

describe("Delete my data (screen 14)", () => {
  it("removes the database, side files, salt and marker, keeps siblings, and ends on Create password", async () => {
    await makeDatabase(home.files, "shell");
    sideFiles();
    writeFileSync(join(home.files.folder, "my-notes.txt"), "made-up");
    const login = await logIn(MADE_UP_PASSWORD, home.files);
    assert.ok(login.ok);
    assert.deepEqual(await deleteMyData(MADE_UP_PASSWORD, true, home.files), { ok: true });
    for (const path of [home.files.database, home.files.salt, home.files.marker, home.files.wal, home.files.shm, home.files.journal]) {
      assert.equal(existsSync(path), false, path);
    }
    assert.ok(existsSync(join(home.files.folder, "my-notes.txt")));
    assert.equal(sessionStore().unlocked, null);
    assert.deepEqual(startScreen(login.token, home.files), { screen: "create", deleted: true });
  });

  it("needs the tick box and the right password, and deletes nothing otherwise", async () => {
    await makeDatabase(home.files, "shell");
    await logIn(MADE_UP_PASSWORD, home.files);
    assert.deepEqual(await deleteMyData(MADE_UP_PASSWORD, false, home.files), { ok: false, error: "WRONG" });
    assert.deepEqual(await deleteMyData("a wrong made-up phrase", true, home.files), { ok: false, error: "WRONG" });
    assert.ok(existsSync(home.files.database));
    assert.notEqual(sessionStore().unlocked, null);
  });

  it("finishes a half-done delete without the password", async () => {
    await makeDatabase(home.files, "shell");
    writeFileSync(home.files.marker, "");
    rmSync(home.files.database);
    assert.deepEqual(startScreen(null, home.files), { screen: "finish-delete" });
    assert.equal(finishDelete(home.files), true);
    assert.equal(existsSync(home.files.salt), false);
    assert.deepEqual(startScreen(null, home.files), { screen: "create", deleted: true });
    assert.equal(finishDelete(home.files), true, "safe to run twice");
  });

  it("does nothing, and says nothing was deleted, when there's no marker", async () => {
    await makeDatabase(home.files, "shell");
    assert.equal(finishDelete(home.files), true);
    assert.ok(existsSync(home.files.database));
    assert.equal(sessionStore().justDeleted, false);
  });

  it("stops, touching nothing, if one of its files is a link", async () => {
    await makeDatabase(home.files, "shell");
    const target = join(home.home, "precious.txt");
    writeFileSync(target, "made-up");
    symlinkSync(target, home.files.wal);
    writeFileSync(home.files.marker, "");
    assert.equal(finishDelete(home.files), false);
    assert.ok(existsSync(target));
    assert.ok(existsSync(home.files.database));
  });
});

function wipeWith(overrides: Partial<WipeOptions> = {}): { run: () => Promise<number>; lines: string[] } {
  const lines: string[] = [];
  const options: WipeOptions = {
    home: home.home,
    isTerminal: true,
    ask: async () => "DELETE",
    print: (line) => lines.push(line),
    isAppRunning: async () => false,
    ...overrides,
  };
  return {
    lines,
    run: () => {
      // Only a made-up home in the temp folder, or one the script must refuse.
      if (typeof options.home === "string" && options.home.startsWith("/")) {
        assert.ok(realpathSync(options.home).startsWith(TEMP), "wipe tests only run on a temp HOME");
      }
      return runWipe(options);
    },
  };
}

describe("forgotten-password wipe (condition 29)", () => {
  it("deletes only the named files, leaves siblings, and removes the folder only if empty", async () => {
    await makeDatabase(home.files, "shell");
    sideFiles();
    writeFileSync(home.files.marker, "");
    writeFileSync(join(home.files.folder, "keep-me.txt"), "made-up");
    const wipe = wipeWith();
    assert.equal(await wipe.run(), 0);
    for (const path of [home.files.database, home.files.salt, home.files.marker, home.files.wal]) assert.equal(existsSync(path), false);
    assert.ok(existsSync(join(home.files.folder, "keep-me.txt")));
    assert.ok(wipe.lines.includes("1 other file in the folder was left as it was."));
    assert.ok(wipe.lines.every((line) => !line.includes("keep-me")), "other files are reported by count only");
  });

  it("removes the empty folder, and is safe to run twice", async () => {
    await makeDatabase(home.files, "shell");
    assert.equal(await wipeWith().run(), 0);
    assert.equal(existsSync(home.files.folder), false);
    const again = wipeWith();
    assert.equal(await again.run(), 0);
    assert.deepEqual(again.lines, ["There's nothing to delete. The app's data folder isn't there."]);
  });

  it("finishes a half-wiped folder", async () => {
    await makeDatabase(home.files, "shell");
    rmSync(home.files.database);
    assert.equal(await wipeWith().run(), 0);
    assert.equal(existsSync(home.files.salt), false);
  });

  it("needs DELETE typed exactly, and a real terminal", async () => {
    await makeDatabase(home.files, "shell");
    assert.equal(await wipeWith({ ask: async () => "delete" }).run(), 1);
    assert.equal(await wipeWith({ ask: async () => " DELETE" }).run(), 1);
    assert.equal(await wipeWith({ isTerminal: false }).run(), 1);
    assert.ok(existsSync(home.files.database));
  });

  it("refuses while the app is running", async () => {
    await makeDatabase(home.files, "shell");
    writeFileSync(home.files.run, `${process.pid}\n3000\n`);
    const wipe = wipeWith({ isAppRunning: async () => true });
    assert.equal(await wipe.run(), 1);
    assert.ok(existsSync(home.files.database));
    assert.match(wipe.lines.join("\n"), /still running/);
  });

  it("clears a stale run file with the rest", async () => {
    await makeDatabase(home.files, "shell");
    writeFileSync(home.files.run, "999999\n3999\n");
    assert.equal(await wipeWith({ isAppRunning: undefined }).run(), 0);
    assert.equal(existsSync(home.files.run), false);
  });

  it("refuses if HOME is unset or not a full path", async () => {
    assert.equal(await wipeWith({ home: undefined }).run(), 1);
    assert.equal(await wipeWith({ home: "relative/home" }).run(), 1);
  });

  it("refuses if the data folder is a link, and the link's target survives", async () => {
    const real = join(home.home, "real-folder");
    mkdirSync(real);
    writeFileSync(join(real, "finance.db"), "made-up");
    mkdirSync(join(home.files.folder, ".."), { recursive: true });
    symlinkSync(real, home.files.folder);
    assert.equal(await wipeWith().run(), 1);
    assert.ok(existsSync(join(real, "finance.db")));
  });

  it("refuses if any target is a link, before deleting anything", async () => {
    await makeDatabase(home.files, "shell");
    const target = join(home.home, "precious.txt");
    writeFileSync(target, "made-up");
    rmSync(home.files.salt);
    symlinkSync(target, home.files.salt);
    assert.equal(await wipeWith().run(), 1);
    assert.ok(existsSync(target));
    assert.ok(existsSync(home.files.database));
  });
});

describe("the command on screen 2", () => {
  it("is one short line with nothing banned in it", () => {
    assert.equal(WIPE_COMMAND, "npm run wipe");
    assert.doesNotMatch(WIPE_COMMAND, /[\n\r]|sudo|curl|eval|base64|\||\*|rm -rf/);
  });

  it("runs the script that ships in the repo", () => {
    const scripts = JSON.parse(readFileSync("package.json", "utf8")).scripts as Record<string, string>;
    assert.equal(scripts.wipe, "node scripts/wipe-data.ts");
  });

  it("copies the same constant the screen shows", () => {
    const panel = readFileSync("src/app/ui/forgot-panel.tsx", "utf8");
    assert.match(panel, /<code>\{WIPE_COMMAND\}<\/code>/);
    assert.match(panel, /writeText\(WIPE_COMMAND\)/);
    assert.equal(panel.match(/WIPE_COMMAND/g)?.length, 3, "imported once, shown once, copied once");
  });
});

describe("wipe prompt at end of input (Q4-8)", () => {
  it("treats Control-D as not DELETE, so the script ends cleanly", async () => {
    const input = new PassThrough();
    const rl = createInterface({ input, output: new PassThrough() });
    const answer = askLine(rl, "Type DELETE: ");
    input.end();
    assert.equal(await answer, "");
  });

  it("still returns the typed line", async () => {
    const input = new PassThrough();
    const rl = createInterface({ input, output: new PassThrough() });
    const answer = askLine(rl, "Type DELETE: ");
    input.write("DELETE\n");
    assert.equal(await answer, "DELETE");
    rl.close();
  });
});

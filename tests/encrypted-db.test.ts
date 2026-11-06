import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import Database from "better-sqlite3-multiple-ciphers";
import {
  createEncryptedDb,
  deriveKey,
  KDF_SETTINGS,
  openEncryptedDb,
  saltPath,
  WrongPasswordError,
} from "../src/lib/db/encrypted-db.ts";

const PASSWORD = "made-up-password";
const MARKER = "MADE-UP-TEST-TEXT";

describe("encrypted database", () => {
  let folder: string;
  let path: string;

  before(async () => {
    folder = mkdtempSync(join(tmpdir(), "encrypted-db-test-"));
    path = join(folder, "test.db");
    const db = await createEncryptedDb(path, PASSWORD);
    db.exec("CREATE TABLE t (note TEXT)");
    db.prepare("INSERT INTO t VALUES (?)").run(MARKER);
    db.close();
  });

  after(() => rmSync(folder, { recursive: true, force: true }));

  it("reopens with the right password", async () => {
    const db = await openEncryptedDb(path, PASSWORD);
    assert.deepEqual(db.prepare("SELECT note FROM t").get(), { note: MARKER });
    db.close();
  });

  it("refuses a wrong password", async () => {
    await assert.rejects(openEncryptedDb(path, "wrong"), WrongPasswordError);
  });

  it("refuses an empty password", async () => {
    await assert.rejects(openEncryptedDb(path, ""), /password is required/);
  });

  it("can't be read with no key", () => {
    const db = new Database(path);
    assert.throws(() => db.prepare("SELECT note FROM t").get(), /file is not a database/);
    db.close();
  });

  it("looks like random bytes on disk", () => {
    const bytes = readFileSync(path);
    assert.ok(!bytes.subarray(0, 16).toString("latin1").startsWith("SQLite format 3"));
    assert.ok(!bytes.includes(MARKER));
  });

  it("stores only the salt beside the database, readable by the owner alone", () => {
    assert.equal(readFileSync(saltPath(path)).length, 16);
    assert.ok(!readFileSync(saltPath(path)).includes(PASSWORD));
    assert.equal(statSync(path).mode & 0o777, 0o600);
    assert.equal(statSync(saltPath(path)).mode & 0o777, 0o600);
  });

  it("refuses a wrong password on a new database with nothing written to it", async () => {
    const fresh = join(folder, "fresh.db");
    const db = await createEncryptedDb(fresh, PASSWORD);
    db.close();
    assert.ok(statSync(fresh).size > 0);
    await assert.rejects(openEncryptedDb(fresh, "wrong"), WrongPasswordError);
    (await openEncryptedDb(fresh, PASSWORD)).close();
  });

  it("refuses an empty file left by a crash, even with a salt", async () => {
    const crashed = join(folder, "crashed.db");
    writeFileSync(crashed, "");
    writeFileSync(saltPath(crashed), Buffer.alloc(16, 1));
    await assert.rejects(openEncryptedDb(crashed, PASSWORD), /empty or incomplete/);
  });

  it("won't create a database when opening a missing one", async () => {
    const missing = join(folder, "missing.db");
    await assert.rejects(openEncryptedDb(missing, PASSWORD), /ENOENT/);
    assert.ok(!existsSync(missing));
  });

  it("won't overwrite an existing database", async () => {
    await assert.rejects(createEncryptedDb(path, PASSWORD), /already exists/);
    assert.ok(existsSync(path));
  });
});

describe("deriveKey", () => {
  const salt = Buffer.alloc(16, 1);

  it("uses settings at or above OWASP's Argon2id minimum", () => {
    assert.ok(KDF_SETTINGS.memory >= 19456);
    assert.ok(KDF_SETTINGS.passes >= 2);
    assert.equal(KDF_SETTINGS.tagLength, 32);
  });

  it("gives the same key for the same inputs", async () => {
    assert.deepEqual(await deriveKey("a", salt), await deriveKey("a", salt));
  });

  it("gives a different key for a different password or salt", async () => {
    const key = await deriveKey("a", salt);
    assert.notDeepEqual(key, await deriveKey("b", salt));
    assert.notDeepEqual(key, await deriveKey("a", Buffer.alloc(16, 2)));
  });
});

/**
 * Shows that the database can't be read without the password.
 * Everything here is made up and lives in a temporary folder that is deleted at the end.
 * Run with: npm run prove:encryption
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3-multiple-ciphers";
import { createEncryptedDb, openEncryptedDb, WrongPasswordError } from "../src/lib/db/encrypted-db.ts";

const PASSWORD = "made-up-password-for-this-proof";
const MARKER = "MADE-UP-TEST-TEXT";

const folder = mkdtempSync(join(tmpdir(), "encryption-proof-"));
const databasePath = join(folder, "proof.db");
let failures = 0;

function report(passed: boolean, message: string): void {
  console.log(`${passed ? "PASS" : "FAIL"}  ${message}`);
  if (!passed) failures += 1;
}

async function fails(attempt: () => Promise<unknown>): Promise<boolean> {
  try {
    await attempt();
    return false;
  } catch (error) {
    return error instanceof WrongPasswordError;
  }
}

try {
  console.log(`Node ${process.version}\n`);

  const created = await createEncryptedDb(databasePath, PASSWORD);
  created.exec("CREATE TABLE proof (note TEXT)");
  created.prepare("INSERT INTO proof VALUES (?)").run(MARKER);
  created.close();

  const reopened = await openEncryptedDb(databasePath, PASSWORD);
  const row = reopened.prepare("SELECT note FROM proof").get() as { note: string };
  reopened.close();
  report(row.note === MARKER, "The right password opens the database and the data is intact");

  report(
    await fails(() => openEncryptedDb(databasePath, "not-the-password")),
    "A wrong password is refused",
  );

  let noPasswordRefused = false;
  const unkeyed = new Database(databasePath);
  try {
    unkeyed.prepare("SELECT note FROM proof").get();
  } catch (error) {
    noPasswordRefused = (error as { code?: string }).code === "SQLITE_NOTADB";
  }
  unkeyed.close();
  report(noPasswordRefused, "Opening with no password is refused");

  const cli = spawnSync("sqlite3", [databasePath, "SELECT note FROM proof"], { encoding: "utf8" });
  if (cli.error) {
    console.log("SKIP  The sqlite3 tool isn't installed here");
  } else {
    report(cli.status !== 0 && !cli.stdout.includes(MARKER), "The standard sqlite3 tool can't read the file");
  }

  const bytes = readFileSync(databasePath);
  report(!bytes.subarray(0, 16).toString("latin1").startsWith("SQLite format 3"), "The file has no SQLite header");
  report(!bytes.includes(MARKER), "The test text can't be found in the raw file");
} finally {
  rmSync(folder, { recursive: true, force: true });
}

console.log(failures === 0 ? "\nEncryption proof passed." : `\nEncryption proof FAILED: ${failures} check(s).`);
process.exit(failures === 0 ? 0 : 1);

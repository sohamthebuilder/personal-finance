import { argon2, randomBytes } from "node:crypto";
import { chmodSync, existsSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import Database from "better-sqlite3-multiple-ciphers";

type EncryptedDatabase = Database.Database;

/** Argon2id settings. They exceed OWASP's minimum. Changing them makes existing databases unreadable. */
export const KDF_SETTINGS = {
  memory: 65536, // KiB, so 64 MiB
  passes: 3,
  parallelism: 4,
  tagLength: 32,
} as const;

const SALT_BYTES = 16;

export class WrongPasswordError extends Error {
  constructor() {
    super("The database could not be opened with this password.");
    this.name = "WrongPasswordError";
  }
}

export function saltPath(databasePath: string): string {
  return `${databasePath}.salt`;
}

export function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  if (password.length === 0) {
    return Promise.reject(new Error("A password is required."));
  }
  return new Promise((resolve, reject) => {
    argon2("argon2id", { message: password, nonce: salt, ...KDF_SETTINGS }, (error, key) => {
      if (error) reject(error);
      else resolve(Buffer.from(key));
    });
  });
}

function openWithKey(databasePath: string, key: Buffer): EncryptedDatabase {
  const db = new Database(databasePath);
  try {
    db.pragma("cipher = 'sqlcipher'");
    db.pragma("legacy = 4");
    db.pragma(`key = "x'${key.toString("hex")}'"`);
    // Keep temporary tables and sorts off the disk.
    db.pragma("temp_store = MEMORY");
    // The key is only checked on first read, so read now.
    db.prepare("SELECT count(*) FROM sqlite_master").get();
    return db;
  } catch (error) {
    db.close();
    throw error;
  } finally {
    key.fill(0);
  }
}

/** Creates a new encrypted database and its salt file. Refuses to overwrite either. */
export async function createEncryptedDb(databasePath: string, password: string): Promise<EncryptedDatabase> {
  const salt = saltPath(databasePath);
  if (existsSync(databasePath) || existsSync(salt)) {
    throw new Error("A database already exists at this path.");
  }

  const saltBytes = randomBytes(SALT_BYTES);
  const key = await deriveKey(password, saltBytes);
  writeFileSync(salt, saltBytes, { mode: 0o600, flag: "wx" });

  try {
    const db = openWithKey(databasePath, key);
    // An empty file has nothing to check a key against, so write straight away.
    db.pragma("user_version = 1");
    chmodSync(databasePath, 0o600);
    return db;
  } catch (error) {
    rmSync(salt, { force: true });
    rmSync(databasePath, { force: true });
    throw error;
  }
}

export async function openEncryptedDb(databasePath: string, password: string): Promise<EncryptedDatabase> {
  // An empty file would accept any password, so it must never be opened.
  if (statSync(databasePath).size === 0) {
    throw new Error("The database is empty or incomplete.");
  }
  const key = await deriveKey(password, readFileSync(saltPath(databasePath)));
  try {
    return openWithKey(databasePath, key);
  } catch (error) {
    if ((error as { code?: string }).code === "SQLITE_NOTADB") {
      throw new WrongPasswordError();
    }
    throw error;
  }
}

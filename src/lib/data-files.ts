/**
 * Where the app keeps its data, and the exact names of every file it owns.
 * The app and the wipe script both use this list, so they can't disagree.
 * Imports only `node:` modules, so the wipe script can load it on its own.
 */
import { chmodSync, lstatSync, mkdirSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";

export const FOLDER_NAME = "personal-finance";
export const DATABASE_NAME = "finance.db";

/**
 * The data folder for a given home folder, or null if HOME isn't usable.
 * No default: every caller passes HOME itself, so a missing value can never
 * fall back to the real home folder.
 */
export function dataFolder(home: string | undefined): string | null {
  if (typeof home !== "string" || home.length === 0 || !isAbsolute(home)) return null;
  return join(home, "Library", "Application Support", FOLDER_NAME);
}

export interface DataFiles {
  folder: string;
  database: string;
  journal: string;
  wal: string;
  shm: string;
  salt: string;
  marker: string;
  run: string;
}

export function dataFiles(folder: string): DataFiles {
  const database = join(folder, DATABASE_NAME);
  return {
    folder,
    database,
    journal: `${database}-journal`,
    wal: `${database}-wal`,
    shm: `${database}-shm`,
    // Must match saltPath() in src/lib/db/encrypted-db.ts.
    salt: `${database}.salt`,
    marker: join(folder, "delete.marker"),
    run: join(folder, "app.run"),
  };
}

/**
 * The delete order: the database first, then its side files, then the marker
 * and run file, and the salt last. The in-app delete leaves out the run file,
 * because the app is still running, and handles the marker itself.
 */
export function wipeOrder(files: DataFiles): string[] {
  return [files.database, files.journal, files.wal, files.shm, files.run, files.marker, files.salt];
}

export function inAppDeleteOrder(files: DataFiles): string[] {
  return [files.database, files.journal, files.wal, files.shm, files.salt];
}

/** Every name the app owns, for telling them apart from anything else in the folder. */
export function ownedNames(files: DataFiles): Set<string> {
  return new Set(wipeOrder(files).map((path) => path.slice(files.folder.length + 1)));
}

export class UnsafeFolderError extends Error {
  constructor() {
    super("The data folder isn't a plain folder in the expected place.");
    this.name = "UnsafeFolderError";
  }
}

/** True when the path is a real folder (not a link) at exactly that place. */
export function isSafeFolder(folder: string): boolean {
  try {
    const stat = lstatSync(folder);
    if (stat.isSymbolicLink() || !stat.isDirectory()) return false;
    return realpathSync(folder) === join(realpathSync(dirname(folder)), FOLDER_NAME);
  } catch {
    return false;
  }
}

/** Makes the data folder if needed, owner-only (0700). Refuses a link or anything odd. */
export function prepareDataFolder(folder: string): void {
  let exists = true;
  try {
    lstatSync(folder);
  } catch {
    exists = false;
  }
  if (!exists) {
    mkdirSync(dirname(folder), { recursive: true, mode: 0o700 });
    mkdirSync(folder, { mode: 0o700 });
  }
  if (!isSafeFolder(folder)) throw new UnsafeFolderError();
  chmodSync(folder, 0o700);
}

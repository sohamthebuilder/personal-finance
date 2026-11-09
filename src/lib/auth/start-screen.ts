/**
 * Which screen the app shows, worked out by the server from what's saved
 * (Decision 8, design "What opens when the app starts"). Every page asks this.
 * Nothing in the web address or the body can choose it.
 */
import { existsSync } from "node:fs";
import { type DataFiles, dataFiles, dataFolder, isSafeFolder } from "../data-files.ts";
import { firstTimeStep, type FirstTimeStep } from "../setup/progress.ts";
import { type LockReason, lock, sessionFor, sessionStore } from "./session.ts";

export type StartScreen =
  | { screen: "create"; deleted: boolean }
  | { screen: "login" }
  | { screen: "locked"; reason: LockReason }
  | { screen: "files-incomplete" }
  | { screen: "cant-open" }
  | { screen: "finish-delete" }
  | { screen: FirstTimeStep };

export function appFiles(): DataFiles | null {
  const folder = dataFolder(process.env.HOME);
  return folder === null ? null : dataFiles(folder);
}

export function startScreen(token: string | null, files: DataFiles | null = appFiles()): StartScreen {
  if (files === null) return { screen: "cant-open" };
  if (existsSync(files.folder) && !isSafeFolder(files.folder)) return { screen: "cant-open" };
  if (existsSync(files.marker)) return { screen: "finish-delete" };

  const hasDatabase = existsSync(files.database);
  const hasSalt = existsSync(files.salt);
  const store = sessionStore();
  if (!hasDatabase || !hasSalt) {
    // The files went while the app was open, so nothing may stay unlocked.
    if (store.unlocked) void lock(null);
    if (!hasDatabase && !hasSalt) return { screen: "create", deleted: store.justDeleted };
    // Nothing is deleted automatically: the missing file may be in a backup.
    return { screen: "files-incomplete" };
  }

  const session = sessionFor(token, { touch: false });
  if (!session) {
    if (store.lastLock) return { screen: "locked", reason: store.lastLock };
    // A cookie this process never issued means the app restarted.
    if (token !== null) return { screen: "locked", reason: "restart" };
    return { screen: "login" };
  }
  try {
    return { screen: firstTimeStep(session.db) };
  } catch {
    return { screen: "cant-open" };
  }
}

/**
 * Delete my data (screen 14, condition 28, Decision 9). Removes whole files,
 * never clears tables. The marker goes down first, so from then on the delete
 * always finishes, and never needs the password again.
 */
import { existsSync, lstatSync, unlinkSync, writeFileSync } from "node:fs";
import { type DataFiles, inAppDeleteOrder, isSafeFolder } from "../data-files.ts";
import { lock, sessionStore } from "./session.ts";

export type DeleteResult = { ok: true } | { ok: false; stage: "before" | "after" };

function isMissing(error: unknown): boolean {
  return (error as { code?: string }).code === "ENOENT";
}

/** If the marker is there, removes the named files, then the marker. False if anything is odd or left. Safe to run twice. */
export function finishDelete(files: DataFiles): boolean {
  if (!isSafeFolder(files.folder)) return false;
  // With no marker there's no delete to finish, and nothing is touched.
  if (!existsSync(files.marker)) return true;
  const targets = inAppDeleteOrder(files);
  try {
    // Look at every target before touching any: a link or a folder stops the whole run.
    for (const path of [...targets, files.marker]) {
      try {
        if (!lstatSync(path).isFile()) return false;
      } catch (error) {
        if (!isMissing(error)) return false;
      }
    }
    for (const path of targets) {
      try {
        unlinkSync(path);
      } catch (error) {
        if (!isMissing(error)) return false;
      }
    }
    try {
      unlinkSync(files.marker);
    } catch (error) {
      if (!isMissing(error)) return false;
    }
  } catch {
    return false;
  }
  sessionStore().justDeleted = true;
  sessionStore().rolledUp = false;
  return true;
}

/** Called once the password has been checked. */
export async function deleteEverything(files: DataFiles): Promise<DeleteResult> {
  try {
    if (!isSafeFolder(files.folder)) return { ok: false, stage: "before" };
    writeFileSync(files.marker, "", { flag: "wx", mode: 0o600 });
  } catch {
    return { ok: false, stage: "before" };
  }
  // The session ends in every window, and the handle closes before the files go.
  await lock(null);
  return finishDelete(files) ? { ok: true } : { ok: false, stage: "after" };
}

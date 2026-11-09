/**
 * The rules a new password must pass (condition 33, Decisions 5 and 7).
 * The server runs every one of them. The page repeats only the length checks.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MAX_RAW_PASSWORD_UNITS } from "../db/encrypted-db.ts";

export const MIN_CHARACTERS = 15;
export const MAX_CHARACTERS = 256;

export type PasswordProblem = "TOO_SHORT" | "TOO_LONG" | "TOO_COMMON" | "NOT_TEXT";

/** Characters, not code units, after the one Unicode form. */
export function countCharacters(normalised: string): number {
  return Array.from(normalised).length;
}

const RUNS = ["abcdefghijklmnopqrstuvwxyz", "0123456789", "qwertyuiopasdfghjklzxcvbnm"];

function isSimpleRun(text: string): boolean {
  for (const run of RUNS) {
    const times = Math.ceil(text.length / run.length) + 1;
    const forward = run.repeat(times);
    const backward = [...forward].reverse().join("");
    if (forward.includes(text) || backward.includes(text)) return true;
  }
  return false;
}

/** True when the whole text is one shorter piece repeated, such as "abcabcabc" or one character. */
function isRepeatedUnit(text: string): boolean {
  const characters = Array.from(text);
  for (let size = 1; size <= characters.length / 2; size += 1) {
    if (characters.length % size !== 0) continue;
    const unit = characters.slice(0, size).join("");
    if (unit.repeat(characters.length / size) === text) return true;
  }
  return false;
}

let commonList: Set<string> | null = null;

/** The list ships in the repo and is read only on the server. It's never looked up online. */
export function commonPasswords(): Set<string> {
  if (commonList === null) {
    const path = join(process.cwd(), "src", "lib", "auth", "common-passwords.txt");
    const lines = readFileSync(path, "utf8").split("\n");
    commonList = new Set(
      lines.map((line) => line.normalize("NFKC").toLowerCase()).filter((line) => line.length > 0 && !line.startsWith("#")),
    );
  }
  return commonList;
}

/** Null when the password may be used. Never trims, never changes the text it's given. */
export function checkNewPassword(password: string): PasswordProblem | null {
  // The raw limit comes before any other work, so a huge body costs nothing.
  if (password.length > MAX_RAW_PASSWORD_UNITS) return "TOO_LONG";
  if (!password.isWellFormed()) return "NOT_TEXT";
  const normalised = password.normalize("NFKC");
  const count = countCharacters(normalised);
  if (count < MIN_CHARACTERS) return "TOO_SHORT";
  if (count > MAX_CHARACTERS) return "TOO_LONG";
  const folded = normalised.toLowerCase();
  if (isRepeatedUnit(folded) || isSimpleRun(folded) || commonPasswords().has(folded)) return "TOO_COMMON";
  return null;
}

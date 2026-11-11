/**
 * The checks on an owner-named income or expense group. The page runs them as
 * the owner types, and the server runs them again on save (AC-28). No imports,
 * so the page's script can use this file as it is.
 */
export const NAME_LIMIT = 40;
export const RESERVED_NAME = "Not grouped";

export type NameProblem = "EMPTY" | "TOO_LONG" | "RESERVED" | "TAKEN" | "NOT_PLAIN";

const graphemes = (text: string): string[] => Array.from(new Intl.Segmenter("en", { granularity: "grapheme" }).segment(text), (part) => part.segment);

/** Characters people see, so an emoji made of several code points counts once. */
export function visibleLength(text: string): number {
  return graphemes(text).length;
}

// One character people see may carry at most this many accents and code units, so a name
// that looks short can't hide thousands of combining marks (Security S4-17). The largest
// emoji (a family with skin tones) and Indic conjuncts fit well inside both.
export const MARKS_PER_CHARACTER = 6;
export const UNITS_PER_CHARACTER = 32;
const MARK = /\p{M}/gu;

// Invisible formatting characters (zero-width space, word joiner, soft hyphen, byte-order mark,
// fillers and the like) never belong inside a name (Security S4-17). Joiners, variation
// selectors and tag characters are left out here: emoji and some scripts need them, and
// `joinerOutOfPlace` checks where they sit.
const JOINERS = "\u200c\u200d\ufe00-\ufe0f\u{e0020}-\u{e007f}\u{e0100}-\u{e01ef}";
export const HIDDEN = new RegExp(`(?![${JOINERS}])[\\p{Default_Ignorable_Code_Point}\\p{Cf}]`, "u");
const JOINER = new RegExp(`[${JOINERS}]`, "u");
// A joiner or selector is fine inside an emoji (or keycap) or after a letter from a script
// that uses joiners (for example Bengali or Persian); after a Latin letter it only hides.
const JOINER_HOME = /[\p{Extended_Pictographic}\u20e3]|(?![\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}])\p{L}/u;
const joinerOutOfPlace = (character: string): boolean => JOINER.test(character) && !JOINER_HOME.test(character);

// Characters that show nothing: spaces of every kind, zero-width characters and
// other "default ignorable" ones (QA Q4B-5). A name made only of these is empty.
const INVISIBLE = /[\p{White_Space}\p{Default_Ignorable_Code_Point}]/gu;

/** One spelling of each letter (NFC), with spaces at the ends removed. Saved names use this form. */
export const cleanName = (name: string): string => name.normalize("NFC").trim();

/** Ignoring case, spaces at the ends, letters spelt two ways and invisible characters, as the design says. */
export const nameKey = (name: string): string => cleanName(name).replace(INVISIBLE, "").toLowerCase();

// Line breaks and other control characters can't be shown as one line of plain text.
// Direction-changing characters (bidi marks, embeddings, overrides and isolates) can make a
// name read differently from what is stored, so they are refused too (QA Q4B-5).
export const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/;

// What the page takes out as the owner types: control, direction and invisible characters,
// and half of a broken character pair (lone surrogate). The server refuses them all.
const UNPLAIN = new RegExp(`${CONTROL.source}|${HIDDEN.source}|\\p{Cs}`, "gu");
export const plainOnly = (text: string): string => text.replace(UNPLAIN, "");

/**
 * The first problem with a name, or null. `others` are the other groups in the
 * same list, as saved or typed; only that list is checked for repeats.
 * For TAKEN, `takenBy` is the other group's name as it was given.
 */
export function groupNameProblem(name: string, others: readonly string[]): { problem: NameProblem; takenBy?: string } | null {
  // Half of a broken character pair can't be stored as sent (Security S4-16).
  if (!name.isWellFormed()) return { problem: "NOT_PLAIN" };
  const trimmed = cleanName(name);
  if (nameKey(trimmed) === "") return { problem: "EMPTY" };
  const characters = graphemes(trimmed);
  if (characters.length > NAME_LIMIT) return { problem: "TOO_LONG" };
  if (characters.some((one) => one.length > UNITS_PER_CHARACTER || (one.match(MARK)?.length ?? 0) > MARKS_PER_CHARACTER)) return { problem: "TOO_LONG" };
  if (CONTROL.test(trimmed) || HIDDEN.test(trimmed) || characters.some(joinerOutOfPlace)) return { problem: "NOT_PLAIN" };
  if (nameKey(trimmed) === nameKey(RESERVED_NAME)) return { problem: "RESERVED" };
  const taken = others.find((other) => nameKey(other) === nameKey(trimmed));
  return taken === undefined ? null : { problem: "TAKEN", takenBy: cleanName(taken) };
}

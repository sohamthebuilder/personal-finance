#!/usr/bin/env node
/**
 * Runs after the tests. Fails if a spreadsheet or database is left anywhere in
 * the working folder, including ignored files, which the data guard can't see.
 * It looks at file names only, and never opens a file.
 *
 * Usage: node scripts/check-leftovers.mjs [folder]
 */
import { readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const LEFTOVER = new RegExp(
  "\\.(?:xlsx|xls|xlsm|xlsb|xlt|xltx|xltm|ods|fods|numbers|csv|tsv|" +
    "(?:db|db3|sqlite|sqlite3|s3db|sl3)(?:-wal|-shm|-journal)?|mdb|accdb|salt)$",
  "i",
);

/** Folders that hold tools, not anything the tests write to. */
const SKIPPED = new Set(["node_modules", ".git", ".next", ".agents"]);

function findLeftovers(folder) {
  const found = [];
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIPPED.has(entry.name)) found.push(...findLeftovers(join(folder, entry.name)));
    } else if (LEFTOVER.test(entry.name)) {
      found.push(join(folder, entry.name));
    }
  }
  return found;
}

const defaultRoot = fileURLToPath(new URL("..", import.meta.url));
const root = resolve(process.argv[2] ?? defaultRoot);
const leftovers = findLeftovers(root);

if (leftovers.length > 0) {
  console.error("Leftover files found:");
  for (const file of leftovers) console.error(`  ${relative(root, file)}`);
  process.exit(1);
}
console.log("No leftover spreadsheets or databases.");

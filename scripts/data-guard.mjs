#!/usr/bin/env node
/**
 * Blocks spreadsheets, databases, secrets and oversized files from the repo.
 *
 *   --staged   checks what is about to be committed (pre-commit and pre-merge-commit hooks)
 *   --history  checks every file in every commit on every ref (pull request check)
 *   --push     does the same, plus the commits being pushed (pre-push hook)
 *
 * Output names the file and the reason only. It never prints file contents.
 * Exit codes: 0 clean, 1 blocked, 2 the guard itself failed (treated as blocked).
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const BLOCKED_EXTENSION = new RegExp(
  "^(?:" +
    // Spreadsheets and tabular exports
    "xlsx|xls|xlsm|xlsb|xlt|xltx|xltm|ods|fods|numbers|csv|tsv|" +
    // Databases, their side files, and the encrypted database's salt
    "(?:db|db3|sqlite|sqlite3|s3db|sl3)(?:-wal|-shm|-journal)?|mdb|accdb|salt" +
    ")$",
);

const MAX_FILE_BYTES = 5 * 1024 * 1024;

/** File types that are never scanned for table-shaped text. */
const SOURCE_EXTENSIONS = new Set([
  "ts", "tsx", "mts", "cts", "js", "jsx", "mjs", "cjs", "json", "md", "yml", "yaml", "css", "html", "svg",
]);

const CONTENT_SIGNATURES = [
  ["53514c69746520666f726d6174203300", "SQLite database content"],
  ["377f0682", "SQLite side-file content"],
  ["377f0683", "SQLite side-file content"],
  ["d9d505f9", "SQLite side-file content"],
  ["d0cf11e0a1b11ae1", "legacy Excel or Office content"],
  // Excel's "Unicode Text" save is UTF-16, and nothing in this repo needs it.
  ["fffe", "UTF-16 text"],
  ["feff", "UTF-16 text"],
  // Modern spreadsheets are zip files, and no archive belongs in this repo.
  ["504b0304", "spreadsheet or archive content"],
  ["1f8b", "compressed content"],
  ["425a68", "compressed content"],
  ["fd377a585a00", "compressed content"],
  ["28b52ffd", "compressed content"],
  ["377abcaf271c", "archive content"],
  ["526172211a07", "archive content"],
];

const SECRET_PATTERNS = [
  ["Anthropic API key", /\bsk-ant-[A-Za-z0-9_-]{20,}/],
  ["OpenAI API key", /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{32,}/],
  ["GitHub token", /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})/],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/],
  ["Google API key", /\bAIza[0-9A-Za-z_-]{35}\b/],
  ["private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
];

function git(args, options = {}) {
  return execFileSync("git", args, { maxBuffer: 1024 * 1024 * 1024, ...options });
}

/**
 * Checks every folder in the path as well as the file name, because a Numbers
 * document is a folder. Every dotted part counts, so "export.xlsx.bak" is caught.
 */
function pathProblem(path) {
  const segments = path.toLowerCase().split("/");
  const name = segments.at(-1);
  if (name === ".env" || (name.startsWith(".env.") && name !== ".env.example")) {
    return "environment file";
  }
  for (const segment of segments) {
    const parts = segment.replace(/~+$/, "").split(".").slice(1);
    const hit = parts.find((part) => BLOCKED_EXTENSION.test(part));
    if (hit) return `blocked file type (.${hit})`;
  }
  return null;
}

/** Spots a CSV or TSV saved under another name: rows with the same number of fields. */
function looksTabular(path, bytes) {
  const name = path.toLowerCase().split("/").at(-1);
  const extension = name.includes(".") ? name.split(".").at(-1) : "";
  if (SOURCE_EXTENSIONS.has(extension) || bytes.includes(0)) return false;

  const lines = bytes.toString("utf8").split(/\r\n|\r|\n/).filter((line) => line.trim() !== "");
  if (lines.length < 2) return false;

  return [",", "\t", ";", "|"].some((separator) => {
    const tally = new Map();
    for (const line of lines) {
      const count = line.replace(/"[^"]*"/g, "").split(separator).length - 1;
      if (count >= 2) tally.set(count, (tally.get(count) ?? 0) + 1);
    }
    // Uses the most common row length, so a title line above the table doesn't hide it.
    const matching = Math.max(0, ...tally.values());
    return matching >= 2 && matching >= lines.length * 0.6;
  });
}

function contentProblem(path, bytes) {
  if (bytes.length > MAX_FILE_BYTES) return "file is larger than 5 MiB";

  const start = bytes.subarray(0, 16).toString("hex");
  for (const [signature, label] of CONTENT_SIGNATURES) {
    if (start.startsWith(signature)) return label;
  }

  if (/^Standard (?:Jet|ACE) DB/.test(bytes.subarray(4, 24).toString("latin1"))) {
    return "Access database content";
  }
  if (bytes.subarray(257, 262).toString("latin1") === "ustar") return "archive content";

  // XML spreadsheets can carry their marker deep in the file.
  const asText = bytes.toString("latin1");
  if (asText.trimStart().startsWith("<") && /progid="Excel\.Sheet"|office:spreadsheet|opendocument\.spreadsheet/.test(asText)) {
    return "XML spreadsheet content";
  }

  if (looksTabular(path, bytes)) return "table-shaped text, like a renamed CSV";

  for (const [label, pattern] of SECRET_PATTERNS) {
    if (pattern.test(asText)) return `possible ${label}`;
  }
  return null;
}

function stagedEntries() {
  const changed = new Set(
    git(["diff", "--cached", "--name-only", "--no-renames", "--diff-filter=ACMRT", "-z"])
      .toString("utf8")
      .split("\0")
      .filter(Boolean),
  );
  const entries = [];
  for (const record of git(["ls-files", "--stage", "-z"]).toString("utf8").split("\0")) {
    const match = /^(\d+) ([0-9a-f]+) \d+\t(.*)$/s.exec(record);
    if (match && changed.has(match[3])) {
      entries.push({ mode: match[1], sha: match[2], path: match[3] });
    }
  }
  return entries;
}

/** Git gives pre-push one line per ref: local ref, local hash, remote ref, remote hash. */
function pushedCommits() {
  return readFileSync(0, "utf8")
    .split("\n")
    .map((line) => line.split(" ")[1])
    .filter((sha) => sha && !/^0+$/.test(sha));
}

function historyEntries(extraCommits = []) {
  const commits = git(["rev-list", "--all", ...extraCommits]).toString("utf8").split("\n").filter(Boolean);
  const entries = new Map();
  for (const commit of commits) {
    const fields = git([
      "diff-tree", "-r", "-m", "--root", "--no-renames", "--no-commit-id",
      "--diff-filter=ACMRT", "--abbrev=40", "-z", commit,
    ]).toString("utf8").split("\0");

    for (let index = 0; index + 1 < fields.length; index += 2) {
      const [, mode, , sha] = fields[index].split(" ");
      const path = fields[index + 1];
      entries.set(`${sha}\0${path}`, { mode, sha, path });
    }
  }
  return [...entries.values()];
}

function check(entries) {
  const problems = [];
  for (const { mode, sha, path } of entries) {
    const byName = pathProblem(path);
    if (byName) {
      problems.push({ path, reason: byName });
      continue;
    }
    // Submodules have no blob to read.
    if (mode === "160000") continue;
    const reason = contentProblem(path, git(["cat-file", "blob", sha]));
    if (reason) problems.push({ path, reason });
  }
  return problems;
}

function main() {
  const mode = process.argv[2];
  if (!["--staged", "--history", "--push"].includes(mode)) {
    console.error("Usage: data-guard.mjs --staged | --history | --push");
    return 2;
  }

  const entries =
    mode === "--staged" ? stagedEntries() : historyEntries(mode === "--push" ? pushedCommits() : []);
  const problems = check(entries);

  if (problems.length === 0) {
    console.log(`Data guard: ${entries.length} file(s) checked, nothing blocked.`);
    return 0;
  }

  console.error("Data guard blocked this. Real data and secrets must never enter the repo:\n");
  for (const { path, reason } of problems) {
    console.error(`  ${path}: ${reason}`);
  }
  console.error("\nRemove these files. Tests must generate made-up data when they run.");
  return 1;
}

try {
  process.exitCode = main();
} catch (error) {
  console.error(`Data guard failed to run, so this is blocked: ${error.message}`);
  process.exitCode = 2;
}

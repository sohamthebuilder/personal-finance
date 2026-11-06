#!/usr/bin/env node
/**
 * Blocks spreadsheets, databases, secrets and oversized files from the repo.
 *
 *   --staged   checks what is about to be committed (pre-commit hook)
 *   --history  checks every file in every commit on every ref (pull request check)
 *
 * Output names the file and the reason only. It never prints file contents.
 * Exit codes: 0 clean, 1 blocked, 2 the guard itself failed (treated as blocked).
 */
import { execFileSync } from "node:child_process";

const BLOCKED_EXTENSIONS = new Set([
  // Spreadsheets and tabular exports
  "xlsx", "xls", "xlsm", "xlsb", "xltx", "xltm", "ods", "numbers", "csv", "tsv",
  // Databases and their side files
  "db", "db3", "db-wal", "db-shm", "db-journal",
  "sqlite", "sqlite3", "sqlite-wal", "sqlite-shm", "sqlite-journal",
  "s3db", "sl3", "salt",
]);

const MAX_FILE_BYTES = 5 * 1024 * 1024;

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

/** Checks every dotted part of the name, so "export.xlsx.bak" is caught too. */
function pathProblem(path) {
  const name = path.split("/").pop();
  const lower = name.toLowerCase();
  if (lower === ".env" || (lower.startsWith(".env.") && lower !== ".env.example")) {
    return "environment file";
  }
  const parts = lower.split(".").slice(1);
  const hit = parts.find((part) => BLOCKED_EXTENSIONS.has(part));
  return hit ? `blocked file type (.${hit})` : null;
}

function contentProblem(bytes) {
  if (bytes.length > MAX_FILE_BYTES) return "file is larger than 5 MiB";

  if (bytes.subarray(0, 16).toString("latin1") === "SQLite format 3\0") {
    return "SQLite database content";
  }
  if (bytes.subarray(0, 8).toString("hex") === "d0cf11e0a1b11ae1") {
    return "legacy Excel or Office content";
  }
  if (bytes.subarray(0, 4).toString("hex") === "504b0304") {
    // Zip entry names are stored uncompressed, so they can be searched directly.
    const markers = ["xl/workbook", "opendocument.spreadsheet", "Index/Document.iwa"];
    if (markers.some((marker) => bytes.includes(marker))) return "spreadsheet content";
  }

  const text = bytes.toString("latin1");
  for (const [label, pattern] of SECRET_PATTERNS) {
    if (pattern.test(text)) return `possible ${label}`;
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

function historyEntries() {
  const commits = git(["rev-list", "--all"]).toString("utf8").split("\n").filter(Boolean);
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
    const reason = contentProblem(git(["cat-file", "blob", sha]));
    if (reason) problems.push({ path, reason });
  }
  return problems;
}

function main() {
  const mode = process.argv[2];
  if (mode !== "--staged" && mode !== "--history") {
    console.error("Usage: data-guard.mjs --staged | --history");
    return 2;
  }

  const entries = mode === "--staged" ? stagedEntries() : historyEntries();
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

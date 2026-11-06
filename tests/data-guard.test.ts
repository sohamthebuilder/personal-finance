import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCRATCH = mkdtempSync(join(tmpdir(), "data-guard-test-"));

// Made-up test content. Tokens are assembled here so this file doesn't trip the guard itself.
const FAKE_TOKEN_BODY = "A".repeat(40);
const ZIP_HEADER = Buffer.from("504b0304", "hex");
const OLE_HEADER = Buffer.from("d0cf11e0a1b11ae1", "hex");

let repo: string;
let counter = 0;

function git(...args: string[]) {
  return execFileSync("git", args, { cwd: repo, stdio: "pipe" });
}

function write(name: string, content: string | Buffer) {
  const path = join(repo, name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

/** Tries a real commit, so this exercises the hook itself. */
function tryCommit(...files: string[]) {
  execFileSync("git", ["add", "-f", ...files], { cwd: repo });
  return spawnSync("git", ["commit", "-m", "test"], { cwd: repo, encoding: "utf8" });
}

function history() {
  return spawnSync("node", ["scripts/data-guard.mjs", "--history"], { cwd: repo, encoding: "utf8" });
}

beforeEach(() => {
  counter += 1;
  repo = join(SCRATCH, `repo-${counter}`);
  mkdirSync(join(repo, "scripts"), { recursive: true });
  mkdirSync(join(repo, ".githooks"));
  copyFileSync(join(ROOT, "scripts/data-guard.mjs"), join(repo, "scripts/data-guard.mjs"));
  copyFileSync(join(ROOT, ".githooks/pre-commit"), join(repo, ".githooks/pre-commit"));
  git("init", "-q", "-b", "main");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "Test");
  git("config", "core.hooksPath", ".githooks");
  execFileSync("chmod", ["+x", ".githooks/pre-commit"], { cwd: repo });
});

after(() => rmSync(SCRATCH, { recursive: true, force: true }));

describe("pre-commit hook", () => {
  it("lets normal files through", () => {
    write("notes.md", "hello");
    write("src/lib/db/encrypted-db.ts", "export {};");
    const result = tryCommit("notes.md", "src/lib/db/encrypted-db.ts");
    assert.equal(result.status, 0, result.stderr);
  });

  for (const name of [
    "export.xlsx", "EXPORT.XLSX", "nested/folder/export.xls", "export.xlsm", "export.ods", "data.csv",
    "data.tsv", "finance.db", "finance.sqlite", "finance.sqlite3", "finance.db-wal", "finance.db.salt",
    "export.xlsx.bak", "with space.csv",
  ]) {
    it(`blocks ${name}, even with git add -f`, () => {
      write(name, "made up");
      const result = tryCommit(name);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /Data guard blocked/);
    });
  }

  it("blocks .env files but allows .env.example", () => {
    write(".env.local", "X=1");
    assert.notEqual(tryCommit(".env.local").status, 0);
    git("reset", "-q");
    write(".env.example", "X=");
    assert.equal(tryCommit(".env.example").status, 0);
  });

  const renamed: [string, Buffer][] = [
    ["SQLite database", Buffer.concat([Buffer.from("SQLite format 3\0"), Buffer.alloc(100)])],
    ["xlsx", Buffer.concat([ZIP_HEADER, Buffer.from("....xl/workbook.xml....")])],
    ["ods", Buffer.concat([ZIP_HEADER, Buffer.from("mimetypeapplication/vnd.oasis.opendocument.spreadsheet")])],
    ["legacy xls", Buffer.concat([OLE_HEADER, Buffer.alloc(100)])],
  ];
  for (const [label, content] of renamed) {
    it(`blocks a ${label} renamed to .txt`, () => {
      write("harmless.txt", content);
      const result = tryCommit("harmless.txt");
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /content/);
    });
  }

  it("allows an ordinary zip", () => {
    write("archive.bin", Buffer.concat([ZIP_HEADER, Buffer.from("readme.txt")]));
    assert.equal(tryCommit("archive.bin").status, 0);
  });

  it("blocks files over 5 MiB", () => {
    write("big.bin", Buffer.alloc(5 * 1024 * 1024 + 1));
    assert.match(tryCommit("big.bin").stderr, /larger than 5 MiB/);
  });

  const secrets: [string, string][] = [
    ["Anthropic", `sk-${"ant"}-api03-${FAKE_TOKEN_BODY}`],
    ["OpenAI", `sk-${"proj"}-${FAKE_TOKEN_BODY}`],
    ["GitHub", `gh${"p"}_${FAKE_TOKEN_BODY}`],
    ["AWS", `AK${"IA"}${"A".repeat(16)}`],
    ["private key", `-----BEGIN ${"RSA PRIVATE"} KEY-----`],
  ];
  for (const [label, secret] of secrets) {
    it(`blocks a ${label} secret without printing it`, () => {
      write("config.ts", `const value = "${secret}";`);
      const result = tryCommit("config.ts");
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /possible/);
      assert.ok(!result.stderr.includes(secret));
    });
  }

  it("still works for a commit that only deletes a file", () => {
    write("notes.md", "hello");
    tryCommit("notes.md");
    git("rm", "-q", "notes.md");
    assert.equal(spawnSync("git", ["commit", "-m", "remove"], { cwd: repo }).status, 0);
  });
});

describe("history scan used by the pull request check", () => {
  it("passes a clean history", () => {
    write("notes.md", "hello");
    tryCommit("notes.md");
    assert.equal(history().status, 0);
  });

  it("finds a file added in one commit and removed in a later one", () => {
    write("export.xlsx", "made up");
    git("add", "-f", "export.xlsx");
    git("commit", "-q", "--no-verify", "-m", "add");
    git("rm", "-q", "export.xlsx");
    git("commit", "-q", "--no-verify", "-m", "remove");
    const result = history();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /export\.xlsx/);
  });

  it("finds a blocked file on another branch", () => {
    write("notes.md", "hello");
    tryCommit("notes.md");
    git("checkout", "-q", "-b", "other");
    write("data.csv", "made up");
    git("add", "-f", "data.csv");
    git("commit", "-q", "--no-verify", "-m", "add");
    git("checkout", "-q", "main");
    assert.equal(history().status, 1);
  });

  it("catches an existing harmless file renamed to a blocked name", () => {
    write("notes.txt", "hello");
    tryCommit("notes.txt");
    git("mv", "notes.txt", "notes.csv");
    git("commit", "-q", "--no-verify", "-m", "rename");
    const result = history();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /notes\.csv/);
  });

  it("catches a blocked file added in a merge commit", () => {
    write("notes.md", "hello");
    tryCommit("notes.md");
    git("checkout", "-q", "-b", "other");
    write("other.md", "other");
    tryCommit("other.md");
    git("checkout", "-q", "main");
    write("main.md", "main");
    tryCommit("main.md");
    git("merge", "-q", "--no-commit", "--no-ff", "other");
    write("evil.db", "made up");
    git("add", "-f", "evil.db");
    git("commit", "-q", "--no-verify", "-m", "merge");
    assert.equal(history().status, 1);
  });
});

describe("guard failures", () => {
  it("fails closed when it can't run", () => {
    const result = spawnSync("node", ["scripts/data-guard.mjs", "--history"], {
      cwd: repo,
      encoding: "utf8",
      env: { ...process.env, GIT_DIR: "/nonexistent" },
    });
    assert.equal(result.status, 2);
  });

  it("refuses unknown options", () => {
    const result = spawnSync("node", ["scripts/data-guard.mjs", "--nope"], { cwd: repo, encoding: "utf8" });
    assert.equal(result.status, 2);
  });
});

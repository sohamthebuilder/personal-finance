import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
const HOOK = join(ROOT, ".claude/hooks/block-spreadsheet-reads.mjs");
const OUTSIDE = realpathSync(mkdtempSync(join(tmpdir(), "hook-test-")));

after(() => rmSync(OUTSIDE, { recursive: true, force: true }));

function run(toolName: string, toolInput: object, cwd = ROOT) {
  const result = spawnSync("node", [HOOK], {
    input: JSON.stringify({ tool_name: toolName, tool_input: toolInput, cwd }),
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout === "" ? "allowed" : JSON.parse(result.stdout).hookSpecificOutput.permissionDecision;
}

const shell = (command: string, cwd?: string) => run("Bash", { command }, cwd);

describe("file tools", () => {
  it("blocks spreadsheets outside the repo", () => {
    assert.equal(run("Read", { file_path: join(OUTSIDE, "export.xlsx") }), "deny");
    assert.equal(run("Read", { file_path: join(OUTSIDE, "EXPORT.XLSX") }), "deny");
    assert.equal(run("Read", { file_path: "~/Desktop/export.xls" }), "deny");
    assert.equal(run("Read", { file_path: join(OUTSIDE, "data.csv") }), "deny");
  });

  it("blocks a symlink in the repo that points to an outside spreadsheet", () => {
    const target = join(OUTSIDE, "export.xlsx");
    const link = join(OUTSIDE, "innocent.txt");
    writeFileSync(target, "made up");
    symlinkSync(target, link);
    assert.equal(run("Read", { file_path: link }), "deny");
  });

  it("blocks searches for spreadsheets outside the repo", () => {
    assert.equal(run("Glob", { pattern: "*.xlsx", path: homedir() }), "deny");
    assert.equal(run("Grep", { pattern: "x", glob: "*.csv", path: homedir() }), "deny");
    assert.equal(run("Glob", { pattern: "**/*.xlsx" }, OUTSIDE), "deny");
  });

  it("allows other files", () => {
    assert.equal(run("Read", { file_path: join(ROOT, "README.md") }), "allowed");
    assert.equal(run("Read", { file_path: join(OUTSIDE, "notes.md") }), "allowed");
    assert.equal(run("Glob", { pattern: "**/*.ts", path: homedir() }), "allowed");
  });

  it("doesn't confuse similar extensions", () => {
    assert.equal(run("Read", { file_path: join(OUTSIDE, "report.csvx") }), "allowed");
    assert.equal(run("Read", { file_path: join(OUTSIDE, "list.xlsxfoo") }), "allowed");
  });
});

describe("shell commands", () => {
  it("blocks reading outside spreadsheets", () => {
    for (const command of [
      "cat ~/Desktop/export.xlsx",
      "cat $HOME/Desktop/export.xlsx",
      "cat /Users/someone/Desktop/export.csv",
      'python3 -c "import pandas; pandas.read_excel(\'/tmp/export.xlsx\')"',
      "cd ~/Desktop && cat export.xlsx",
      "find ~ -name '*.xlsx'",
      "cat ../other/export.xlsx",
      "cp ~/Downloads/export.XLSX ./copy.txt",
    ]) {
      assert.equal(shell(command), "deny", command);
    }
  });

  it("blocks a spreadsheet command run from outside the repo", () => {
    assert.equal(shell("cat export.xlsx", OUTSIDE), "deny");
  });

  it("blocks a symlink named in a command", () => {
    assert.equal(shell(`cat ${join(OUTSIDE, "innocent.txt")}`), "deny");
  });

  it("allows normal work, including guard testing inside the repo", () => {
    for (const command of [
      "npm test",
      "git status",
      "ls ~/Desktop",
      "git check-ignore fake.xlsx",
      "touch fake.xlsx && git add -f fake.xlsx 2>/dev/null",
      "rm fake.xlsx",
    ]) {
      assert.equal(shell(command), "allowed", command);
    }
  });
});

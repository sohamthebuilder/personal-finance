import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const packageJson = JSON.parse(read("package.json"));

describe("package.json", () => {
  it("turns telemetry off wherever Next.js runs", () => {
    const scripts = Object.entries<string>(packageJson.scripts).filter(([, command]) => /\bnext\b|server\.ts/.test(command));
    assert.ok(scripts.length >= 3);
    for (const [name, command] of scripts) {
      assert.match(command, /NEXT_TELEMETRY_DISABLED=1/, name);
    }
  });

  it("binds every server script to 127.0.0.1", () => {
    assert.match(packageJson.scripts.dev, /-H 127\.0\.0\.1\b/);
    assert.match(packageJson.scripts.start, /node server\.ts/);
    assert.match(read("server.ts"), /const HOST = "127\.0\.0\.1";/);
  });


  it("pins every dependency to an exact version", () => {
    const all = { ...packageJson.dependencies, ...packageJson.devDependencies };
    assert.ok(Object.keys(all).length > 0);
    for (const [name, version] of Object.entries<string>(all)) {
      assert.match(version, /^\d+\.\d+\.\d+$/, name);
    }
  });
});

describe(".npmrc", () => {
  it("saves exact versions and doesn't run install scripts", () => {
    const npmrc = read(".npmrc");
    assert.match(npmrc, /^save-exact=true$/m);
    assert.match(npmrc, /^ignore-scripts=true$/m);
  });
});

describe("pull request workflow", () => {
  const workflow = read(".github/workflows/pr-check.yml");

  it("pins every action to a full commit hash", () => {
    const uses = [...workflow.matchAll(/uses:\s*(\S+)/g)].map((match) => match[1] as string);
    assert.ok(uses.length > 0);
    for (const action of uses) {
      assert.match(action, /@[0-9a-f]{40}$/, action);
    }
  });

  it("has a read-only token and saves no credentials", () => {
    assert.match(workflow, /^permissions:\n {2}contents: read$/m);
    const checkouts = workflow.match(/actions\/checkout@/g)?.length;
    assert.equal(workflow.match(/persist-credentials: false/g)?.length, checkouts);
  });

  it("runs the guard, tests and audit", () => {
    for (const command of ["npm run guard", "npm test", "npm audit"]) {
      assert.ok(workflow.includes(command), command);
    }
  });
});

describe(".claude/settings.json", () => {
  const settings = JSON.parse(read(".claude/settings.json"));

  it("denies reading every spreadsheet type", () => {
    for (const extension of ["xlsx", "xls", "xlsm", "xlsb", "xlt", "xltx", "xltm", "ods", "fods", "numbers", "csv", "tsv"]) {
      assert.ok(settings.permissions.deny.includes(`Read(//**/*.${extension})`), extension);
    }
  });

  it("blocks the tool call if the hook can't run", () => {
    const hook = settings.hooks.PreToolUse[0].hooks[0];
    assert.equal(hook.onFailure, "block");
    assert.match(settings.hooks.PreToolUse[0].matcher, /Bash/);
  });
});

describe(".gitignore", () => {
  it("covers spreadsheets, CSV files and databases", () => {
    const gitignore = read(".gitignore");
    for (const pattern of ["*.xlsx", "*.xls", "*.csv", "*.db", "*.sqlite", "*.sqlite3"]) {
      assert.ok(gitignore.split("\n").includes(pattern), pattern);
    }
  });
});

describe("the app", () => {
  it("loads nothing from third parties", () => {
    assert.doesNotMatch(read("src/app/layout.tsx"), /next\/font\/google|<script|https?:\/\//);
  });
});

describe("next.config.ts", () => {
  it("stops Next.js writing agent instructions into the repo", () => {
    assert.match(read("next.config.ts"), /agentRules: false/);
  });
});

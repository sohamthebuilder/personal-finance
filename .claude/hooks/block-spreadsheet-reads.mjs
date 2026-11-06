#!/usr/bin/env node
/**
 * Stops agents reaching spreadsheets outside this repo.
 *
 * The deny rules in .claude/settings.json cover the file tools. This hook adds
 * shell commands, symlinks and upper-case names, which those rules miss.
 * It guards against mistakes. It isn't a sandbox: a script that builds a file
 * name at runtime can still get past it.
 */
import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = realpathSync(join(dirname(fileURLToPath(import.meta.url)), "..", ".."));
const SPREADSHEET = /\.(xlsx|xls|xlsm|xlsb|xltx|xltm|ods|numbers|csv|tsv)(?![a-z0-9])/i;

function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: `${reason} Real financial files are off limits to agents. See docs/PROJECT_BRIEF.md section 9.`,
      },
    }),
  );
}

function expandHome(path) {
  return path.replace(/^(~|\$HOME|\$\{HOME\})(?=\/|$)/, homedir());
}

/** Follows symlinks where it can, so a link in the repo can't hide an outside file. */
function realLocation(path, cwd) {
  const expanded = expandHome(path);
  const absolute = isAbsolute(expanded) ? expanded : resolve(cwd, expanded);
  try {
    return realpathSync(absolute);
  } catch {
    return absolute;
  }
}

function isInsideRepo(path) {
  return path === REPO || path.startsWith(REPO + sep);
}

function checkFileTool(input, cwd) {
  const targets = [input.file_path, input.path].filter(Boolean);
  const pattern = [input.pattern, input.glob].filter(Boolean).join(" ");

  for (const target of targets) {
    const location = realLocation(target, cwd);
    if (SPREADSHEET.test(location) && !isInsideRepo(location)) {
      return "This spreadsheet is outside the repo.";
    }
    if (SPREADSHEET.test(pattern) && !isInsideRepo(location)) {
      return "This search looks for spreadsheets outside the repo.";
    }
  }
  if (targets.length === 0 && SPREADSHEET.test(pattern) && !isInsideRepo(realLocation(cwd, cwd))) {
    return "This search looks for spreadsheets outside the repo.";
  }
  return null;
}

/** Words in a shell command that point somewhere other than the current folder. */
function outsidePaths(command, cwd) {
  const words = command.split(/[\s;|&<>()"'`=]+/).filter(Boolean);
  return words
    .filter((word) => /^(\/|~|\$HOME|\$\{HOME\}|\.\.)/.test(word))
    .filter((word) => !/^\/dev(\/|$)/.test(word))
    .filter((word) => !isInsideRepo(realLocation(word, cwd)));
}

function checkShell(input, cwd) {
  const command = input.command ?? "";
  // Follow any symlink named in the command, in case it hides a spreadsheet.
  const words = command.split(/[\s;|&<>()"'`=]+/).filter(Boolean);
  const hidden = words.some((word) => {
    const location = realLocation(word, cwd);
    return SPREADSHEET.test(location) && !isInsideRepo(location);
  });
  if (hidden) return "This command touches a spreadsheet outside the repo.";

  if (!SPREADSHEET.test(command)) return null;
  if (!isInsideRepo(realLocation(cwd, cwd))) {
    return "This command mentions a spreadsheet and runs outside the repo.";
  }
  if (outsidePaths(command, cwd).length > 0) {
    return "This command mentions a spreadsheet and a location outside the repo.";
  }
  return null;
}

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => (raw += chunk));
process.stdin.on("end", () => {
  const event = JSON.parse(raw);
  const cwd = event.cwd ?? process.cwd();
  const input = event.tool_input ?? {};
  const reason = event.tool_name === "Bash" ? checkShell(input, cwd) : checkFileTool(input, cwd);
  if (reason) deny(reason);
});

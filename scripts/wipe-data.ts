/**
 * The forgotten-password wipe (condition 29, Decision 9). Run with `npm run wipe`.
 *
 * Deletes only the app's own named files in its data folder: the database
 * first, then its side files, run file and marker, and the salt last. Then
 * the folder, only if it's empty. Never searches the disk, never follows a
 * link, never removes anything it doesn't recognise. Prints fixed lines only.
 * Safe to run twice.
 */
import { lstatSync, readdirSync, readFileSync, realpathSync, rmdirSync, unlinkSync } from "node:fs";
import net from "node:net";
import { dirname, join } from "node:path";
import { createInterface, type Interface } from "node:readline";
import { dataFiles, dataFolder, FOLDER_NAME, ownedNames, wipeOrder } from "../src/lib/data-files.ts";

export interface WipeOptions {
  home: string | undefined;
  isTerminal: boolean;
  /** Reads one line typed by the owner. */
  ask: (question: string) => Promise<string>;
  print: (line: string) => void;
  isAppRunning?: (pid: number, port: number) => Promise<boolean>;
}

function isMissing(error: unknown): boolean {
  return (error as { code?: string }).code === "ENOENT";
}

/** Running means the process is alive and its port answers on 127.0.0.1. Both, so a stale file can't block a wipe. */
export async function appIsRunning(pid: number, port: number): Promise<boolean> {
  try {
    process.kill(pid, 0);
  } catch (error) {
    if ((error as { code?: string }).code !== "EPERM") return false;
  }
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port, timeout: 1000 });
    const done = (answer: boolean) => {
      socket.destroy();
      resolve(answer);
    };
    socket.on("connect", () => done(true));
    socket.on("error", () => done(false));
    socket.on("timeout", () => done(false));
  });
}

function readRunFile(path: string): { pid: number; port: number } | null {
  try {
    const [pid, port] = readFileSync(path, "utf8").split("\n");
    if (!/^\d{1,9}$/.test(pid ?? "") || !/^\d{1,5}$/.test(port ?? "")) return null;
    return { pid: Number(pid), port: Number(port) };
  } catch {
    return null;
  }
}

export async function runWipe(options: WipeOptions): Promise<number> {
  const { print } = options;
  const folder = dataFolder(options.home);
  if (folder === null) {
    print("HOME isn't set to a full path, so nothing was deleted.");
    return 1;
  }

  try {
    const stat = lstatSync(folder);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error("not a folder");
    if (realpathSync(folder) !== join(realpathSync(dirname(folder)), FOLDER_NAME)) throw new Error("moved");
  } catch (error) {
    if (isMissing(error)) {
      print("There's nothing to delete. The app's data folder isn't there.");
      return 0;
    }
    print("The app's data folder isn't a plain folder where it should be, so nothing was deleted.");
    return 1;
  }

  const files = dataFiles(folder);

  // Every target is checked before anything is deleted. A link or a non-file stops the whole run.
  const present: string[] = [];
  for (const path of wipeOrder(files)) {
    try {
      const stat = lstatSync(path);
      if (!stat.isFile()) {
        print("One of the app's files is a link or isn't a plain file, so nothing was deleted.");
        return 1;
      }
      present.push(path);
    } catch (error) {
      if (!isMissing(error)) {
        print("One of the app's files couldn't be checked, so nothing was deleted.");
        return 1;
      }
    }
  }

  const run = present.includes(files.run) ? readRunFile(files.run) : null;
  if (run !== null && (await (options.isAppRunning ?? appIsRunning)(run.pid, run.port))) {
    print("The app is still running. Stop it with Control-C in its Terminal window, then run this again. Nothing was deleted.");
    return 1;
  }

  const owned = ownedNames(files);
  const others = readdirSync(folder).filter((name) => !owned.has(name)).length;
  const otherLine = () => {
    if (others > 0) print(`${others} other ${others === 1 ? "file" : "files"} in the folder ${others === 1 ? "was" : "were"} left as ${others === 1 ? "it was" : "they were"}.`);
  };

  if (present.length === 0) {
    print("There's nothing to delete. The app's files are already gone.");
    otherLine();
    if (others === 0) rmdirSync(folder);
    return 0;
  }

  print("This deletes these files from the app's data folder:");
  for (const path of present) print(`  ${path.slice(folder.length + 1)}`);
  print("Export files and anything else on your Mac aren't touched.");

  if (!options.isTerminal) {
    print("This needs to run in Terminal, so nothing was deleted.");
    return 1;
  }
  const answer = await options.ask("Type DELETE and press Return to delete them, or anything else to stop: ");
  if (answer !== "DELETE") {
    print("Nothing was deleted.");
    return 1;
  }

  const left: string[] = [];
  for (const path of present) {
    try {
      unlinkSync(path);
    } catch (error) {
      if (!isMissing(error)) left.push(path.slice(folder.length + 1));
    }
  }

  let folderEmpty = false;
  try {
    if (readdirSync(folder).length === 0) {
      rmdirSync(folder);
      folderEmpty = true;
    }
  } catch {
    folderEmpty = false;
  }

  if (left.length === 0) {
    print("Everything in the app is deleted. Run the app again to create a new password.");
  } else {
    print("Some files couldn't be deleted:");
    for (const name of left) print(`  ${name}`);
  }
  if (!folderEmpty) otherLine();
  return left.length === 0 ? 0 : 1;
}

/** Asks once. End of input (Control-D) counts as "not DELETE", so the script ends cleanly (Q4-8). */
export function askLine(rl: Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    const onClose = () => resolve("");
    rl.once("close", onClose);
    rl.question(question, (line) => {
      rl.off("close", onClose);
      resolve(line);
    });
  });
}

if (import.meta.main) {
  const terminal = process.stdin.isTTY === true;
  const rl = terminal ? createInterface({ input: process.stdin, output: process.stdout, terminal: true }) : null;
  const code = await runWipe({
    home: process.env.HOME,
    isTerminal: terminal,
    ask: (question) => (rl === null ? Promise.resolve("") : askLine(rl, question)),
    print: (line) => console.log(line),
  });
  rl?.close();
  process.exitCode = code;
}

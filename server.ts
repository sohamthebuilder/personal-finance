/**
 * The production server. Next.js answers some requests before src/proxy.ts runs,
 * such as trailing-slash redirects, so this gate checks every request first.
 * It also sets baseline headers, so redirects and errors carry them too.
 */
import { EventEmitter } from "node:events";
import { rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import next from "next";
import { finishDelete } from "./src/lib/auth/delete-data.ts";
import { lock, startSweeper } from "./src/lib/auth/session.ts";
import { appFiles } from "./src/lib/auth/start-screen.ts";
import { prepareDataFolder } from "./src/lib/data-files.ts";
import { gateRequest } from "./src/lib/security/gate.ts";
import { appPort, baselineHeaders } from "./src/lib/security/request-policy.ts";

const HOST = "127.0.0.1";
const port = appPort();

// Every file the app makes is for the owner's Mac user only (S4-9).
process.umask(0o077);
const files = appFiles();
if (files === null) {
  console.error("The app can't start: HOME isn't set to a full path.");
  process.exit(1);
}
try {
  prepareDataFolder(files.folder);
} catch {
  console.error("The app can't start: its data folder isn't a plain folder in the expected place.");
  process.exit(1);
}
// A delete that was cut short always finishes (design screen 14).
finishDelete(files);
// The wipe script reads this to tell whether the app is running (Decision 9).
writeFileSync(files.run, `${process.pid}\n${port}\n`, { mode: 0o600 });

// Next.js attaches an "upgrade" listener to the server it's given, and upgrades
// sent there would skip this gate. It gets a stand-in, so the real server has no
// such listener and Node treats an upgrade request as a normal request.
const app = next({
  dev: false,
  hostname: HOST,
  port: Number(port),
  httpServer: new EventEmitter() as Server,
});
const handle = app.getRequestHandler();
await app.prepare();

const server = createServer((request, response) => {
  for (const [name, value] of Object.entries(baselineHeaders())) {
    response.setHeader(name, value);
  }

  const decision = gateRequest(
    { method: request.method ?? "", url: request.url ?? "", rawHeaders: request.rawHeaders },
    port,
  );
  if (!decision.pass) {
    // Nothing more is read from this request, so the connection isn't reused.
    response.setHeader("Connection", "close");
    response.statusCode = decision.status;
    if (decision.status === 303) {
      response.setHeader("Location", decision.location);
      response.end();
    } else if (decision.status === 403) {
      response.setHeader("Content-Type", "text/plain");
      response.end("Forbidden");
    } else {
      response.end();
    }
    return;
  }

  handle(request, response).catch(() => {
    response.statusCode = 500;
    response.end();
  });
});

server.listen(Number(port), HOST, () => {
  startSweeper();
  console.log(`Ready on http://${HOST}:${port}`);
});

// A restart is locked by default, because the key lives only in memory. Close the handle on the way out too.
let stopping = false;
async function stop(): Promise<void> {
  if (stopping) return;
  stopping = true;
  await lock(null);
  if (files) rmSync(files.run, { force: true });
  process.exit(0);
}
process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());

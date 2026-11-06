/**
 * The production server. Next.js answers some requests before src/proxy.ts runs,
 * such as trailing-slash redirects, so this gate checks every request first.
 * It also sets baseline headers, so redirects and errors carry them too.
 */
import { EventEmitter } from "node:events";
import { createServer, type Server } from "node:http";
import next from "next";
import { appPort, baselineHeaders, checkRawRequest } from "./src/lib/security/request-policy.ts";

const HOST = "127.0.0.1";
const port = appPort();

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

  const decision = checkRawRequest(
    { method: request.method ?? "", url: request.url ?? "", rawHeaders: request.rawHeaders },
    port,
  );
  if (!decision.allowed) {
    response.statusCode = 403;
    response.setHeader("Content-Type", "text/plain");
    response.end("Forbidden");
    return;
  }

  handle(request, response).catch(() => {
    response.statusCode = 500;
    response.end();
  });
});

server.listen(Number(port), HOST, () => {
  console.log(`Ready on http://${HOST}:${port}`);
});

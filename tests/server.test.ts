/**
 * Builds the real production app, starts it, and checks it from the outside.
 * Uses raw HTTP because fetch won't let a test set the Host header.
 */
import assert from "node:assert/strict";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import http from "node:http";
import net from "node:net";
import { networkInterfaces } from "node:os";
import { dirname, resolve } from "node:path";
import { after, before, describe, it } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 3117;
const HOST = `127.0.0.1:${PORT}`;

interface Reply {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}

function request(path: string, options: { method?: string; headers?: Record<string, string> } = {}): Promise<Reply> {
  return new Promise((resolvePromise, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port: PORT, path, method: options.method ?? "GET", headers: { Host: HOST, ...options.headers } },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolvePromise({ status: res.statusCode ?? 0, headers: res.headers, body }));
      },
    );
    req.on("error", reject);
    req.end();
  });
}

function canConnect(host: string): Promise<boolean> {
  return new Promise((resolvePromise) => {
    const socket = net.connect({ host, port: PORT, timeout: 1000 });
    const finish = (result: boolean) => {
      socket.destroy();
      resolvePromise(result);
    };
    socket.on("connect", () => finish(true));
    socket.on("error", () => finish(false));
    socket.on("timeout", () => finish(false));
  });
}

/** Sends bytes exactly as given, for requests no HTTP client will produce. */
function rawRequest(text: string): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const socket = net.connect({ host: "127.0.0.1", port: PORT });
    let reply = "";
    socket.setEncoding("utf8");
    socket.on("connect", () => socket.write(text));
    socket.on("data", (chunk) => (reply += chunk));
    socket.on("end", () => resolvePromise(reply));
    socket.on("error", reject);
  });
}

describe("production server", { timeout: 240_000 }, () => {
  let server: ChildProcess;

  before(async () => {
    execFileSync("npm", ["run", "build"], { cwd: ROOT, stdio: "pipe" });
    server = spawn("npm", ["run", "start"], {
      cwd: ROOT,
      env: { ...process.env, APP_PORT: String(PORT) },
      stdio: "ignore",
      detached: true,
    });

    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (await canConnect("127.0.0.1")) return;
      await sleep(200);
    }
    throw new Error("The server didn't start.");
  });

  after(() => {
    // The group is signalled because npm starts Next.js as a child process.
    if (server?.pid) process.kill(-server.pid, "SIGTERM");
  });

  it("serves the empty page", async () => {
    const reply = await request("/");
    assert.equal(reply.status, 200);
    assert.match(reply.body, /Personal Finance/);
  });

  it("listens on 127.0.0.1 only", async () => {
    const addresses = Object.values(networkInterfaces())
      .flat()
      .filter((address) => address && !address.internal && address.family === "IPv4")
      .map((address) => address!.address);

    for (const address of addresses) {
      assert.equal(await canConnect(address), false, address);
    }
    assert.equal(await canConnect("::1"), false, "::1");
  });

  it("sends the security headers", async () => {
    const { headers } = await request("/");
    const csp = headers["content-security-policy"] as string;
    assert.match(csp, /default-src 'none'/);
    assert.match(csp, /script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
    assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval/);
    assert.equal(headers["x-content-type-options"], "nosniff");
    assert.equal(headers["x-frame-options"], "DENY");
    assert.equal(headers["referrer-policy"], "no-referrer");
    assert.equal(headers["cross-origin-opener-policy"], "same-origin");
    assert.equal(headers["cross-origin-resource-policy"], "same-origin");
    assert.ok(headers["permissions-policy"]);
    assert.match(headers["cache-control"] as string, /no-store/);
    assert.equal(headers["x-powered-by"], undefined);
  });

  it("puts a fresh nonce on every script, and no script goes without", async () => {
    const first = await request("/");
    const second = await request("/");
    const nonce = /'nonce-([^']+)'/.exec(first.headers["content-security-policy"] as string)?.[1];
    const other = /'nonce-([^']+)'/.exec(second.headers["content-security-policy"] as string)?.[1];
    assert.ok(nonce);
    assert.notEqual(nonce, other);

    const scripts = first.body.match(/<script\b[^>]*>/g) ?? [];
    assert.ok(scripts.length > 0);
    for (const script of scripts) {
      assert.ok(script.includes(`nonce="${nonce}"`), script);
    }
  });

  it("protects static files and unknown paths too", async () => {
    const page = await request("/");
    const asset = /\/_next\/static\/[^"]+\.js/.exec(page.body)?.[0];
    assert.ok(asset);

    const allowed = await request(asset);
    assert.equal(allowed.status, 200);
    assert.equal(allowed.headers["x-content-type-options"], "nosniff");

    assert.equal((await request(asset, { headers: { Host: "evil.example" } })).status, 403);
    assert.equal((await request("/no-such-page", { headers: { Host: "evil.example" } })).status, 403);
    assert.ok((await request("/no-such-page")).headers["content-security-policy"]);
  });

  it("refuses an unexpected Host, as in DNS rebinding", async () => {
    const reply = await request("/", { headers: { Host: "evil.example" } });
    assert.equal(reply.status, 403);
    assert.doesNotMatch(reply.body, /Personal Finance/);
    assert.ok(reply.headers["content-security-policy"]);
  });

  it("refuses an unexpected Origin", async () => {
    assert.equal((await request("/", { headers: { Origin: "http://evil.example" } })).status, 403);
    assert.equal((await request("/", { method: "POST", headers: { Origin: "http://evil.example" } })).status, 403);
  });

  it("refuses a state-changing request with no Origin", async () => {
    assert.equal((await request("/", { method: "POST" })).status, 403);
  });

  it("refuses a cross-site browser request", async () => {
    assert.equal((await request("/", { headers: { "Sec-Fetch-Site": "cross-site" } })).status, 403);
  });

  it("rejects bad requests on paths Next.js would redirect before its proxy runs", async () => {
    for (const path of ["/foo/", "/foo//bar"]) {
      const attacks: Record<string, string>[] = [
        { Host: "evil.example" },
        { Origin: "http://evil.example" },
        { "Sec-Fetch-Site": "cross-site" },
      ];
      for (const headers of attacks) {
        assert.equal((await request(path, { headers })).status, 403, `${path} ${JSON.stringify(headers)}`);
      }
    }
    assert.equal((await request("/foo/", { method: "POST" })).status, 403);
    assert.equal((await request("//evil.example/")).status, 403);
  });

  it("sends the security headers on redirects", async () => {
    const reply = await request("/foo/");
    assert.equal(reply.status, 308);
    assert.equal(reply.headers["x-content-type-options"], "nosniff");
    assert.match(reply.headers["content-security-policy"] as string, /default-src 'none'/);
    assert.equal(reply.headers["cache-control"], "no-store");
  });

  it("refuses TRACE and OPTIONS *, with headers", async () => {
    const trace = await request("/", { method: "TRACE" });
    assert.equal(trace.status, 403);
    assert.equal(trace.headers["x-frame-options"], "DENY");

    const star = await rawRequest(`OPTIONS * HTTP/1.1\r\nHost: ${HOST}\r\nConnection: close\r\n\r\n`);
    assert.match(star, /^HTTP\/1\.1 403/);
    assert.match(star, /x-frame-options: DENY/i);
  });

  it("refuses absolute-form requests, so it can't redirect off the Mac", async () => {
    const reply = await rawRequest(`GET http://evil.example/ HTTP/1.1\r\nHost: ${HOST}\r\nConnection: close\r\n\r\n`);
    assert.match(reply, /^HTTP\/1\.1 403/);
    assert.doesNotMatch(reply, /location:/i);
  });

  it("refuses two Host headers, in either order", async () => {
    for (const hosts of [`Host: ${HOST}\r\nHost: evil.example`, `Host: evil.example\r\nHost: ${HOST}`]) {
      const reply = await rawRequest(`GET / HTTP/1.1\r\n${hosts}\r\nConnection: close\r\n\r\n`);
      assert.match(reply, /^HTTP\/1\.1 403/);
      assert.doesNotMatch(reply, /Personal Finance/);
    }
  });

  it("accepts localhost and a same-origin POST past the guard", async () => {
    assert.equal((await request("/", { headers: { Host: `localhost:${PORT}` } })).status, 200);
    const post = await request("/", { method: "POST", headers: { Origin: `http://${HOST}`, "Sec-Fetch-Site": "same-origin" } });
    assert.notEqual(post.status, 403);
  });

  it("ignores a client trying to pick its own nonce", async () => {
    const reply = await request("/", { headers: { "x-nonce": "attacker" } });
    assert.doesNotMatch(reply.body, /nonce="attacker"/);
    assert.doesNotMatch(reply.headers["content-security-policy"] as string, /attacker/);
  });
});

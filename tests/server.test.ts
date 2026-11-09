/**
 * Builds the real production app, starts it, and checks it from the outside.
 * Uses raw HTTP because fetch won't let a test set the Host header.
 */
import assert from "node:assert/strict";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import { networkInterfaces } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, before, describe, it } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { advanceDatabase, MADE_UP_PASSWORD, type TempHome, tempHome } from "./support/app-helpers.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 3117;
const HOST = `127.0.0.1:${PORT}`;

interface Reply {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}

function request(path: string, options: { method?: string; headers?: Record<string, string>; body?: string } = {}): Promise<Reply> {
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
    req.end(options.body);
  });
}

/** A same-origin form POST, as the app's own pages send it. */
function post(path: string, fields: Record<string, string>, cookie?: string): Promise<Reply> {
  const body = new URLSearchParams(fields).toString();
  return request(path, {
    method: "POST",
    body,
    headers: {
      Origin: `http://${HOST}`,
      "Sec-Fetch-Site": "same-origin",
      "Content-Type": "application/x-www-form-urlencoded",
      "Content-Length": String(Buffer.byteLength(body)),
      ...(cookie ? { Cookie: cookie } : {}),
    },
  });
}

function cookieFrom(reply: Reply): string {
  const set = reply.headers["set-cookie"]?.[0] ?? "";
  return set.split(";")[0] ?? "";
}

/** Checks page text without printing the whole page on failure. */
function assertHas(body: string, pattern: RegExp): void {
  assert.ok(pattern.test(body), `expected ${pattern}`);
}
function assertHasNot(body: string, pattern: RegExp): void {
  assert.ok(!pattern.test(body), `didn't expect ${pattern}`);
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
  // The app runs on a made-up HOME, never the real data folder.
  let home: TempHome;
  let output = "";

  before(async () => {
    home = tempHome();
    execFileSync("npm", ["run", "build"], { cwd: ROOT, stdio: "pipe" });
    server = spawn("npm", ["run", "start"], {
      cwd: ROOT,
      env: { ...process.env, APP_PORT: String(PORT), HOME: home.home },
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    });
    server.stdout?.on("data", (chunk) => (output += String(chunk)));
    server.stderr?.on("data", (chunk) => (output += String(chunk)));

    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (await canConnect("127.0.0.1")) return;
      await sleep(200);
    }
    throw new Error("The server didn't start.");
  });

  after(async () => {
    // The group is signalled because npm starts Next.js as a child process.
    if (server?.pid) process.kill(-server.pid, "SIGTERM");
    await sleep(500);
    home?.cleanup();
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
    // The session gate answers before Next.js's own trailing-slash redirect.
    assert.equal(reply.status, 303);
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

  it("sends upgrade requests through the gate, even after a normal request", async () => {
    // Next.js would attach its own upgrade listener on the first allowed request.
    assert.equal((await request("/")).status, 200);

    const upgrade = (headers: string) =>
      rawRequest(
        `GET / HTTP/1.1\r\n${headers}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n` +
          "Sec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n",
      );

    assert.match(await upgrade("Host: evil.example"), /^HTTP\/1\.1 403/);
    assert.match(await upgrade(`Host: ${HOST}\r\nOrigin: http://evil.example`), /^HTTP\/1\.1 403/);
    assert.doesNotMatch(await upgrade(`Host: ${HOST}`), /^HTTP\/1\.1 101/);
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

  it("has no Google font host anywhere in the build (condition 31)", () => {
    for (const folder of [".next/static", ".next/server"]) {
      for (const entry of readdirSync(join(ROOT, folder), { recursive: true, withFileTypes: true })) {
        if (!entry.isFile()) continue;
        const body = readFileSync(join(entry.parentPath, entry.name), "latin1");
        assert.doesNotMatch(body, /fonts\.googleapis\.com|fonts\.gstatic\.com|next\/font\/google/, entry.name);
      }
    }
  });

  it("refuses size and server-action tricks before Next.js sees them (condition 40)", async () => {
    const noLength = await rawRequest(`POST /api/login HTTP/1.1\r\nHost: ${HOST}\r\nOrigin: http://${HOST}\r\nConnection: close\r\n\r\n`);
    assert.match(noLength.slice(0, 20), /^HTTP\/1\.1 411/);
    const chunked = await rawRequest(
      `POST /api/login HTTP/1.1\r\nHost: ${HOST}\r\nOrigin: http://${HOST}\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n0\r\n\r\n`,
    );
    assert.match(chunked.slice(0, 20), /^HTTP\/1\.1 411/);
    const big = await rawRequest(
      `POST /api/login HTTP/1.1\r\nHost: ${HOST}\r\nOrigin: http://${HOST}\r\nContent-Length: 5000\r\nConnection: close\r\n\r\n`,
    );
    assert.match(big.slice(0, 20), /^HTTP\/1\.1 413/);
    assert.equal((await request("/", { headers: { "Next-Action": "x" } })).status, 403);
  });

  it("sends every page and route without a session to the start screen or a 401", async () => {
    for (const path of ["/settings", "/settings/delete", "/upload", "/?screen=shell"]) {
      const reply = await request(path);
      assert.equal(reply.status, 303, path);
      assert.equal(reply.headers.location, "/", path);
    }
    for (const path of ["/api/logout", "/api/delete", "/api/period"]) assert.equal((await post(path, {})).status, 401, path);
    assert.equal((await request("/api/status")).status, 401);
    // The font path passes the gate (the file arrives with the owner's approval), but not with a query.
    assert.notEqual((await request("/fonts/google-sans-flex.woff2")).status, 303);
    assert.equal((await request("/fonts/google-sans-flex.woff2?v=1")).status, 303);
  });

  it("runs the whole 4A flow on a made-up HOME, holding the shell back until the summary is confirmed", async () => {
    // Screen 1, and the server repeats the page's checks.
    const first = (await request("/")).body;
    assertHas(first, /Create your password/);
    assertHasNot(first, /Everything in the app is deleted/);
    const common = await post("/api/password/create", { password: "correcthorsebatterystaple", repeat: "correcthorsebatterystaple", understood: "yes" });
    assert.deepEqual(JSON.parse(common.body), { ok: false, error: "TOO_COMMON" });
    const unticked = await post("/api/password/create", { password: MADE_UP_PASSWORD, repeat: MADE_UP_PASSWORD });
    assert.deepEqual(JSON.parse(unticked.body), { ok: false, error: "NOT_TICKED" });

    const created = await post("/api/password/create", { password: MADE_UP_PASSWORD, repeat: MADE_UP_PASSWORD, understood: "yes" });
    assert.equal(created.status, 200);
    assert.equal(created.headers["set-cookie"]?.length, 1);
    assert.match(created.headers["set-cookie"]?.[0] ?? "", /^pf_session=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; SameSite=Strict$/);
    let cookie = cookieFrom(created);
    assert.equal(statSync(home.files.folder).mode & 0o777, 0o700);
    assert.ok(existsSync(home.files.run), "the run file is written for the wipe script");

    // 4A stops at the placeholder upload screen. No address gets past it.
    for (const path of ["/", "/?screen=shell", "/?step=summary"]) {
      const page = await request(path, { headers: { Cookie: cookie } });
      assert.equal(page.status, 200, path);
      assertHas(page.body, /Add your export/);
      assertHasNot(page.body, /Your Overview arrives/);
    }
    for (const path of ["/settings", "/settings/delete", "/upload"]) {
      const page = await request(path, { headers: { Cookie: cookie } });
      assert.ok([303, 307].includes(page.status), path);
    }
    assert.equal((await post("/api/delete", { password: MADE_UP_PASSWORD, understood: "yes" }, cookie)).status, 409);

    // Rows and saved answers, as Part 4B will save them: still no shell before the summary is confirmed.
    await advanceDatabase(home.files, MADE_UP_PASSWORD, "summary");
    assertHas((await request("/", { headers: { Cookie: cookie } })).body, /Confirm/);
    assert.ok([303, 307].includes((await request("/settings", { headers: { Cookie: cookie } })).status));
    await advanceDatabase(home.files, MADE_UP_PASSWORD, "shell");

    // Screen 7 with the placeholder Overview.
    const shell = await request("/", { headers: { Cookie: cookie } });
    assertHas(shell.body, /Your Overview arrives in the next phase\./);
    assertHas(shell.body, /Log out/);
    assertHasNot(shell.body, /\sstyle="/);
    assert.equal((await post("/api/period", { period: "last-12" }, cookie)).status, 200);
    assert.deepEqual(JSON.parse((await post("/api/period", { period: "custom", from: "2026-06-31", to: "2026-07-01" }, cookie)).body), { ok: false, error: "NOT_A_DATE" });
    assert.equal((await post("/api/period", { period: "custom", from: "2025-04-01", to: "2025-06-30" }, cookie)).status, 200);
    assertHas((await request("/", { headers: { Cookie: cookie } })).body, /1 Apr to 30 Jun 2025/);
    assert.equal((await request("/api/status", { headers: { Cookie: cookie } })).status, 200);

    // Log out: expired cookie, cache cleared, Locked screen.
    const out = await post("/api/logout", {}, cookie);
    assert.equal(out.status, 200);
    assert.equal(out.headers["clear-site-data"], '"cache"');
    assert.match(out.headers["set-cookie"]?.[0] ?? "", /^pf_session=; Path=\/; HttpOnly; SameSite=Strict; Expires=Thu, 01 Jan 1970/);
    assertHas((await request("/")).body, /You(&#x27;|')re logged out\./);

    // A wrong log in, and a planted cookie, change nothing.
    assert.deepEqual(JSON.parse((await post("/api/login", { password: "a wrong made-up phrase" })).body), { ok: false, error: "WRONG" });
    assert.equal((await request("/settings", { headers: { Cookie: "pf_session=planted" } })).status, 303);
    const login = await post("/api/login", { password: MADE_UP_PASSWORD });
    assert.deepEqual(JSON.parse(login.body), { ok: true, next: "/" });
    assert.notEqual(cookieFrom(login), cookie);
    cookie = cookieFrom(login);

    // Screen 14: a wrong password deletes nothing, then the right one deletes everything.
    assertHas((await request("/settings/delete", { headers: { Cookie: cookie } })).body, /Delete my data/);
    assert.deepEqual(JSON.parse((await post("/api/delete", { password: "a wrong made-up phrase", understood: "yes" }, cookie)).body), { ok: false, error: "WRONG" });
    assert.ok(existsSync(home.files.database));
    const deleted = await post("/api/delete", { password: MADE_UP_PASSWORD, understood: "yes" }, cookie);
    assert.deepEqual(JSON.parse(deleted.body), { ok: true });
    assert.equal(deleted.headers["clear-site-data"], '"cache"');
    for (const path of [home.files.database, home.files.salt, home.files.marker]) assert.equal(existsSync(path), false);
    const after = await request("/", { headers: { Cookie: cookie } });
    assertHas(after.body, /Everything in the app is deleted\./);
    assertHas(after.body, /Create your password/);

    // A reload during a wait still shows the countdown, with Log in switched off (Q4-3).
    const again = await post("/api/password/create", { password: MADE_UP_PASSWORD, repeat: MADE_UP_PASSWORD, understood: "yes" });
    assert.equal((await post("/api/logout", {}, cookieFrom(again))).status, 200);
    assertHasNot((await request("/")).body, /Too many tries/);
    for (let attempt = 0; attempt < 4; attempt += 1) await post("/api/login", { password: "a wrong made-up phrase" });
    const reloaded = (await request("/")).body;
    assertHas(reloaded, /Too many tries\. Try again in (<!-- -->)?\d+(<!-- -->)? seconds\./);
    assertHas(reloaded, /<button class="btn btn--primary" type="submit" disabled="">/);

    // Nothing the owner typed, and no token, reached the app's output (condition 53).
    for (const secret of [MADE_UP_PASSWORD, "a wrong made-up phrase", "correcthorsebatterystaple", cookie.split("=")[1] ?? "x"]) {
      assert.ok(!output.includes(secret), "a password or token was printed");
    }
  });
});

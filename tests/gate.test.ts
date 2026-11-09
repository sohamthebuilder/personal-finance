/**
 * The front gate's order, size limits and default-deny session check
 * (conditions 40, 49). Pure function tests, with a made-up session.
 */
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { afterEach, beforeEach, describe, it } from "node:test";
import { logIn } from "../src/lib/auth/actions.ts";
import { resetSessionStore } from "../src/lib/auth/session.ts";
import { FONT_PATH, gateRequest } from "../src/lib/security/gate.ts";
import { MADE_UP_PASSWORD, makeDatabase, type TempHome, tempHome } from "./support/app-helpers.ts";

const PORT = "3000";
const HOST = `127.0.0.1:${PORT}`;
const ORIGIN = `http://${HOST}`;

function gate(method: string, url: string, headers: Record<string, string> = {}) {
  const raw = ["Host", HOST];
  if (method !== "GET" && method !== "HEAD") raw.push("Origin", ORIGIN);
  for (const [name, value] of Object.entries(headers)) raw.push(name, value);
  return gateRequest({ method, url, rawHeaders: raw }, PORT);
}

/** Every page and route the app has, found from the files, so a new one can't be missed. */
function allRoutes(): Array<{ method: string; path: string }> {
  const found: Array<{ method: string; path: string }> = [];
  for (const file of readdirSync("src/app", { recursive: true }).map(String)) {
    const match = /^(.*?)\/?(page\.tsx|route\.ts)$/.exec(file);
    if (!match) continue;
    const path = `/${match[1]}`.replace(/\/$/, "") || "/";
    found.push({ method: match[2] === "page.tsx" ? "GET" : path === "/api/status" ? "GET" : "POST", path });
  }
  return found;
}

let home: TempHome;
beforeEach(() => {
  home = tempHome();
  resetSessionStore();
});
afterEach(() => {
  resetSessionStore();
  home.cleanup();
});

describe("gate order and size (Decisions 1 and 3)", () => {
  it("refuses a server action header before anything else", () => {
    assert.deepEqual(gate("POST", "/api/login", { "Next-Action": "abc", "Content-Length": "10" }), { pass: false, status: 403 });
    assert.deepEqual(gate("GET", "/", { "next-action": "abc" }), { pass: false, status: 403 });
  });

  it("refuses a POST with no length, and any chunked body", () => {
    assert.deepEqual(gate("POST", "/api/login"), { pass: false, status: 411 });
    assert.deepEqual(gate("POST", "/api/login", { "Transfer-Encoding": "chunked" }), { pass: false, status: 411 });
    assert.deepEqual(gate("POST", "/api/login", { "Content-Length": "10", "Transfer-Encoding": "chunked" }), { pass: false, status: 411 });
    assert.deepEqual(gate("POST", "/api/login", { "Content-Length": "1e3" }), { pass: false, status: 411 });
    assert.deepEqual(gate("POST", "/api/login", { "Content-Length": "10", "content-length": "10" }), { pass: false, status: 411 });
  });

  it("refuses an over-size body before reading it: 4 KiB for passwords, 16 KiB otherwise", () => {
    assert.deepEqual(gate("POST", "/api/login", { "Content-Length": "4096" }), { pass: true });
    assert.deepEqual(gate("POST", "/api/login", { "Content-Length": "4097" }), { pass: false, status: 413 });
    assert.deepEqual(gate("POST", "/api/password/create", { "Content-Length": "4097" }), { pass: false, status: 413 });
    assert.deepEqual(gate("POST", "/api/delete", { "Content-Length": "4097" }), { pass: false, status: 413 });
    assert.deepEqual(gate("POST", "/api/period", { "Content-Length": "16385" }), { pass: false, status: 413 });
    assert.deepEqual(gate("GET", "/", { "Content-Length": "5" }), { pass: false, status: 413 });
  });

  it("keeps the earlier checks first", () => {
    assert.deepEqual(gateRequest({ method: "GET", url: "/", rawHeaders: ["Host", "evil.example"] }, PORT), { pass: false, status: 403 });
    assert.deepEqual(gateRequest({ method: "POST", url: "/api/login", rawHeaders: ["Host", HOST, "Content-Length", "1"] }, PORT), { pass: false, status: 403 });
  });
});

describe("default-deny session gate", () => {
  it("lets through only the fixed list without a session", () => {
    assert.deepEqual(gate("GET", "/"), { pass: true });
    assert.deepEqual(gate("HEAD", "/"), { pass: true });
    assert.deepEqual(gate("GET", FONT_PATH), { pass: true });
    assert.deepEqual(gate("GET", "/_next/static/chunks/app.js"), { pass: true });
    for (const path of ["/api/password/create", "/api/login", "/api/delete/finish"]) {
      assert.deepEqual(gate("POST", path, { "Content-Length": "1" }), { pass: true }, path);
    }
  });

  it("refuses every other page and route without a session", () => {
    const open = new Set(["GET /", "POST /api/password/create", "POST /api/login", "POST /api/delete/finish"]);
    for (const { method, path } of allRoutes()) {
      if (open.has(`${method} ${path}`)) continue;
      const result = gate(method, path, method === "POST" ? { "Content-Length": "1" } : {});
      const expected = path.startsWith("/api/") || method !== "GET" ? { pass: false, status: 401 } : { pass: false, status: 303, location: "/" };
      assert.deepEqual(result, expected, `${method} ${path}`);
    }
  });

  it("matches the font path as a whole raw string, with no query or odd spelling", () => {
    for (const path of [`${FONT_PATH}?v=1`, "/fonts/google-sans-flex.woff2/", "/fonts/GOOGLE-sans-flex.woff2", "/fonts/google-sans-flex%2Ewoff2", "/fonts/../fonts/google-sans-flex.woff2", "/fonts/OFL.txt", "/fonts/", "/public/fonts/google-sans-flex.woff2"]) {
      assert.deepEqual(gate("GET", path), { pass: false, status: 303, location: "/" }, path);
    }
    assert.deepEqual(gate("POST", FONT_PATH, { "Content-Length": "1" }), { pass: false, status: 401 });
  });

  it("doesn't open static files to odd spellings", () => {
    for (const path of ["/_next/static/../../server/app.js", "/_next/static/%2e%2e/x", "/_next/static//x", "/_next/static/"]) {
      assert.equal(gate("GET", path).pass, false, path);
    }
  });

  it("refuses crafted start addresses", () => {
    for (const path of ["/?screen=shell", "/?step=summary", "/#shell", "/settings?from=login", "/upload?skip=1", "//settings"]) {
      assert.equal(gate("GET", path).pass, false, path);
    }
  });

  it("lets a valid session through, and a repeated cookie counts as none", async () => {
    await makeDatabase(home.files, "shell");
    const login = await logIn(MADE_UP_PASSWORD, home.files);
    assert.ok(login.ok);
    assert.deepEqual(gate("GET", "/settings", { Cookie: `pf_session=${login.token}` }), { pass: true });
    assert.deepEqual(gate("POST", "/api/period", { Cookie: `pf_session=${login.token}`, "Content-Length": "1" }), { pass: true });
    assert.equal(gate("GET", "/settings", { Cookie: `pf_session=${login.token}; pf_session=other` }).pass, false);
    assert.equal(gate("GET", "/settings", { Cookie: `pf_session=${login.token}`, cookie: "x=1" }).pass, false);
  });
});

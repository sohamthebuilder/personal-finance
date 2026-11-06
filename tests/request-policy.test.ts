import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  appPort,
  baselineHeaders,
  buildCsp,
  checkRawRequest,
  checkRequest,
  securityHeaders,
} from "../src/lib/security/request-policy.ts";

const PORT = "3000";
const normal = { method: "GET", host: "127.0.0.1:3000", origin: null, secFetchSite: null };

describe("checkRequest", () => {
  it("allows normal local requests", () => {
    assert.equal(checkRequest(normal, PORT).allowed, true);
    assert.equal(checkRequest({ ...normal, host: "localhost:3000" }, PORT).allowed, true);
    assert.equal(checkRequest({ ...normal, secFetchSite: "none" }, PORT).allowed, true);
    assert.equal(
      checkRequest({ ...normal, method: "POST", origin: "http://127.0.0.1:3000", secFetchSite: "same-origin" }, PORT).allowed,
      true,
    );
  });

  it("refuses unexpected hosts", () => {
    for (const host of [null, "", "evil.example", "evil.example:3000", "127.0.0.1", "127.0.0.1:3001", "[::1]:3000", "0.0.0.0:3000"]) {
      assert.equal(checkRequest({ ...normal, host }, PORT).allowed, false, `host ${host}`);
    }
  });

  it("refuses unexpected origins, even on safe methods", () => {
    for (const origin of ["http://evil.example", "null", "https://127.0.0.1:3000", "http://127.0.0.1:3001", "http://127.0.0.1:3000.evil.example"]) {
      assert.equal(checkRequest({ ...normal, origin }, PORT).allowed, false, `origin ${origin}`);
    }
  });

  it("refuses cross-site and same-site browser requests", () => {
    assert.equal(checkRequest({ ...normal, secFetchSite: "cross-site" }, PORT).allowed, false);
    assert.equal(checkRequest({ ...normal, secFetchSite: "same-site" }, PORT).allowed, false);
  });

  it("refuses state-changing requests with no origin", () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE", "post"]) {
      assert.equal(checkRequest({ ...normal, method }, PORT).allowed, false, method);
    }
  });
});

describe("checkRawRequest", () => {
  const raw = { method: "GET", url: "/", rawHeaders: ["Host", "127.0.0.1:3000"] };

  it("allows a normal request", () => {
    assert.equal(checkRawRequest(raw, PORT).allowed, true);
    assert.equal(checkRawRequest({ ...raw, url: "/foo/" }, PORT).allowed, true);
  });

  it("refuses methods the app doesn't use", () => {
    for (const method of ["TRACE", "CONNECT", "TRACK", ""]) {
      assert.equal(checkRawRequest({ ...raw, method }, PORT).allowed, false, method);
    }
  });

  it("refuses anything but a plain path", () => {
    for (const url of ["http://evil.example/", "*", "//evil.example/", "/\\evil.example/", ""]) {
      assert.equal(checkRawRequest({ ...raw, url }, PORT).allowed, false, url);
    }
  });

  it("refuses duplicate headers, whichever comes first", () => {
    for (const rawHeaders of [
      ["Host", "127.0.0.1:3000", "Host", "evil.example"],
      ["host", "evil.example", "HOST", "127.0.0.1:3000"],
      ["Host", "127.0.0.1:3000", "Origin", "http://127.0.0.1:3000", "Origin", "http://evil.example"],
    ]) {
      assert.equal(checkRawRequest({ ...raw, rawHeaders }, PORT).allowed, false);
    }
  });

  it("applies the normal request checks", () => {
    assert.equal(checkRawRequest({ ...raw, rawHeaders: [] }, PORT).allowed, false);
    assert.equal(checkRawRequest({ ...raw, rawHeaders: ["Host", "evil.example"] }, PORT).allowed, false);
    assert.equal(checkRawRequest({ ...raw, method: "POST" }, PORT).allowed, false);
  });
});

describe("baselineHeaders", () => {
  it("has a policy that allows nothing, and no caching", () => {
    const headers = baselineHeaders();
    assert.match(headers["Content-Security-Policy"] as string, /^default-src 'none'/);
    assert.equal(headers["Cache-Control"], "no-store");
  });
});

describe("appPort", () => {
  it("uses 3000 unless a valid port is set", () => {
    assert.equal(appPort({}), "3000");
    assert.equal(appPort({ APP_PORT: "3456" }), "3456");
    assert.equal(appPort({ APP_PORT: "3000, evil.example" }), "3000");
  });
});

describe("buildCsp", () => {
  const production = buildCsp("abc", { dev: false, port: PORT });

  it("has no unsafe sources in production", () => {
    assert.doesNotMatch(production, /unsafe-inline|unsafe-eval/);
  });

  it("locks down the defaults", () => {
    for (const directive of ["default-src 'none'", "base-uri 'none'", "object-src 'none'", "frame-ancestors 'none'", "form-action 'self'"]) {
      assert.ok(production.includes(directive), directive);
    }
    assert.ok(production.includes("'nonce-abc'"));
  });

  it("allows no remote hosts", () => {
    assert.doesNotMatch(production, /https?:|\*/);
  });
});

describe("securityHeaders", () => {
  it("includes the baseline headers", () => {
    const headers = securityHeaders("policy");
    assert.equal(headers["Content-Security-Policy"], "policy");
    assert.equal(headers["X-Content-Type-Options"], "nosniff");
    assert.equal(headers["X-Frame-Options"], "DENY");
    assert.equal(headers["Referrer-Policy"], "no-referrer");
  });
});

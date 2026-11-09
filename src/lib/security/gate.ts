/**
 * The front gate's full order (Decision 3), run in server.ts before Next.js
 * sees a request: the existing checks, then server actions, then size, then
 * the session. Default-deny: without a session only a short fixed list passes.
 */
import { sessionFor, tokenFromCookieHeader } from "../auth/session.ts";
import { checkRawRequest, type RawRequestFacts } from "./request-policy.ts";

/** The one font path that loads before log in, matched as a whole raw string. */
export const FONT_PATH = "/fonts/google-sans-flex.woff2";

/** Routes that take a password: 4 KiB. Every other route: 16 KiB. */
export const PASSWORD_BODY_LIMIT = 4 * 1024;
export const ROUTE_BODY_LIMIT = 16 * 1024;
const PASSWORD_ROUTES = new Set(["/api/password/create", "/api/login", "/api/delete"]);

/** The only POST routes that work without a session. */
const OPEN_POSTS = new Set(["/api/password/create", "/api/login", "/api/delete/finish"]);
/** Checked without counting as use (Decision 4). */
export const STATUS_PATH = "/api/status";

const BODY_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const READ_METHODS = new Set(["GET", "HEAD"]);

export type GateResult =
  | { pass: true }
  | { pass: false; status: 401 | 403 | 411 | 413; location?: undefined }
  | { pass: false; status: 303; location: "/" };

function headerValues(rawHeaders: string[], name: string): string[] {
  const values: string[] = [];
  for (let index = 0; index + 1 < rawHeaders.length; index += 2) {
    if (rawHeaders[index]?.toLowerCase() === name) values.push(rawHeaders[index + 1] ?? "");
  }
  return values;
}

export function bodyLimit(path: string): number {
  return PASSWORD_ROUTES.has(path) ? PASSWORD_BODY_LIMIT : ROUTE_BODY_LIMIT;
}

function isStaticPath(path: string): boolean {
  return /^\/_next\/static\/[A-Za-z0-9_\-.~/]+$/.test(path) && !path.includes("..") && !path.includes("//");
}

function isOpenRequest(method: string, path: string): boolean {
  if (READ_METHODS.has(method)) return path === "/" || path === FONT_PATH || isStaticPath(path);
  return method === "POST" && OPEN_POSTS.has(path);
}

export function gateRequest(request: RawRequestFacts, port: string): GateResult {
  if (!checkRawRequest(request, port).allowed) return { pass: false, status: 403 };

  // No server actions: one could be called through any page's address (S4-1).
  if (headerValues(request.rawHeaders, "next-action").length > 0) return { pass: false, status: 403 };

  // Size, before a byte of the body is read.
  const path = request.url;
  const lengths = headerValues(request.rawHeaders, "content-length");
  if (headerValues(request.rawHeaders, "transfer-encoding").length > 0) return { pass: false, status: 411 };
  if (BODY_METHODS.has(request.method)) {
    const length = lengths[0];
    if (lengths.length !== 1 || length === undefined || !/^\d{1,9}$/.test(length)) return { pass: false, status: 411 };
    if (Number(length) > bodyLimit(path)) return { pass: false, status: 413 };
  } else if (lengths.length > 1 || (lengths[0] !== undefined && lengths[0] !== "0")) {
    return { pass: false, status: 413 };
  }

  // Session last. A repeated Cookie header counts as no cookie.
  const cookies = headerValues(request.rawHeaders, "cookie");
  const token = cookies.length === 1 ? tokenFromCookieHeader(cookies[0]) : null;
  const background = path === STATUS_PATH || path === FONT_PATH || isStaticPath(path);
  if (sessionFor(token, { touch: !background }) !== null) return { pass: true };
  if (isOpenRequest(request.method, path)) return { pass: true };
  if (READ_METHODS.has(request.method) && !path.startsWith("/api/")) return { pass: false, status: 303, location: "/" };
  return { pass: false, status: 401 };
}

/**
 * Shared pieces for the API routes. Each route repeats the session and size
 * checks the front gate already made, because `next dev` has no front gate.
 */
import { bodyLimit } from "../security/gate.ts";
import { sessionFor, tokenFromCookieHeader, type Unlocked } from "../auth/session.ts";

export function tokenOf(request: Request): string | null {
  return tokenFromCookieHeader(request.headers.get("cookie"));
}

/** The live session, or null. Every route that needs one calls this. */
export function requireSession(request: Request, options: { touch: boolean } = { touch: true }): Unlocked | null {
  return sessionFor(tokenOf(request), options);
}

/**
 * Reads a small form body, counting bytes as they arrive, so the limit holds
 * even if a length header lied. Null for anything else.
 */
export async function readForm(request: Request): Promise<URLSearchParams | null> {
  const type = request.headers.get("content-type") ?? "";
  if (!/^application\/x-www-form-urlencoded(;|$)/i.test(type)) return null;
  const limit = bodyLimit(new URL(request.url).pathname);
  const declared = request.headers.get("content-length");
  if (declared === null || !/^\d{1,9}$/.test(declared) || Number(declared) > limit) return null;
  if (!request.body) return new URLSearchParams();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(Buffer.concat(chunks));
  return new URLSearchParams(text);
}

/**
 * Reads an uploaded file as the raw body (Decision 10): no form parser touches
 * it. The size limit applies to the declared length before a byte is read, and
 * again as bytes arrive. Null for anything else. The bytes sit in a buffer of
 * their own, so they can be handed to the reader's worker.
 */
export async function readFileBody(request: Request): Promise<Uint8Array | "TOO_LARGE" | null> {
  const type = request.headers.get("content-type") ?? "";
  if (!/^application\/octet-stream$/i.test(type)) return null;
  const limit = bodyLimit(new URL(request.url).pathname);
  const declared = request.headers.get("content-length");
  if (declared === null || !/^\d{1,9}$/.test(declared)) return null;
  if (Number(declared) > limit) return "TOO_LARGE";
  const bytes = new Uint8Array(Number(declared));
  if (!request.body) return bytes;

  const reader = request.body.getReader();
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (total + value.byteLength > bytes.byteLength) {
      await reader.cancel();
      return total + value.byteLength > limit ? "TOO_LARGE" : null;
    }
    bytes.set(value, total);
    total += value.byteLength;
  }
  return total === bytes.byteLength ? bytes : null;
}

/** One value of a field, or "" if it's missing or repeated. */
export function field(form: URLSearchParams, name: string): string {
  const values = form.getAll(name);
  return values.length === 1 ? (values[0] ?? "") : "";
}

const NO_STORE = { "Cache-Control": "no-store" };

export function reply(body: Record<string, unknown>, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { ...NO_STORE, ...headers } });
}

/** A form sent by the browser itself, before the page's script took over, goes back to the start screen. */
export function isPageNavigation(request: Request): boolean {
  return request.headers.get("sec-fetch-mode") === "navigate";
}

export function backToStart(headers: Record<string, string> = {}): Response {
  return new Response(null, { status: 303, headers: { ...NO_STORE, Location: "/", ...headers } });
}

/** Sent with every lock and log out, so Back can't bring a page from the cache (S4-10). */
export const CLEAR_CACHE = { "Clear-Site-Data": '"cache"' };

/**
 * The frame every small change route shares: a live session, a small form
 * body, and one error boundary. A caught error is never logged or sent.
 */
export async function withSessionForm(
  request: Request,
  handle: (session: Unlocked, form: URLSearchParams) => Response | Promise<Response>,
): Promise<Response> {
  try {
    const session = requireSession(request);
    if (session === null) return reply({ ok: false, error: "LOCKED" }, 401);
    const form = await readForm(request);
    if (form === null) return reply({ ok: false, error: "BAD_REQUEST" }, 400);
    return await handle(session, form);
  } catch {
    return reply({ ok: false, error: "FAILED" }, 500);
  }
}

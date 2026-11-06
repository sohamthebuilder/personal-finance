/**
 * Decides whether a request may reach the app, and which headers every
 * response carries. Pure functions, so they can be tested without a server.
 */

const DEFAULT_PORT = "3000";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const ALLOWED_METHODS = new Set([...SAFE_METHODS, "POST", "PUT", "PATCH", "DELETE"]);
const FALLBACK_CSP = "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const ALLOWED_FETCH_SITES = new Set(["same-origin", "none"]);

export function appPort(env: Record<string, string | undefined> = process.env): string {
  const port = env.APP_PORT;
  return port && /^\d{1,5}$/.test(port) ? port : DEFAULT_PORT;
}

function allowedHosts(port: string): Set<string> {
  return new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
}

function allowedOrigins(port: string): Set<string> {
  return new Set([...allowedHosts(port)].map((host) => `http://${host}`));
}

export interface RequestFacts {
  method: string;
  host: string | null;
  origin: string | null;
  secFetchSite: string | null;
}

export type Decision = { allowed: true } | { allowed: false; reason: string };

export function checkRequest(request: RequestFacts, port: string): Decision {
  const host = request.host?.toLowerCase() ?? null;
  if (!host || !allowedHosts(port).has(host)) {
    return { allowed: false, reason: "unexpected host" };
  }

  // Origin is compared exactly, so "null" and any other site are refused.
  if (request.origin !== null && !allowedOrigins(port).has(request.origin.toLowerCase())) {
    return { allowed: false, reason: "unexpected origin" };
  }

  if (request.secFetchSite !== null && !ALLOWED_FETCH_SITES.has(request.secFetchSite)) {
    return { allowed: false, reason: "cross-site request" };
  }

  // Browsers always send Origin on these methods, so a missing one is not a
  // normal page making a request.
  if (!SAFE_METHODS.has(request.method.toUpperCase()) && request.origin === null) {
    return { allowed: false, reason: "missing origin" };
  }

  return { allowed: true };
}

export interface RawRequestFacts {
  method: string;
  url: string;
  rawHeaders: string[];
}

function headerValues(rawHeaders: string[], name: string): string[] {
  const values: string[] = [];
  for (let index = 0; index + 1 < rawHeaders.length; index += 2) {
    if (rawHeaders[index]?.toLowerCase() === name) values.push(rawHeaders[index + 1] ?? "");
  }
  return values;
}

/** The front gate. Adds the checks that need the request as it arrived on the wire. */
export function checkRawRequest(request: RawRequestFacts, port: string): Decision {
  if (!ALLOWED_METHODS.has(request.method)) {
    return { allowed: false, reason: "method not allowed" };
  }

  // Only plain paths. This refuses absolute URLs, "*" and "//host" style paths.
  if (!request.url.startsWith("/") || /^\/[/\\]/.test(request.url)) {
    return { allowed: false, reason: "unexpected request target" };
  }

  const hosts = headerValues(request.rawHeaders, "host");
  const origins = headerValues(request.rawHeaders, "origin");
  const fetchSites = headerValues(request.rawHeaders, "sec-fetch-site");
  if (hosts.length > 1 || origins.length > 1 || fetchSites.length > 1) {
    return { allowed: false, reason: "duplicate header" };
  }

  return checkRequest(
    {
      method: request.method,
      host: hosts[0] ?? null,
      origin: origins[0] ?? null,
      secFetchSite: fetchSites[0] ?? null,
    },
    port,
  );
}

export function buildCsp(nonce: string, options: { dev: boolean; port: string }): string {
  const { dev, port } = options;
  // The development server needs eval and a websocket for hot reload.
  const scriptSrc = dev
    ? `'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval'`
    : `'self' 'nonce-${nonce}' 'strict-dynamic'`;
  const styleSrc = dev ? "'self' 'unsafe-inline'" : `'self' 'nonce-${nonce}'`;
  const connectSrc = dev ? `'self' ws://127.0.0.1:${port} ws://localhost:${port}` : "'self'";

  return [
    "default-src 'none'",
    `script-src ${scriptSrc}`,
    `style-src ${styleSrc}`,
    "img-src 'self'",
    "font-src 'self'",
    `connect-src ${connectSrc}`,
    "manifest-src 'self'",
    "form-action 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
}

export function securityHeaders(csp: string): Record<string, string> {
  return {
    "Content-Security-Policy": csp,
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
  };
}

/** Set by the front gate on every response. src/proxy.ts replaces the policy on pages. */
export function baselineHeaders(): Record<string, string> {
  return { ...securityHeaders(FALLBACK_CSP), "Cache-Control": "no-store" };
}

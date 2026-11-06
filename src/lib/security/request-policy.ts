/**
 * Decides whether a request may reach the app, and which headers every
 * response carries. Pure functions, so they can be tested without a server.
 */

const DEFAULT_PORT = "3000";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
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

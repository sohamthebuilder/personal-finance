import { NextResponse, type NextRequest } from "next/server";
import { appPort, buildCsp, checkRequest, securityHeaders } from "./lib/security/request-policy";

/**
 * Sets the per-request policy, and repeats the request checks for `next dev`.
 * Next.js answers some requests before this runs, so in production server.ts
 * is the first gate. Don't rely on this file alone for a security check.
 */
export function proxy(request: NextRequest): NextResponse {
  const port = appPort();
  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64");
  const csp = buildCsp(nonce, { dev: process.env.NODE_ENV === "development", port });
  const headers = securityHeaders(csp);

  const decision = checkRequest(
    {
      method: request.method,
      host: request.headers.get("host"),
      origin: request.headers.get("origin"),
      secFetchSite: request.headers.get("sec-fetch-site"),
    },
    port,
  );

  if (!decision.allowed) {
    return new NextResponse("Forbidden", {
      status: 403,
      headers: { ...headers, "Cache-Control": "no-store", "Content-Type": "text/plain" },
    });
  }

  // Next.js reads the nonce from the request's policy header and adds it to
  // its own scripts. Both values are overwritten, so a client can't supply them.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  for (const [name, value] of Object.entries(headers)) {
    response.headers.set(name, value);
  }
  if (!request.nextUrl.pathname.startsWith("/_next/static/")) {
    response.headers.set("Cache-Control", "no-store");
  }
  return response;
}

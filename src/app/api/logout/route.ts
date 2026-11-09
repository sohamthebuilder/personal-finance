import { logOut } from "../../../lib/auth/actions.ts";
import { expiredCookie } from "../../../lib/auth/session.ts";
import { CLEAR_CACHE, reply, requireSession } from "../../../lib/http/route-helpers.ts";

export const dynamic = "force-dynamic";

/** Locks at once. With no session there's nothing to lock, which the page also counts as logged out. */
export async function POST(request: Request): Promise<Response> {
  const headers = { ...CLEAR_CACHE, "Set-Cookie": expiredCookie() };
  try {
    if (requireSession(request) === null) return reply({ ok: false }, 401, headers);
    await logOut();
    return reply({ ok: true }, 200, headers);
  } catch {
    return reply({ ok: false }, 500, headers);
  }
}

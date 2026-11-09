import { logIn } from "../../../lib/auth/actions.ts";
import { sessionCookie } from "../../../lib/auth/session.ts";
import { appFiles } from "../../../lib/auth/start-screen.ts";
import { backToStart, field, isPageNavigation, readForm, reply } from "../../../lib/http/route-helpers.ts";

export const dynamic = "force-dynamic";

/** Screens 2 and 3. The return screen comes from the server's fixed list. */
export async function POST(request: Request): Promise<Response> {
  try {
    const form = await readForm(request);
    const files = appFiles();
    if (form === null || files === null) return reply({ ok: false, error: "CANT_OPEN" }, 400);
    const result = await logIn(field(form, "password"), files);
    if (!result.ok) {
      if (isPageNavigation(request)) return backToStart();
      return reply({ ok: false, error: result.error, seconds: result.error === "WAIT" ? result.seconds : undefined }, 400);
    }
    const cookie = { "Set-Cookie": sessionCookie(result.token) };
    return isPageNavigation(request) ? backToStart(cookie) : reply({ ok: true, next: result.next }, 200, cookie);
  } catch {
    return reply({ ok: false, error: "CANT_OPEN" }, 500);
  }
}

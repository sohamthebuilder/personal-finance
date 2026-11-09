import { createPassword } from "../../../../lib/auth/actions.ts";
import { sessionCookie } from "../../../../lib/auth/session.ts";
import { appFiles } from "../../../../lib/auth/start-screen.ts";
import { backToStart, field, isPageNavigation, readForm, reply } from "../../../../lib/http/route-helpers.ts";

export const dynamic = "force-dynamic";

/** Screen 1. Works with no session, only while there's no database, salt or marker. */
export async function POST(request: Request): Promise<Response> {
  try {
    const form = await readForm(request);
    const files = appFiles();
    if (form === null || files === null) return reply({ ok: false, error: "SAVE_FAILED" }, 400);
    const result = await createPassword(
      { password: field(form, "password"), repeat: field(form, "repeat"), confirmed: field(form, "understood") === "yes" },
      files,
    );
    if (!result.ok) return isPageNavigation(request) ? backToStart() : reply({ ok: false, error: result.error }, 400);
    const cookie = { "Set-Cookie": sessionCookie(result.token) };
    return isPageNavigation(request) ? backToStart(cookie) : reply({ ok: true }, 200, cookie);
  } catch {
    return reply({ ok: false, error: "SAVE_FAILED" }, 500);
  }
}

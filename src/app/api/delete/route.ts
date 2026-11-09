import { deleteMyData } from "../../../lib/auth/actions.ts";
import { expiredCookie } from "../../../lib/auth/session.ts";
import { appFiles, startScreen } from "../../../lib/auth/start-screen.ts";
import { CLEAR_CACHE, field, readForm, reply, requireSession, tokenOf } from "../../../lib/http/route-helpers.ts";

export const dynamic = "force-dynamic";

/** Screen 14. Needs a session, the password and the tick. */
export async function POST(request: Request): Promise<Response> {
  const ended = { ...CLEAR_CACHE, "Set-Cookie": expiredCookie() };
  try {
    if (requireSession(request) === null) return reply({ ok: false, error: "LOCKED" }, 401, ended);
    const files = appFiles();
    if (files === null || startScreen(tokenOf(request), files).screen !== "shell") return reply({ ok: false, stage: "before" }, 409);
    const form = await readForm(request);
    if (form === null) return reply({ ok: false, stage: "before" }, 400);
    const result = await deleteMyData(field(form, "password"), field(form, "understood") === "yes", files);
    if (result.ok) return reply({ ok: true }, 200, ended);
    if ("stage" in result) return reply({ ok: false, stage: result.stage }, 500, result.stage === "after" ? ended : {});
    if (result.error === "LOCKED") return reply({ ok: false, error: "LOCKED" }, 401, ended);
    return reply({ ok: false, error: result.error, seconds: result.error === "WAIT" ? result.seconds : undefined }, 400);
  } catch {
    return reply({ ok: false, stage: "before" }, 500);
  }
}

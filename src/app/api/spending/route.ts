import { field, reply, withSessionForm } from "../../../lib/http/route-helpers.ts";
import { serverToday } from "../../../lib/period.ts";
import { PAGE_SIZE, readPath, spendingFor, TOP, UnknownGroup } from "../../../lib/spending/spending.ts";

export const dynamic = "force-dynamic";

/**
 * Screen 10, one level at a time, for the session's period. The level comes in
 * the request body, never the web address. Behind the same gate and session
 * check as every route: locked, it answers 401 and no figures.
 */
export async function POST(request: Request): Promise<Response> {
  return withSessionForm(request, (session, form) => {
    let path = readPath(form);
    if (path === null) return reply({ ok: false, error: "BAD_REQUEST" }, 400);
    // The Overview's link to a category is used once, on the first load after it (AC-13).
    if (field(form, "start") === "1") {
      const open = session.spendingOpen;
      session.spendingOpen = null;
      path = typeof open === "string" ? { ...TOP, category: open } : TOP;
    }
    const shown = Number(field(form, "shown") || PAGE_SIZE);
    if (!Number.isFinite(shown)) return reply({ ok: false, error: "BAD_REQUEST" }, 400);
    try {
      const answer = spendingFor(session.db, session.period, path, serverToday(), shown);
      return reply({
        ok: true,
        spending: answer.spending,
        path: answer.path,
        version: answer.version,
        oldUpload: session.oldNoteDismissed === true ? null : answer.oldUpload,
      });
    } catch (error) {
      // A group that's gone (Setup changed in another window) goes back to the top.
      if (error instanceof UnknownGroup) return reply({ ok: false, error: "GONE" }, 409);
      throw error;
    }
  });
}

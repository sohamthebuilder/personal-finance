import { sessionStore } from "../../../lib/auth/session.ts";
import { reply, withSessionForm } from "../../../lib/http/route-helpers.ts";
import { overviewFor } from "../../../lib/overview/overview.ts";
import { serverToday } from "../../../lib/period.ts";

export const dynamic = "force-dynamic";

/**
 * Screen 9's figures for the session's period. Behind the same gate and
 * session check as every route (AC-17): locked, it answers 401 and no figures.
 */
export async function POST(request: Request): Promise<Response> {
  return withSessionForm(request, (session) => {
    const answer = overviewFor(session.db, session.period, serverToday());
    const store = sessionStore();
    // The roll-up from zero happens once, on the first visit after the first upload (AC-13).
    const rollUp = answer.justImported && !store.rolledUp;
    if (answer.justImported) store.rolledUp = true;
    return reply({
      ok: true,
      overview: answer.overview,
      version: answer.version,
      oldUpload: session.oldNoteDismissed === true ? null : answer.oldUpload,
      rollUp,
    });
  });
}

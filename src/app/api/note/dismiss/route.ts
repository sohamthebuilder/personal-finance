import { changeFor } from "../../../../lib/auth/session.ts";
import { dismissNote } from "../../../../lib/data/state.ts";
import { reply, withSessionForm } from "../../../../lib/http/route-helpers.ts";

export const dynamic = "force-dynamic";

/** Dismisses the note left by an import, an update or an undo. Undo itself stays in Settings. */
export async function POST(request: Request): Promise<Response> {
  return withSessionForm(request, async (session) => {
    const done = await changeFor(session, (db) => {
      dismissNote(db);
      return true;
    });
    return done === null ? reply({ ok: false, error: "LOCKED" }, 401) : reply({ ok: true });
  });
}

import { changeFor } from "../../../lib/auth/session.ts";
import { readVersion } from "../../../lib/data/state.ts";
import { undoUpdate } from "../../../lib/data/update.ts";
import { field, reply, withSessionForm } from "../../../lib/http/route-helpers.ts";

export const dynamic = "force-dynamic";

/** "Undo update": brings back the rows and setup answers from before the last update. */
export async function POST(request: Request): Promise<Response> {
  return withSessionForm(request, async (session, form) => {
    const version = readVersion(field(form, "version"));
    const result = await changeFor(session, (db) => undoUpdate(db, version));
    if (result === null) return reply({ ok: false, error: "LOCKED" }, 401);
    if (result.ok) {
      session.pending = null;
      return reply({ ok: true });
    }
    return reply({ ok: false, error: result.code }, result.code === "SAVE_FAILED" ? 500 : 409);
  });
}

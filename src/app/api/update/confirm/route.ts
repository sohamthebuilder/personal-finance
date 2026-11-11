import { changeFor } from "../../../../lib/auth/session.ts";
import { readVersion } from "../../../../lib/data/state.ts";
import { replaceData } from "../../../../lib/data/update.ts";
import { field, reply, withSessionForm } from "../../../../lib/http/route-helpers.ts";
import { serverToday } from "../../../../lib/period.ts";

export const dynamic = "force-dynamic";

function readList(text: string): string[] | null {
  try {
    const value: unknown = JSON.parse(text);
    return Array.isArray(value) && value.every((item) => typeof item === "string") ? (value as string[]) : null;
  } catch {
    return null;
  }
}

/** Screen 8: "Replace my data". The server checks the tick, the data version and the answers itself. */
export async function POST(request: Request): Promise<Response> {
  return withSessionForm(request, async (session, form) => {
    const pending = session.pending;
    if (pending === null) return reply({ ok: false, error: "NO_REVIEW" }, 409);
    const groups = readList(field(form, "groups"));
    if (groups === null) return reply({ ok: false, error: "BAD_ANSWERS" }, 400);
    const choices = { version: readVersion(field(form, "version")), ticked: field(form, "ticked") === "yes", groups };
    const result = await changeFor(session, (db) => replaceData(db, pending, choices, serverToday()));
    if (result === null) return reply({ ok: false, error: "LOCKED" }, 401);
    if (result.ok) {
      session.pending = null;
      return reply({ ok: true });
    }
    // A stale review is thrown away: the owner uploads the file again (design, screen 8).
    if (result.code === "STALE") session.pending = null;
    return reply({ ok: false, error: result.code }, result.code === "SAVE_FAILED" ? 500 : 409);
  });
}

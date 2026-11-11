import { changeFor } from "../../../lib/auth/session.ts";
import { readVersion } from "../../../lib/data/state.ts";
import { saveSetupAnswers } from "../../../lib/data/update.ts";
import { field, reply, withSessionForm } from "../../../lib/http/route-helpers.ts";
import type { SetupAnswers } from "../../../lib/setup/setup.ts";

export const dynamic = "force-dynamic";

function readAnswers(text: string): SetupAnswers | null {
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === "object" && value !== null ? (value as SetupAnswers) : null;
  } catch {
    return null;
  }
}

/**
 * Screens 5 and 13: save setup. A live session, the 16 KiB form limit, the data
 * version and every limit on groups are checked here and in `saveSetupAnswers`,
 * whatever the page did. Refusals are fixed codes only.
 */
export async function POST(request: Request): Promise<Response> {
  return withSessionForm(request, async (session, form) => {
    const answers = readAnswers(field(form, "answers"));
    if (answers === null) return reply({ ok: false, error: "BAD_ANSWERS" }, 400);
    const version = readVersion(field(form, "version"));
    const result = await changeFor(session, (db) => saveSetupAnswers(db, answers, version));
    if (result === null) return reply({ ok: false, error: "LOCKED" }, 401);
    if (result.ok) return reply({ ok: true, version: result.version });
    const status = result.code === "SAVE_FAILED" ? 500 : result.code === "STALE" || result.code === "NO_DATA" ? 409 : 400;
    return reply({ ok: false, error: result.code }, status);
  });
}

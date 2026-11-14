import { dataVersion } from "../../../lib/data/state.ts";
import { reply, requireSession } from "../../../lib/http/route-helpers.ts";

export const dynamic = "force-dynamic";

/**
 * Asked on focus, wake and by the page's timer. Never counts as use (Decision 4).
 * The data version lets a screen see a change made in another window.
 */
export function GET(request: Request): Response {
  const session = requireSession(request, { touch: false });
  if (session === null) return reply({ ok: false }, 401);
  let version: number | null = null;
  try {
    version = dataVersion(session.db);
  } catch {
    // The screen just can't tell this time.
  }
  return reply({ ok: true, version });
}

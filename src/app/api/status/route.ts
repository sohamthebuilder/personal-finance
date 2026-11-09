import { reply, requireSession } from "../../../lib/http/route-helpers.ts";

export const dynamic = "force-dynamic";

/** Asked on focus, wake and by the page's timer. Never counts as use (Decision 4). */
export function GET(request: Request): Response {
  return requireSession(request, { touch: false }) === null ? reply({ ok: false }, 401) : reply({ ok: true });
}

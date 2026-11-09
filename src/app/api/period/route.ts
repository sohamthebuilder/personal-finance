import { readPeriod, serverToday } from "../../../lib/period.ts";
import { field, readForm, reply, requireSession } from "../../../lib/http/route-helpers.ts";

export const dynamic = "force-dynamic";

/** Sets the period for this session. It lasts until log out or lock. */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = requireSession(request);
    if (session === null) return reply({ ok: false }, 401);
    const form = await readForm(request);
    if (form === null) return reply({ ok: false, error: "BAD_CHOICE" }, 400);
    const result = readPeriod({ period: field(form, "period"), from: field(form, "from"), to: field(form, "to") }, serverToday());
    if (!result.ok) return reply({ ok: false, error: result.error }, 400);
    session.period = result.period;
    return reply({ ok: true });
  } catch {
    return reply({ ok: false, error: "BAD_CHOICE" }, 500);
  }
}

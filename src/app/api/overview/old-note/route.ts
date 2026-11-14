import { reply, withSessionForm } from "../../../../lib/http/route-helpers.ts";

export const dynamic = "force-dynamic";

/** Dismisses the old-upload note until the next log in. Kept in memory only. */
export async function POST(request: Request): Promise<Response> {
  return withSessionForm(request, (session) => {
    session.oldNoteDismissed = true;
    return reply({ ok: true });
  });
}

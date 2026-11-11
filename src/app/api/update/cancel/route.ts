import { reply, withSessionForm } from "../../../../lib/http/route-helpers.ts";

export const dynamic = "force-dynamic";

/** Screen 8: Cancel. The waiting file is thrown away and nothing changes. */
export async function POST(request: Request): Promise<Response> {
  return withSessionForm(request, (session) => {
    session.pending = null;
    return reply({ ok: true });
  });
}

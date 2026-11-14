import { field, reply, withSessionForm } from "../../../../lib/http/route-helpers.ts";

export const dynamic = "force-dynamic";

/** The Overview's top category link: Spending opens at that category next (AC-13). Kept in memory only. */
export async function POST(request: Request): Promise<Response> {
  return withSessionForm(request, (session, form) => {
    const category = field(form, "category");
    if (!form.has("category") || category.length > 500) return reply({ ok: false, error: "BAD_REQUEST" }, 400);
    session.spendingOpen = category;
    return reply({ ok: true });
  });
}

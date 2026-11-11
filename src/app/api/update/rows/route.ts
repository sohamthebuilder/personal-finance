import { REVIEW_LISTS, type ReviewList } from "../../../../lib/data/update.ts";
import { field, reply, withSessionForm } from "../../../../lib/http/route-helpers.ts";

export const dynamic = "force-dynamic";

const PAGE = 50;

/** Screen 8: the next 50 rows of one list in the review. They are shown as plain text only. */
export async function POST(request: Request): Promise<Response> {
  return withSessionForm(request, (session, form) => {
    const list = field(form, "list");
    const offset = field(form, "offset");
    if (session.pending === null) return reply({ ok: false, error: "NO_REVIEW" }, 409);
    if (!(REVIEW_LISTS as readonly string[]).includes(list) || !/^[0-9]{1,7}$/.test(offset)) return reply({ ok: false, error: "BAD_REQUEST" }, 400);
    const start = Number(offset);
    return reply({ ok: true, rows: session.pending.review.lists[list as ReviewList].slice(start, start + PAGE) });
  });
}

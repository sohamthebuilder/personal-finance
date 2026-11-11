import { type UploadRefusal, updateUpload } from "../../../../lib/import/upload.ts";
import { readFileBody, reply, requireSession } from "../../../../lib/http/route-helpers.ts";
import { serverToday } from "../../../../lib/period.ts";

export const dynamic = "force-dynamic";

const STATUS: Partial<Record<UploadRefusal["code"], number>> = { BUSY: 409, LOCKED: 401, WRONG_STEP: 409, INTERNAL_ERROR: 500 };

/** Screen 8, stage 1: a newer export. Nothing changes until the owner confirms the review. */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = requireSession(request);
    if (session === null) return reply({ ok: false, code: "LOCKED" }, 401);
    const bytes = await readFileBody(request);
    if (bytes === "TOO_LARGE") return reply({ ok: false, code: "FILE_TOO_LARGE" }, 413);
    if (bytes === null) return reply({ ok: false, code: "INTERNAL_ERROR" }, 400);
    const result = await updateUpload(session, bytes, serverToday());
    if (result.ok) return reply({ ok: true, same: result.same });
    return reply({ ok: false, code: result.code, rows: result.rows, rowCount: result.rowCount }, STATUS[result.code] ?? 400);
  } catch {
    return reply({ ok: false, code: "INTERNAL_ERROR" }, 500);
  }
}

import { finishDelete } from "../../../../lib/auth/delete-data.ts";
import { appFiles, startScreen } from "../../../../lib/auth/start-screen.ts";
import { reply } from "../../../../lib/http/route-helpers.ts";

export const dynamic = "force-dynamic";

/** Finishes a delete that was cut short. Does nothing unless the marker is there. Never needs the password. */
export async function POST(): Promise<Response> {
  try {
    const files = appFiles();
    if (files === null || startScreen(null, files).screen !== "finish-delete") return reply({ ok: false }, 409);
    return finishDelete(files) ? reply({ ok: true }) : reply({ ok: false }, 500);
  } catch {
    return reply({ ok: false }, 500);
  }
}

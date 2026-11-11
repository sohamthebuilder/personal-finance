import { redirect } from "next/navigation";
import { sessionFor, sessionStore } from "../../lib/auth/session.ts";
import type { ReviewList } from "../../lib/data/update.ts";
import { pageToken } from "../ui/server-state.ts";
import { Shell } from "../ui/shell.tsx";
import { requireShell } from "../ui/shell-page.ts";
import { UpdateReview } from "../ui/update-review.tsx";
import { UploadDrop } from "../ui/upload-drop.tsx";

/** Screen 8. Stage 1 chooses the file; stage 2 shows the review the server is holding for this session. */
export default async function UploadPage() {
  const data = await requireShell("/upload");
  const session = sessionFor(await pageToken(), { touch: false });
  if (session === null) redirect("/");
  const pending = session.pending;

  if (pending === null) {
    // Said once, after a lock threw away a file waiting for a yes.
    const store = sessionStore();
    const lost = store.lostUpload;
    store.lostUpload = false;
    return (
      <Shell screen="upload" title="Update your data" {...data}>
        <div className="task__body enter">
          <h2 className="only-narrow mb-4">Update your data</h2>
          <p className="task__lede">
            A new export replaces everything here, so edits and deletions from your phone come through too. You&apos;ll check the changes first.
          </p>
          <UploadDrop mode="update" lost={lost} />
        </div>
      </Shell>
    );
  }

  // Only the first 10 rows of each list go with the page. Names are sent as text and drawn as text.
  const first = (list: ReviewList) => pending.review.lists[list].slice(0, 10);
  const page = {
    version: pending.version,
    review: { ...pending.review, lists: { added: first("added"), changed: first("changed"), removed: first("removed") } },
  };
  return (
    <Shell screen="upload" title="Check the changes" {...data}>
      <UpdateReview page={page} />
    </Shell>
  );
}

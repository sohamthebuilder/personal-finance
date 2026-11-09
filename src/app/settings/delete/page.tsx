import { DeleteForm } from "../../ui/delete-form.tsx";
import { Shell } from "../../ui/shell.tsx";
import { requireShell } from "../../ui/shell-page.ts";

/** Screen 14: a full page, not a dialog, so it can't be confirmed by accident. */
export default async function DeletePage() {
  const data = await requireShell("/settings/delete");
  return (
    <Shell screen="settings" {...data}>
      <div className="task__body enter">
        <h1 tabIndex={-1} id="title">
          Delete my data
        </h1>
        <p className="task__lede">This can&apos;t be undone. The app keeps no copy to go back to.</p>
        <DeleteForm />
      </div>
    </Shell>
  );
}

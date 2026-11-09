import { Shell } from "../ui/shell.tsx";
import { requireShell } from "../ui/shell-page.ts";

/** Screen 8 arrives in Part 4B. */
export default async function UploadPage() {
  const data = await requireShell("/upload");
  return (
    <Shell screen="upload" {...data}>
      <div className="card">
        <h2>Upload a newer export</h2>
        <p className="muted mt-4">Uploading a newer export arrives in the next part of this phase.</p>
      </div>
    </Shell>
  );
}

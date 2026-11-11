import { redirect } from "next/navigation";
import { sessionFor } from "../../lib/auth/session.ts";
import { dataState } from "../../lib/data/state.ts";
import { setupPage } from "../../lib/data/update.ts";
import { DataNote } from "../ui/data-note.tsx";
import { countOf, longDate } from "../ui/format.ts";
import { Icon } from "../ui/icons.tsx";
import { pageToken } from "../ui/server-state.ts";
import { Shell } from "../ui/shell.tsx";
import { SettingsTabs } from "../ui/setup-settings.tsx";
import { requireShell } from "../ui/shell-page.ts";
import { UndoRow } from "../ui/undo-row.tsx";
import { WORDS } from "../ui/wording.ts";

/** Screen 13, Settings: Setup, Your data and AI. The server sends the page with its answers already in it. */
export default async function SettingsPage() {
  const data = await requireShell("/settings");
  const session = sessionFor(await pageToken(), { touch: false });
  if (session === null) redirect("/");
  const state = dataState(session.db);
  return (
    <Shell screen="settings" {...data}>
      {/* Undo from Settings reloads here, so its note shows here too (QA Q4B-4). Dismiss clears it everywhere. */}
      {state.note === "undone" && <DataNote kind="undone" version={state.version} undoDate={null} />}
      <SettingsTabs
        setup={setupPage(session.db)}
        yourData={
        <section className="card" aria-labelledby="your-data">
          <h2 id="your-data">Your data</h2>
          <ul className="list mt-4">
            <li>
              <span className="with-glyph">
                <span className="glyph">
                  <Icon name="file" />
                </span>
                <div>
                  <div>Last upload</div>
                  <div className="pick-row__sub">
                    {state.lastUploadDate === null ? "None yet" : `${longDate(state.lastUploadDate)} · ${countOf(state.lastUploadRows ?? 0, "row", "rows")}`}
                  </div>
                </div>
              </span>
            </li>
            <li>
              <span className="with-glyph">
                <span className="glyph">
                  <Icon name="spark" />
                </span>
                <div>
                  <div>Undo last update</div>
                  <div className="pick-row__sub">
                    {state.undoDate === null ? WORDS.nothingToUndo : `Goes back to your data from before ${longDate(state.undoDate)}.`}
                  </div>
                </div>
              </span>
              {state.undoDate !== null && <UndoRow version={state.version} undoDate={longDate(state.undoDate)} />}
            </li>
            <li>
              <span className="with-glyph">
                <span className="glyph">
                  <Icon name="trash" />
                </span>
                Delete my data
              </span>
              <a className="btn btn--sm" href="/settings/delete">
                Open
              </a>
            </li>
          </ul>
        </section>
        }
      />
    </Shell>
  );
}

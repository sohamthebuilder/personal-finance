import { Icon } from "../ui/icons.tsx";
import { Shell } from "../ui/shell.tsx";
import { requireShell } from "../ui/shell-page.ts";

/** Settings. Account and category setup (screen 13) arrives in Part 4B; Your data is here now. */
export default async function SettingsPage() {
  const data = await requireShell("/settings");
  return (
    <Shell screen="settings" {...data}>
      <div className="task__body">
        <section className="card" aria-labelledby="your-data">
          <h2 id="your-data">Your data</h2>
          <ul className="list mt-4">
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
      </div>
    </Shell>
  );
}

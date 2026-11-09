import { redirect } from "next/navigation";
import { finishDelete } from "../lib/auth/delete-data.ts";
import { waitSeconds } from "../lib/auth/session.ts";
import { appFiles } from "../lib/auth/start-screen.ts";
import { CreatePasswordForm } from "./ui/create-password.tsx";
import { Icon } from "./ui/icons.tsx";
import { LogIn } from "./ui/log-in.tsx";
import { FinishDelete } from "./ui/finish-delete.tsx";
import { currentScreen, shellData } from "./ui/server-state.ts";
import { Shell } from "./ui/shell.tsx";
import { TaskFrame } from "./ui/task-frame.tsx";
import { WORDS } from "./ui/wording.ts";

/** The one start screen, chosen by the server from what's saved (Decision 8). */
export default async function StartPage() {
  let { start, token } = await currentScreen();

  if (start.screen === "finish-delete") {
    // The app finishes a delete that was cut short, then shows screen 1.
    const files = appFiles();
    if (files !== null && finishDelete(files)) ({ start, token } = await currentScreen());
  }

  switch (start.screen) {
    case "create":
      return (
        <TaskFrame step={0}>
          {start.deleted && (
            <div className="note note--ok mb-5" role="status">
              <Icon name="check" />
              <div className="note__body">{WORDS.deleted}</div>
            </div>
          )}
          <h1>Create your password</h1>
          <p className="task__lede">It locks everything in the app. There&apos;s no reset, so choose one you&apos;ll remember.</p>
          <CreatePasswordForm />
        </TaskFrame>
      );
    case "login":
    case "files-incomplete":
    case "cant-open":
      return (
        <TaskFrame step={null}>
          <LogIn mode={{ kind: start.screen }} wait={waitSeconds()} />
        </TaskFrame>
      );
    case "locked":
      return (
        <TaskFrame step={null}>
          <LogIn mode={{ kind: "locked", reason: start.reason }} wait={waitSeconds()} />
        </TaskFrame>
      );
    case "finish-delete":
      return (
        <TaskFrame step={null}>
          <h1>Delete my data</h1>
          <FinishDelete />
        </TaskFrame>
      );
    case "upload":
      // Screen 4 arrives in Part 4B. There's no way past this step in 4A (condition 52).
      return (
        <TaskFrame step={1}>
          <h1>Add your export</h1>
          <p className="task__lede">Adding your export arrives in the next part of this phase.</p>
        </TaskFrame>
      );
    case "setup":
    case "summary":
      return (
        <TaskFrame step={start.screen === "setup" ? 2 : 3}>
          <h1>{start.screen === "setup" ? "Set up" : "Confirm"}</h1>
          <p className="task__lede">This step arrives in the next part of this phase.</p>
        </TaskFrame>
      );
    case "shell": {
      const data = shellData(token, "/");
      if (data === null) redirect("/");
      const { range, ...header } = data;
      return (
        <Shell screen="overview" {...header}>
          <div className="card">
            <h2>Overview</h2>
            <p className="muted">{range}</p>
            <p className="muted mt-4">Your Overview arrives in the next phase.</p>
          </div>
        </Shell>
      );
    }
  }
}

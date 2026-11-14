import { redirect } from "next/navigation";
import { finishDelete } from "../lib/auth/delete-data.ts";
import { sessionFor, waitSeconds } from "../lib/auth/session.ts";
import { dataState } from "../lib/data/state.ts";
import { setupPage, summaryData } from "../lib/data/update.ts";
import { serverToday } from "../lib/period.ts";
import { DataNote } from "./ui/data-note.tsx";
import { longDate } from "./ui/format.ts";
import { FirstSetup, SummaryFlow } from "./ui/setup-first.tsx";
import { SummaryView } from "./ui/summary-view.tsx";
import { UploadDrop } from "./ui/upload-drop.tsx";
import { appFiles } from "../lib/auth/start-screen.ts";
import { CreatePasswordForm } from "./ui/create-password.tsx";
import { Icon } from "./ui/icons.tsx";
import { OverviewScreen } from "./ui/overview.tsx";
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
      return (
        <TaskFrame step={1}>
          <h1>Add your export</h1>
          <p className="task__lede">Use the Excel file from Money Manager. It&apos;s read here, and the file is never sent anywhere.</p>
          <UploadDrop mode="first" />
        </TaskFrame>
      );
    case "setup": {
      // Screen 5. The step only moves on once the server has saved the answers.
      const session = sessionFor(token, { touch: false });
      if (session === null) redirect("/");
      return (
        <TaskFrame step={2} wide>
          <FirstSetup page={setupPage(session.db)} />
        </TaskFrame>
      );
    }
    case "summary": {
      const session = sessionFor(token, { touch: false });
      if (session === null) redirect("/");
      return (
        <SummaryFlow setup={setupPage(session.db)}>
          <SummaryView summary={summaryData(session.db, serverToday())} />
        </SummaryFlow>
      );
    }
    case "shell": {
      const data = shellData(token, "/");
      if (data === null) redirect("/");
      const { range, ...header } = data;
      const session = sessionFor(token, { touch: false });
      const state = session === null ? null : dataState(session.db);
      return (
        <Shell screen="overview" {...header}>
          {state?.note && <DataNote key={`${state.note}|${state.version}`} kind={state.note} version={state.version} undoDate={state.undoDate === null ? null : longDate(state.undoDate)} />}
          <OverviewScreen periodKey={`${header.period}|${range}`} />
        </Shell>
      );
    }
  }
}

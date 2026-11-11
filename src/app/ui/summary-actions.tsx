"use client";

import { useRef, useState } from "react";
import { leaveToStart, postForm } from "./client-tools.ts";
import { ConfirmDialog } from "./confirm-dialog.tsx";
import { Icon } from "./icons.tsx";
import { useBackToSetup } from "./setup-first.tsx";
import { WORDS } from "./wording.ts";

/** Screen 6's buttons: Looks right, Back to setup, Start over. The server checks the step and the data version. */
export function SummaryActions({ version }: { version: number }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [asking, setAsking] = useState(false);
  const sending = useRef(false);
  const over = useRef<HTMLButtonElement>(null);
  const backToSetup = useBackToSetup();

  async function send(path: string) {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setFailed(false);
    const answer = await postForm(path, { version: String(version) });
    sending.current = false;
    setBusy(false);
    if (answer.status === 200 && answer.body.ok === true) return leaveToStart();
    if (answer.status === 401) return leaveToStart();
    // A changed step or version means another window moved on: the server chooses what shows.
    if (answer.body.error === "STALE" || answer.body.error === "WRONG_STEP" || answer.body.error === "CONFIRMED") return leaveToStart();
    setAsking(false);
    setFailed(true);
  }

  return (
    <>
      {failed && (
        <div className="note note--danger mt-4" role="alert">
          <Icon name="alert" />
          <div className="note__body">{WORDS.summaryFailed}</div>
          <button className="link" type="button" onClick={() => setFailed(false)}>
            Try again
          </button>
        </div>
      )}
      <div className="task__actions">
        <button className="btn btn--primary" type="button" disabled={busy} onClick={() => void send("/api/summary/confirm")}>
          Looks right
        </button>
        {backToSetup && (
          <button className="btn" type="button" disabled={busy} onClick={backToSetup}>
            Back to setup
          </button>
        )}
        <button className="btn btn--quiet" type="button" ref={over} disabled={busy} onClick={() => setAsking(true)}>
          Start over
        </button>
      </div>
      {asking && (
        <ConfirmDialog
          title="Start over?"
          safeLabel="Keep going"
          actionLabel="Start over"
          danger
          busy={busy}
          onSafe={() => {
            setAsking(false);
            over.current?.focus();
          }}
          onAction={() => void send("/api/start-over")}
        >
          <p>This removes the import and your setup answers. You&apos;ll add the file again.</p>
        </ConfirmDialog>
      )}
    </>
  );
}

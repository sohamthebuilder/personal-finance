"use client";

import { useRef, useState } from "react";
import type { DataNote as NoteKind } from "../../lib/data/state.ts";
import { leaveToStart, postForm } from "./client-tools.ts";
import { ConfirmDialog } from "./confirm-dialog.tsx";
import { Icon } from "./icons.tsx";
import { WORDS } from "./wording.ts";

const TEXT: Record<NoteKind, string> = {
  imported: WORDS.noteImported,
  updated: WORDS.noteUpdated,
  undone: WORDS.noteUndone,
};

/**
 * The note left by an import, an update or an undo. It's saved, so a lock
 * before Dismiss doesn't lose it. After an update it carries Undo first.
 */
export function DataNote({ kind, version, undoDate }: { kind: NoteKind; version: number; undoDate: string | null }) {
  const [shown, setShown] = useState(true);
  const [asking, setAsking] = useState(false);
  const undoButton = useRef<HTMLButtonElement>(null);
  if (!shown) return null;

  async function dismiss() {
    setShown(false);
    const answer = await postForm("/api/note/dismiss", {});
    if (answer.status === 401) leaveToStart();
  }

  return (
    <>
      <div className="note note--ok mb-4" role="status">
        <Icon name="check" />
        <div className="note__body">{TEXT[kind]}</div>
        <span className="btn-row">
          {kind === "updated" && undoDate !== null && (
            <button className="link" type="button" ref={undoButton} onClick={() => setAsking(true)}>
              Undo
            </button>
          )}
          <button className="link" type="button" onClick={() => void dismiss()}>
            Dismiss
          </button>
        </span>
      </div>
      {asking && undoDate !== null && (
        <UndoDialog
          version={version}
          undoDate={undoDate}
          onClose={() => {
            setAsking(false);
            undoButton.current?.focus();
          }}
        />
      )}
    </>
  );
}

/** Screen 8's undo dialog, shared with Settings. Starts on the safe button. */
export function UndoDialog({ version, undoDate, onClose }: { version: number; undoDate: string; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const sending = useRef(false);

  async function undo() {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setFailed(false);
    const answer = await postForm("/api/undo", { version: String(version) });
    sending.current = false;
    setBusy(false);
    if (answer.status === 200 && answer.body.ok === true) {
      document.body.replaceChildren();
      window.location.reload();
      return;
    }
    if (answer.status === 401) return leaveToStart();
    setFailed(true);
  }

  return (
    <ConfirmDialog title="Undo this update?" safeLabel="Keep this update" actionLabel="Undo update" busy={busy} onSafe={onClose} onAction={() => void undo()}>
      <p>
        Your data and setup answers go back to how they were before this update on {undoDate}. To use this file again, you&apos;d upload it again.
      </p>
      {failed && (
        <div className="note note--danger mb-4" role="alert">
          <Icon name="alert" />
          <div className="note__body">{WORDS.undoFailed}</div>
        </div>
      )}
    </ConfirmDialog>
  );
}

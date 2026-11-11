"use client";

import { useRef, useState } from "react";
import { UndoDialog } from "./data-note.tsx";

/** Settings, Your data: "Undo last update" opens screen 8's dialog. */
export function UndoRow({ version, undoDate }: { version: number; undoDate: string }) {
  const [asking, setAsking] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button className="btn btn--sm" type="button" ref={button} onClick={() => setAsking(true)}>
        Undo
      </button>
      {asking && (
        <UndoDialog
          version={version}
          undoDate={undoDate}
          onClose={() => {
            setAsking(false);
            button.current?.focus();
          }}
        />
      )}
    </>
  );
}

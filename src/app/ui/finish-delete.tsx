"use client";

import { useState } from "react";
import { leaveToStart, postForm } from "./client-tools.ts";
import { Icon } from "./icons.tsx";
import { WORDS } from "./wording.ts";

/** Shown when a delete was cut short and couldn't finish by itself. Try again never asks for the password. */
export function FinishDelete() {
  const [again, setAgain] = useState(false);
  async function retry() {
    const answer = await postForm("/api/delete/finish", {});
    if (answer.status === 200 && answer.body.ok === true) return leaveToStart();
    setAgain(true);
  }
  return (
    <div className="note note--danger mt-5" role="alert">
      <Icon name="alert" />
      <div className="note__body">{again ? WORDS.deleteAfterAgain : WORDS.deleteAfter}</div>
      {!again && (
        <button className="btn btn--sm" type="button" onClick={retry}>
          Try again
        </button>
      )}
    </div>
  );
}

"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { leaveToStart, postForm } from "./client-tools.ts";
import { Icon } from "./icons.tsx";
import { PasswordField } from "./password-field.tsx";
import { WORDS, waitWords } from "./wording.ts";

type Stage = "ready" | "busy" | "before" | "after" | "after-again";

/** Screen 14's form. Delete everything stays off until the field has text and the box is ticked. */
export function DeleteForm() {
  const input = useRef<HTMLInputElement>(null);
  const [visible, setVisible] = useState(false);
  const [hasText, setHasText] = useState(false);
  const [ticked, setTicked] = useState(false);
  const [stage, setStage] = useState<Stage>("ready");
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    document.getElementById("title")?.focus();
  }, []);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = setInterval(() => setWait((left) => Math.max(0, left - 1)), 1000);
    return () => clearInterval(timer);
  }, [wait > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (stage === "busy" || wait > 0 || !hasText || !ticked) return;
    setVisible(false);
    const password = input.current?.value ?? "";
    if (input.current) input.current.value = "";
    setHasText(false);
    setError(null);
    setStage("busy");
    const answer = await postForm("/api/delete", { password, understood: "yes" });
    if (answer.status === 200 && answer.body.ok === true) return leaveToStart();
    if (answer.body.error === "LOCKED") return leaveToStart();
    if (answer.body.stage === "after") return setStage("after");
    // The field must be switched back on before focus can land in it (Q4-2).
    flushSync(() => {
      if (answer.body.error === "WAIT" && typeof answer.body.seconds === "number") {
        setStage("ready");
        setWait(Math.ceil(answer.body.seconds));
        setError("wait");
      } else if (answer.body.error === "WRONG") {
        setStage("ready");
        setError(WORDS.wrongDelete);
      } else {
        setStage("before");
      }
    });
    input.current?.focus();
  }

  async function retry() {
    const answer = await postForm("/api/delete/finish", {});
    if (answer.status === 200 && answer.body.ok === true) return leaveToStart();
    setStage("after-again");
  }

  if (stage === "after" || stage === "after-again") {
    // The session has ended, so the password field goes. Try again doesn't ask for it.
    return (
      <div className="note note--danger" role="alert">
        <Icon name="alert" />
        <div className="note__body">{stage === "after" ? WORDS.deleteAfter : WORDS.deleteAfterAgain}</div>
        {stage === "after" && (
          <button className="btn btn--sm" type="button" onClick={retry}>
            Try again
          </button>
        )}
      </div>
    );
  }

  const busy = stage === "busy";
  const shownError = error === "wait" ? (wait > 0 ? waitWords(wait) : null) : error;
  return (
    <>
      {stage === "before" && (
        <div className="note note--danger mb-4" role="alert">
          <Icon name="alert" />
          <div className="note__body">{WORDS.deleteBefore}</div>
        </div>
      )}
      <div className="card mb-5">
        <div className="label mb-1">What goes</div>
        <ul className="list">
          <li><span className="with-glyph"><span className="glyph"><Icon name="bars" /></span>All your data</span></li>
          <li><span className="with-glyph"><span className="glyph"><Icon name="gear" /></span>Your setup answers</span></li>
          <li><span className="with-glyph"><span className="glyph"><Icon name="file" /></span>The undo copy</span></li>
          <li><span className="with-glyph"><span className="glyph"><Icon name="lock" /></span>Your AI keys</span></li>
        </ul>
        <div className="label label--section">What stays</div>
        <p className="muted">
          Export files on your Mac aren&apos;t touched. If you still have any, they aren&apos;t protected. Time Machine or
          other backups of this Mac may still hold the encrypted database.
        </p>
      </div>
      <form method="post" action="/api/delete" noValidate onSubmit={submit}>
        <PasswordField
          id="password"
          name="password"
          label="Enter your password to confirm"
          autoComplete="off"
          inputRef={input}
          visible={visible}
          onToggle={() => setVisible(!visible)}
          error={shownError}
          disabled={busy}
          onInput={() => {
            setHasText((input.current?.value ?? "").length > 0);
            if (error !== null && error !== "wait") setError(null);
          }}
        />
        <div className="field">
          <label className="check">
            <input type="checkbox" name="understood" value="yes" disabled={busy} checked={ticked} onChange={(event) => setTicked(event.target.checked)} />
            <span className="check__box">
              <Icon name="check" />
            </span>
            <span>I understand this can&apos;t be undone.</span>
          </label>
        </div>
        <div className="task__actions">
          <a className="btn" href="/settings" aria-disabled={busy || undefined}>
            Keep my data
          </a>
          <button className="btn btn--danger" type="submit" disabled={busy || wait > 0 || !hasText || !ticked}>
            {busy ? (
              "Deleting…"
            ) : (
              <>
                <Icon name="trash" />
                Delete everything
              </>
            )}
          </button>
        </div>
      </form>
    </>
  );
}

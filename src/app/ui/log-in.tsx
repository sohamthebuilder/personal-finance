"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { leaveToStart, postForm } from "./client-tools.ts";
import { ForgotPanel } from "./forgot-panel.tsx";
import { Icon } from "./icons.tsx";
import { PasswordField } from "./password-field.tsx";
import { LOCK_LINES, WORDS, waitWords } from "./wording.ts";

export type LogInMode =
  | { kind: "login" }
  | { kind: "locked"; reason: keyof typeof LOCK_LINES }
  | { kind: "files-incomplete" }
  | { kind: "cant-open" };

const RETURN_SCREENS = new Set(["/", "/settings", "/settings/delete", "/upload"]);

/** Screens 2 and 3. Same layout; Locked has its title and one line saying why. */
/** `wait` is the server's wait left at page load, so a reload mid-wait still shows the countdown (Q4-3). */
export function LogIn({ mode, wait: waitAtLoad = 0 }: { mode: LogInMode; wait?: number }) {
  const input = useRef<HTMLInputElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<string | null>(waitAtLoad > 0 ? "wait" : null);
  const [cantOpen, setCantOpen] = useState(mode.kind === "cant-open");
  const [wait, setWait] = useState(waitAtLoad);
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(mode.kind === "files-incomplete");

  useEffect(() => {
    if (wait <= 0) return;
    const timer = setInterval(() => setWait((left) => Math.max(0, left - 1)), 1000);
    return () => clearInterval(timer);
  }, [wait > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || wait > 0) return;
    setVisible(false);
    const password = input.current?.value ?? "";
    // The field goes back to hidden and empty on submit (S3-16).
    if (input.current) input.current.value = "";
    setBusy(true);
    setError(null);
    setCantOpen(false);
    const answer = await postForm("/api/login", { password });
    setBusy(false);
    if (answer.status === 200 && answer.body.ok === true) {
      const next = typeof answer.body.next === "string" && RETURN_SCREENS.has(answer.body.next) ? answer.body.next : "/";
      document.body.replaceChildren();
      window.location.replace(next);
      return;
    }
    const code = answer.body.error;
    if (code === "WRONG_STEP") return leaveToStart();
    if (code === "WAIT" && typeof answer.body.seconds === "number") {
      setWait(Math.ceil(answer.body.seconds));
      setError("wait");
    } else if (code === "WRONG") {
      setError(WORDS.wrong);
    } else {
      setCantOpen(true);
    }
    input.current?.focus();
  }

  const locked = mode.kind === "locked";
  const shownError = error === "wait" ? (wait > 0 ? waitWords(wait) : null) : error;

  if (mode.kind === "files-incomplete") {
    return (
      <>
        <h1>Log in</h1>
        <div className="note note--danger mt-5">
          <Icon name="alert" />
          <div className="note__body">{WORDS.filesIncomplete}</div>
        </div>
        <ForgotPanel />
      </>
    );
  }

  return (
    <>
      <h1 tabIndex={-1} ref={title}>
        {locked ? "Locked" : "Log in"}
      </h1>
      {locked && mode.reason === "unconfirmed" ? (
        <div className="note note--warn note--lede" role="status">
          <Icon name="alert" />
          <div className="note__body">{LOCK_LINES.unconfirmed}</div>
        </div>
      ) : locked ? (
        <p className="task__lede">{LOCK_LINES[mode.reason]}</p>
      ) : (
        <p className="task__lede">Enter your password to open the app.</p>
      )}
      {cantOpen && (
        <div className="note note--danger mb-4" role="alert">
          <Icon name="alert" />
          <div className="note__body">{WORDS.cantOpen}</div>
        </div>
      )}
      <form method="post" action="/api/login" noValidate onSubmit={submit}>
        <PasswordField
          id="password"
          name="password"
          label="Password"
          autoComplete="current-password"
          inputRef={input}
          visible={visible}
          onToggle={() => setVisible(!visible)}
          error={shownError}
          onInput={() => {
            if (error !== null && error !== "wait") setError(null);
          }}
        />
        <div className="task__actions">
          <button className="btn btn--primary" type="submit" disabled={busy || wait > 0}>
            {busy ? "Unlocking…" : "Log in"}
          </button>
          <button className="link" type="button" aria-expanded={forgot} aria-controls="forgot" onClick={() => setForgot(!forgot)}>
            Forgot your password?
          </button>
        </div>
      </form>
      {forgot && <ForgotPanel />}
    </>
  );
}

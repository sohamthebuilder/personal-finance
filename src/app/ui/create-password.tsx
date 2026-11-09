"use client";

import { type FormEvent, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { characterCount, leaveToStart, postForm } from "./client-tools.ts";
import { Icon } from "./icons.tsx";
import { PasswordField } from "./password-field.tsx";
import { WORDS } from "./wording.ts";

interface Errors {
  password?: string;
  repeat?: string;
  tick?: string;
  note?: string;
}

const SERVER_ERRORS: Record<string, Errors> = {
  TOO_SHORT: { password: WORDS.tooShort },
  TOO_LONG: { password: WORDS.tooLong },
  TOO_COMMON: { password: WORDS.tooCommon },
  NO_MATCH: { repeat: WORDS.noMatch },
  NOT_TICKED: { tick: WORDS.notTicked },
};

/** Screen 1. The page checks length, match and the tick first; the server repeats every check. */
export function CreatePasswordForm() {
  const password = useRef<HTMLInputElement>(null);
  const repeat = useRef<HTMLInputElement>(null);
  const tick = useRef<HTMLInputElement>(null);
  const [visible, setVisible] = useState({ password: false, repeat: false });
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  function pageCheck(): Errors {
    const found: Errors = {};
    const text = password.current?.value ?? "";
    const count = characterCount(text);
    if (count < 15) found.password = WORDS.tooShort;
    else if (count > 256) found.password = WORDS.tooLong;
    if (text !== (repeat.current?.value ?? "")) found.repeat = WORDS.noMatch;
    if (!tick.current?.checked) found.tick = WORDS.notTicked;
    return found;
  }

  function focusFirst(found: Errors) {
    if (found.password) password.current?.focus();
    else if (found.repeat) repeat.current?.focus();
    else if (found.tick) tick.current?.focus();
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setVisible({ password: false, repeat: false });
    // A check made on the page, before anything is sent, keeps the text and hides it (ruling 2).
    const found = pageCheck();
    if (Object.keys(found).length > 0) {
      setErrors(found);
      focusFirst(found);
      return;
    }
    const fields = { password: password.current?.value ?? "", repeat: repeat.current?.value ?? "", understood: "yes" };
    // Anything after a request is sent empties the fields.
    if (password.current) password.current.value = "";
    if (repeat.current) repeat.current.value = "";
    setErrors({});
    setBusy(true);
    const answer = await postForm("/api/password/create", fields);
    if (answer.status === 200 && answer.body.ok === true) {
      leaveToStart();
      return;
    }
    const code = typeof answer.body.error === "string" ? answer.body.error : "";
    if (code === "WRONG_STEP") {
      leaveToStart();
      return;
    }
    const shown = SERVER_ERRORS[code] ?? { note: WORDS.saveFailed };
    // The fields must be switched back on before focus can land in one (Q4-2).
    flushSync(() => {
      setBusy(false);
      setErrors(shown);
    });
    focusFirst(shown);
  }

  const clear = (key: keyof Errors) => () => {
    if (errors[key]) setErrors({ ...errors, [key]: undefined });
  };

  return (
    <form method="post" action="/api/password/create" noValidate onSubmit={submit}>
      {errors.note && (
        <div className="note note--danger mb-4" role="alert">
          <Icon name="alert" />
          <div className="note__body">{errors.note}</div>
        </div>
      )}
      <PasswordField
        id="password"
        name="password"
        label="Password"
        autoComplete="new-password"
        inputRef={password}
        visible={visible.password}
        onToggle={() => setVisible({ ...visible, password: !visible.password })}
        hint="At least 15 characters. A short phrase works well."
        error={errors.password}
        disabled={busy}
        onInput={clear("password")}
      />
      <PasswordField
        id="repeat"
        name="repeat"
        label="Repeat password"
        autoComplete="new-password"
        inputRef={repeat}
        visible={visible.repeat}
        onToggle={() => setVisible({ ...visible, repeat: !visible.repeat })}
        error={errors.repeat}
        disabled={busy}
        onInput={clear("repeat")}
      />
      <div className={`field ${errors.tick ? "is-bad" : ""}`}>
        <label className="check">
          <input ref={tick} type="checkbox" name="understood" value="yes" disabled={busy} onChange={clear("tick")} aria-describedby={errors.tick ? "tick-error" : undefined} />
          <span className="check__box">
            <Icon name="check" />
          </span>
          <span>I understand that if I forget this, I&apos;d start again from my latest export.</span>
        </label>
        {errors.tick && (
          <p className="field__error" id="tick-error" role="alert">
            <Icon name="alert" />
            <span>{errors.tick}</span>
          </p>
        )}
      </div>
      <div className="task__actions">
        <button className="btn btn--primary" type="submit" disabled={busy}>
          {busy ? "Creating…" : "Create password"}
        </button>
      </div>
    </form>
  );
}

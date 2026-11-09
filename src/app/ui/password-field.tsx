"use client";

import type { RefObject } from "react";
import { Icon } from "./icons.tsx";

/**
 * A password field (S3-16): spell check and auto-correct off, show and hide,
 * error on the field. The text itself is never held in React state.
 */
export function PasswordField(props: {
  id: string;
  name: string;
  label: string;
  autoComplete: "new-password" | "current-password" | "off";
  inputRef: RefObject<HTMLInputElement | null>;
  visible: boolean;
  onToggle: () => void;
  error?: string | null;
  hint?: string;
  disabled?: boolean;
  onInput?: () => void;
}) {
  const errorId = `${props.id}-error`;
  const hintId = `${props.id}-hint`;
  const describedBy = [props.error ? errorId : null, props.hint ? hintId : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={`field ${props.error ? "is-bad" : ""}`}>
      <label className="field__label" htmlFor={props.id}>
        {props.label}
      </label>
      <div className="input-wrap">
        <input
          ref={props.inputRef}
          className="input"
          id={props.id}
          name={props.name}
          type={props.visible ? "text" : "password"}
          autoComplete={props.autoComplete}
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          aria-invalid={props.error ? true : undefined}
          aria-describedby={describedBy}
          disabled={props.disabled}
          onInput={props.onInput}
        />
        <button
          className="input-wrap__btn"
          type="button"
          aria-label={props.visible ? "Hide password" : "Show password"}
          onClick={props.onToggle}
          disabled={props.disabled}
        >
          <Icon name={props.visible ? "eye-off" : "eye"} />
        </button>
      </div>
      {props.hint && (
        <p className="field__hint" id={hintId}>
          {props.hint}
        </p>
      )}
      {props.error && (
        <p className="field__error" id={errorId} role="alert">
          <Icon name="alert" />
          <span>{props.error}</span>
        </p>
      )}
    </div>
  );
}


"use client";

import { type KeyboardEvent, type ReactNode, useEffect, useRef } from "react";

/**
 * The one confirmation dialog (design system `.scrim`, `.dialog`). Focus starts
 * on the safe button and stays inside. Esc is the safe choice.
 */
export function ConfirmDialog(props: {
  title: string;
  children: ReactNode;
  safeLabel: string;
  actionLabel: string;
  busyLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onSafe: () => void;
  onAction: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const safe = useRef<HTMLButtonElement>(null);

  useEffect(() => safe.current?.focus(), []);

  function onKey(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      if (!props.busy) props.onSafe();
      return;
    }
    if (event.key !== "Tab") return;
    const buttons = [...(box.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])") ?? [])];
    const first = buttons[0];
    const last = buttons.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="scrim" onKeyDown={onKey}>
      <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" ref={box}>
        <h2 id="confirm-title">{props.title}</h2>
        {props.children}
        <div className="btn-row">
          <button className="btn" type="button" ref={safe} disabled={props.busy} onClick={props.onSafe}>
            {props.safeLabel}
          </button>
          <button className={`btn ${props.danger ? "btn--danger" : "btn--primary"}`} type="button" disabled={props.busy} onClick={props.onAction}>
            {props.busy && props.busyLabel ? props.busyLabel : props.actionLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

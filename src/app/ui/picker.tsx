"use client";

import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { Icon } from "./icons.tsx";

export interface Choice {
  value: string;
  label: string;
}

/** The one picker (design system `.picker`, `.pop`). Arrow keys move, Enter picks, Esc closes. */
export function Picker(props: {
  label: string;
  value: string | null;
  choices: readonly Choice[];
  onPick: (value: string) => void;
  small?: boolean;
  placeholder?: string;
  invalid?: boolean;
  describedBy?: string;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const current = props.choices.find((choice) => choice.value === props.value);

  useEffect(() => {
    if (!open) return;
    const selected = list.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]') ?? list.current?.querySelector("button");
    selected?.focus();
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  function onKey(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      button.current?.focus();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const options = [...(list.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
    const index = options.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === "ArrowDown" ? Math.min(options.length - 1, index + 1) : Math.max(0, index - 1);
    options[next]?.focus();
  }

  return (
    <div className={`picker ${props.small ? "picker--sm" : ""}`} ref={root} onKeyDown={onKey}>
      <button
        ref={button}
        id={props.id}
        type="button"
        className={`picker__btn ${current ? "" : "is-empty"}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={props.label}
        aria-invalid={props.invalid ? true : undefined}
        aria-describedby={props.describedBy}
        onClick={() => setOpen(!open)}
        onKeyDown={(event) => {
          if ((event.key === "ArrowDown" || event.key === "ArrowUp") && !open) {
            event.preventDefault();
            event.stopPropagation();
            setOpen(true);
          }
        }}
      >
        <span className="picker__val">{current ? current.label : (props.placeholder ?? "Choose")}</span>
        <Icon name="chev" />
      </button>
      {open && (
        <div className="pop" role="listbox" aria-label={props.label} ref={list}>
          {props.choices.map((choice) => (
            <button
              key={choice.value}
              type="button"
              className="pop__opt"
              role="option"
              aria-selected={choice.value === props.value}
              onClick={() => {
                setOpen(false);
                button.current?.focus();
                props.onPick(choice.value);
              }}
            >
              <span>{choice.label}</span>
              {choice.value === props.value && <Icon name="check" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

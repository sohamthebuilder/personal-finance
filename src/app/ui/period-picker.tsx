"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { postForm } from "./client-tools.ts";
import { Icon } from "./icons.tsx";
import { type Choice, Picker } from "./picker.tsx";
import { WORDS } from "./wording.ts";

const PRESETS: readonly Choice[] = [
  { value: "this-month", label: "This month" },
  { value: "last-12", label: "Last 12 months" },
  { value: "financial-year", label: "Financial year" },
  { value: "all", label: "All" },
  { value: "custom", label: "Custom" },
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS: Choice[] = Array.from({ length: 31 }, (_, index) => ({ value: String(index + 1), label: String(index + 1) }));
const MONTH_CHOICES: Choice[] = MONTHS.map((name, index) => ({ value: String(index + 1), label: name }));

interface DateParts {
  day: string | null;
  month: string | null;
  year: string | null;
}

function toIso(parts: DateParts): string | null {
  if (!parts.day || !parts.month || !parts.year) return null;
  const iso = `${parts.year}-${parts.month.padStart(2, "0")}-${parts.day.padStart(2, "0")}`;
  const date = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : null;
}

function DateField(props: {
  name: "from" | "to";
  label: string;
  parts: DateParts;
  years: readonly Choice[];
  error: string | null;
  onChange: (parts: DateParts) => void;
}) {
  const errorId = `${props.name}-error`;
  const described = props.error ? errorId : undefined;
  return (
    <div className={`field ${props.error ? "is-bad" : ""}`} role="group" aria-labelledby={`${props.name}-label`}>
      <span className="field__label" id={`${props.name}-label`}>
        {props.label}
      </span>
      <div className="date-row">
        <Picker id={`${props.name}-day`} label={`${props.label} day`} placeholder="Day" value={props.parts.day} choices={DAYS} invalid={!!props.error} describedBy={described} onPick={(day) => props.onChange({ ...props.parts, day })} />
        <Picker label={`${props.label} month`} placeholder="Month" value={props.parts.month} choices={MONTH_CHOICES} invalid={!!props.error} describedBy={described} onPick={(month) => props.onChange({ ...props.parts, month })} />
        <Picker label={`${props.label} year`} placeholder="Year" value={props.parts.year} choices={props.years} invalid={!!props.error} describedBy={described} onPick={(year) => props.onChange({ ...props.parts, year })} />
      </div>
      {props.error && (
        <p className="field__error" id={errorId} role="alert">
          <Icon name="alert" />
          <span>{props.error}</span>
        </p>
      )}
    </div>
  );
}

const SERVER_ERRORS: Record<string, { field: "from" | "to"; text: string }> = {
  TO_BEFORE_FROM: { field: "to", text: WORDS.toBeforeFrom },
  AFTER_TODAY: { field: "to", text: WORDS.afterToday },
  NOT_A_DATE: { field: "from", text: WORDS.notADate },
};

/** Screen 7's period picker. The choice travels in a request body and sits in the server's session. */
export function PeriodPicker({ initial, firstYear, today }: { initial: string; firstYear: number; today: string }) {
  const [value, setValue] = useState(initial);
  const [dialog, setDialog] = useState(false);
  const [from, setFrom] = useState<DateParts>({ day: null, month: null, year: null });
  const [to, setTo] = useState<DateParts>({ day: null, month: null, year: null });
  const [errors, setErrors] = useState<{ from: string | null; to: string | null }>({ from: null, to: null });
  const dialogRef = useRef<HTMLDivElement>(null);
  // The server redraws the page, so the range line shows the chosen dates (Q4-4).
  const router = useRouter();
  const thisYear = Number(today.slice(0, 4));
  const years: Choice[] = [];
  for (let year = Math.min(firstYear, thisYear); year <= thisYear; year += 1) years.push({ value: String(year), label: String(year) });

  useEffect(() => {
    if (dialog) dialogRef.current?.querySelector<HTMLButtonElement>("#from-day")?.focus();
  }, [dialog]);

  async function choose(next: string) {
    if (next === "custom") {
      setErrors({ from: null, to: null });
      setDialog(true);
      return;
    }
    const answer = await postForm("/api/period", { period: next });
    if (answer.status === 401) window.location.replace("/");
    else if (answer.status === 200) {
      setValue(next);
      router.refresh();
    }
  }

  function focusField(name: "from" | "to") {
    dialogRef.current?.querySelector<HTMLButtonElement>(`#${name}-day`)?.focus();
  }

  async function show() {
    const fromIso = toIso(from);
    const toIsoValue = toIso(to);
    const found: { from: string | null; to: string | null } = {
      from: fromIso === null ? WORDS.notADate : null,
      to: toIsoValue === null ? WORDS.notADate : null,
    };
    if (fromIso && toIsoValue && toIsoValue < fromIso) found.to = WORDS.toBeforeFrom;
    else if (toIsoValue && toIsoValue > today) found.to = WORDS.afterToday;
    if (found.from || found.to) {
      setErrors(found);
      focusField(found.from ? "from" : "to");
      return;
    }
    const answer = await postForm("/api/period", { period: "custom", from: fromIso ?? "", to: toIsoValue ?? "" });
    if (answer.status === 401) return window.location.replace("/");
    if (answer.status === 200) {
      setValue("custom");
      setDialog(false);
      router.refresh();
      return;
    }
    const shown = SERVER_ERRORS[String(answer.body.error)] ?? SERVER_ERRORS.NOT_A_DATE;
    if (shown) {
      setErrors({ from: null, to: null, [shown.field]: shown.text });
      focusField(shown.field);
    }
  }

  return (
    <>
      <Picker label="Period" value={value} choices={PRESETS} onPick={choose} small />
      {dialog && (
        <div className="scrim" onKeyDown={(event) => event.key === "Escape" && setDialog(false)}>
          <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="period-title" ref={dialogRef}>
            <h2 id="period-title">Choose a period</h2>
            <div className="mt-4">
            <DateField name="from" label="From" parts={from} years={years} error={errors.from} onChange={(parts) => { setFrom(parts); setErrors({ ...errors, from: null }); }} />
            <DateField name="to" label="To" parts={to} years={years} error={errors.to} onChange={(parts) => { setTo(parts); setErrors({ ...errors, to: null }); }} />
            </div>
            <div className="btn-row">
              <button className="btn" type="button" onClick={() => setDialog(false)}>
                Cancel
              </button>
              <button className="btn btn--primary" type="button" onClick={show}>
                Show this period
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

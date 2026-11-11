"use client";

import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from "react";
import { suggestAccountGroup } from "../../lib/setup/suggestions.ts";
import { leaveToStart, postForm } from "./client-tools.ts";
import { Icon } from "./icons.tsx";
import { AccountList, answersOf, CategoryGroups, type Draft, draftFrom, type GroupDraft, type Reveal, type SetupPageData } from "./setup-lists.tsx";
import { TaskFrame } from "./task-frame.tsx";
import { WORDS } from "./wording.ts";

type Part = "accounts" | "income" | "expense";

const PARTS: Record<Part, { title: string; lede: string }> = {
  accounts: { title: "Group your accounts", lede: "We found these in your file and suggested what we could." },
  income: { title: "Group your income", lede: "Make groups such as Work and Savings, and put each category in one. You can do this later in Settings." },
  expense: { title: "Group your expenses", lede: "Make groups such as Needs and Wants, and put each category in one. You can do this later in Settings." },
};

/** Screen 5: Setup, in up to three parts. Back keeps the answers. Only the server decides what comes next. */
export function FirstSetup({ page, startAtEnd = false }: { page: SetupPageData; startAtEnd?: boolean }) {
  const parts: Part[] = ["accounts", ...(page.income.categories.length > 0 ? (["income"] as const) : []), ...(page.expense.categories.length > 0 ? (["expense"] as const) : [])];
  // Suggestions fill in what they can for accounts, and only for accounts with no saved answer.
  const [suggested] = useState(() => page.accounts.map((account) => account.group === "" && suggestAccountGroup(account.name) !== undefined));
  const [draft, setDraft] = useState<Draft>(() =>
    draftFrom(page, page.accounts.map((account) => (account.group !== "" ? account.group : (suggestAccountGroup(account.name) ?? "")))),
  );
  const [touched, setTouched] = useState<boolean[]>(() => page.accounts.map(() => false));
  const [at, setAt] = useState(startAtEnd ? parts.length - 1 : 0);
  const [showErrors, setShowErrors] = useState(false);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [focusPicker, setFocusPicker] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const sending = useRef(false);
  const part = parts[at] ?? "accounts";
  const last = at === parts.length - 1;
  const grouped = draft.accounts.filter((group) => group !== "").length;

  useEffect(() => {
    if (focusPicker === null) return;
    document.getElementById(`acc-pick-${focusPicker}`)?.focus();
    setFocusPicker(null);
  }, [focusPicker]);

  function step(to: number) {
    setAt(to);
    window.scrollTo(0, 0);
  }

  async function save() {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setFailed(false);
    const answer = await postForm("/api/setup", { version: String(page.version), answers: answersOf(draft) });
    sending.current = false;
    if (answer.status === 401 || (answer.status === 200 && answer.body.ok === true)) return leaveToStart();
    setBusy(false);
    setFailed(true);
  }

  function next() {
    if (part === "accounts") {
      const first = draft.accounts.findIndex((group) => group === "");
      if (first !== -1) {
        setShowErrors(true);
        setReveal({ key: "", token: Date.now(), clearSearch: true });
        setFocusPicker(first);
        return;
      }
    }
    if (last) void save();
    else step(at + 1);
  }

  const setGroups = (kind: "income" | "expense") => (groups: GroupDraft) => setDraft({ ...draft, [kind]: groups });

  return (
    <>
      <div className="task__eyebrow">
        Part {at + 1} of {parts.length}
      </div>
      <h1>{PARTS[part].title}</h1>
      <p className="task__lede">{PARTS[part].lede}</p>
      {part === "accounts" && (
        <>
          <AccountList
            id="acc"
            names={page.accounts.map((account) => account.name)}
            values={draft.accounts}
            suggested={suggested.map((was, index) => was && !touched[index])}
            firstTime
            showErrors={showErrors}
            disabled={busy}
            settleKey={0}
            reveal={reveal}
            onPick={(index, group) => {
              setTouched(touched.map((old, at2) => old || at2 === index));
              setDraft({ ...draft, accounts: draft.accounts.map((old, at2) => (at2 === index ? group : old)) });
            }}
          />
          <GroupedCount grouped={grouped} total={draft.accounts.length} />
        </>
      )}
      {part === "income" && (
        <CategoryGroups id="inc" categories={page.income.categories} draft={draft.income} example="Work and Savings" firstTime disabled={busy} settleKey={0} onChange={setGroups("income")} />
      )}
      {part === "expense" && (
        <CategoryGroups id="exp" categories={page.expense.categories} draft={draft.expense} example="Needs and Wants" firstTime disabled={busy} settleKey={0} onChange={setGroups("expense")} />
      )}
      {failed && (
        <div className="note note--danger mt-4" role="alert">
          <Icon name="alert" />
          <div className="note__body">{WORDS.setupFailed}</div>
        </div>
      )}
      <div className="task__actions">
        <button className="btn btn--primary" type="button" disabled={busy} onClick={next}>
          {busy ? "Saving…" : last ? "Save and continue" : "Continue"}
        </button>
        {at > 0 && (
          <button className="btn" type="button" disabled={busy} onClick={() => step(at - 1)}>
            Back
          </button>
        )}
      </div>
    </>
  );
}

/** "52 of 60 grouped", with its line. The width is set from script, because the app has no inline styles (D-010). */
function GroupedCount({ grouped, total }: { grouped: number; total: number }) {
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (bar.current) bar.current.style.width = `${total === 0 ? 100 : Math.round((grouped / total) * 100)}%`;
  }, [grouped, total]);
  return (
    <div className="mt-4">
      <div className="label mb-1">
        {grouped} of {total} grouped
      </div>
      <div className="meter">
        <div ref={bar} />
      </div>
    </div>
  );
}

const BackToSetup = createContext<(() => void) | null>(null);

/** Screen 6's "Back to setup" button opens screen 5 on its last part, with the saved answers. */
export function useBackToSetup(): (() => void) | null {
  return useContext(BackToSetup);
}

export function SummaryFlow({ setup, children }: { setup: SetupPageData; children: ReactNode }) {
  const [back, setBack] = useState(false);
  return (
    <TaskFrame step={back ? 2 : 3} wide>
      {back ? (
        <FirstSetup page={setup} startAtEnd />
      ) : (
        <BackToSetup.Provider
          value={() => {
            setBack(true);
            window.scrollTo(0, 0);
          }}
        >
          {children}
        </BackToSetup.Provider>
      )}
    </TaskFrame>
  );
}

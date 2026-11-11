"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { leaveToStart, postForm } from "./client-tools.ts";
import { ConfirmDialog } from "./confirm-dialog.tsx";
import { Icon } from "./icons.tsx";
import { AccountList, CategoryGroups, type Draft, draftFrom, type GroupDraft, answersOf, type SetupPageData } from "./setup-lists.tsx";
import { WORDS } from "./wording.ts";

type SaveState = "idle" | "saving" | "saved" | "failed";

const TABS = ["Setup", "Your data", "AI"] as const;

/** Screen 13's three-way choice. Every section stays on the page, so switching loses nothing. */
export function SettingsTabs({ setup, yourData }: { setup: SetupPageData; yourData: ReactNode }) {
  const [tab, setTab] = useState(0);
  return (
    <div className="task__body task__body--wide">
      <div className="seg mb-5" role="radiogroup" aria-label="Settings section" data-i={tab}>
        <span className="seg__thumb" />
        {TABS.map((name, index) => (
          <label key={name}>
            <input type="radio" name="settings-tab" checked={tab === index} onChange={() => setTab(index)} />
            <span>{name}</span>
          </label>
        ))}
      </div>
      <div hidden={tab !== 0}>
        <SetupSettings page={setup} />
      </div>
      <div hidden={tab !== 1}>{yourData}</div>
      <div hidden={tab !== 2}>
        <section className="card" aria-labelledby="h-ai">
          <h2 id="h-ai">AI</h2>
          <p className="muted mt-4">AI settings arrive in a later phase.</p>
        </section>
      </div>
    </div>
  );
}

/** Screen 13, Setup: the same controls as screen 5, then a save bar. Ungrouped is an allowed answer here. */
function SetupSettings({ page }: { page: SetupPageData }) {
  const [saved, setSaved] = useState<Draft>(() => draftFrom(page, page.accounts.map((account) => account.group)));
  const [draft, setDraft] = useState<Draft>(saved);
  const [version, setVersion] = useState(page.version);
  const [state, setState] = useState<SaveState>("idle");
  const [stale, setStale] = useState(false);
  const [settleKey, setSettleKey] = useState(0);
  const [leaving, setLeaving] = useState<HTMLElement | null>(null);
  const sending = useRef(false);
  const line = useRef<HTMLParagraphElement>(null);
  const letGo = useRef(false);
  const dirty = answersOf(draft) !== answersOf(saved);
  const off = stale || state === "saving";

  // Every link and button that leaves the page asks first while there are unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const onClick = (event: MouseEvent) => {
      if (letGo.current) return;
      const target = (event.target as Element | null)?.closest<HTMLElement>("a[href], [data-leave]");
      if (!target || target.closest(".scrim")) return;
      event.preventDefault();
      event.stopPropagation();
      setLeaving(target);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [dirty]);

  useEffect(() => {
    if (state === "saved") line.current?.focus();
  }, [state]);

  async function save() {
    if (sending.current) return;
    sending.current = true;
    setState("saving");
    const answer = await postForm("/api/setup", { version: String(version), answers: answersOf(draft) });
    sending.current = false;
    if (answer.status === 401) return leaveToStart();
    if (answer.status === 200 && answer.body.ok === true && typeof answer.body.version === "number") {
      setVersion(answer.body.version);
      setSaved(draft);
      setSettleKey(settleKey + 1);
      setState("saved");
      return;
    }
    if (answer.body.error === "STALE") setStale(true);
    setState("failed");
  }

  function discard() {
    setDraft(saved);
    setSettleKey(settleKey + 1);
    setState("idle");
  }

  const setGroups = (kind: "income" | "expense") => (groups: GroupDraft) => {
    setDraft({ ...draft, [kind]: groups });
    if (state === "saved") setState("idle");
  };

  const barClass = state === "failed" ? "is-bad" : state === "saved" && !dirty ? "is-ok" : dirty ? "is-dirty" : "";

  return (
    <>
      {stale && (
        <div className="note note--warn mb-5" role="status">
          <Icon name="alert" />
          <div className="note__body">{WORDS.changedElsewhere}</div>
          <button
            className="link"
            type="button"
            onClick={() => {
              letGo.current = true;
              window.location.reload();
            }}
          >
            Reload
          </button>
        </div>
      )}
      <section className="card mb-5" aria-labelledby="h-acc">
        <h2 id="h-acc">Accounts</h2>
        <p className="muted card__intro">The group decides where each account shows and what counts towards net worth.</p>
        <AccountList
          id="acc"
          names={page.accounts.map((account) => account.name)}
          values={draft.accounts}
          suggested={page.accounts.map(() => false)}
          firstTime={false}
          showErrors={false}
          disabled={off}
          settleKey={settleKey}
          reveal={null}
          onPick={(index, group) => {
            setDraft({ ...draft, accounts: draft.accounts.map((old, at) => (at === index ? group : old)) });
            if (state === "saved") setState("idle");
          }}
        />
      </section>
      {page.income.categories.length > 0 && (
        <section className="card mb-5" aria-labelledby="h-inc">
          <h2 id="h-inc">Income</h2>
          <p className="muted card__intro">Make your own groups, such as Work and Savings, and put each category in one. Subcategories go with their category.</p>
          <CategoryGroups id="inc" categories={page.income.categories} draft={draft.income} example="Work and Savings" firstTime={false} disabled={off} settleKey={settleKey} onChange={setGroups("income")} />
        </section>
      )}
      <section className="card" aria-labelledby="h-exp">
        <h2 id="h-exp">Expenses</h2>
        <p className="muted card__intro">Make your own groups, such as Needs and Wants, and put each category in one. Subcategories go with their category.</p>
        <CategoryGroups id="exp" categories={page.expense.categories} draft={draft.expense} example="Needs and Wants" firstTime={false} disabled={off} settleKey={settleKey} onChange={setGroups("expense")} />
      </section>
      <div className={`savebar ${barClass}`}>
        <p className="savebar__text" role="status" tabIndex={-1} ref={line}>
          {state === "failed" ? (
            <>
              <Icon name="alert" />
              <span>{WORDS.setupFailed}</span>
            </>
          ) : state === "saved" && !dirty ? (
            <>
              <Icon name="check" />
              <span>{WORDS.setupSaved}</span>
            </>
          ) : dirty ? (
            "You have unsaved changes."
          ) : (
            "No unsaved changes."
          )}
        </p>
        <button className="btn btn--primary" type="button" disabled={off || !(dirty || state === "failed")} onClick={() => void save()}>
          {state === "saving" ? "Saving…" : state === "failed" ? "Try again" : "Save changes"}
        </button>
        {dirty && state !== "saving" && (
          <button className="btn" type="button" disabled={stale} onClick={discard}>
            Discard
          </button>
        )}
      </div>
      {leaving !== null && (
        <ConfirmDialog
          title={WORDS.leaveTitle}
          safeLabel="Keep editing"
          actionLabel="Leave"
          onSafe={() => {
            const back = leaving;
            setLeaving(null);
            back.focus();
          }}
          onAction={() => {
            const target = leaving;
            setLeaving(null);
            letGo.current = true;
            if (target instanceof HTMLAnchorElement) window.location.assign(target.href);
            else target.click();
          }}
        >
          <p>{WORDS.leaveText}</p>
        </ConfirmDialog>
      )}
    </>
  );
}

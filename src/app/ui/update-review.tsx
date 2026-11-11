"use client";

import { useEffect, useRef, useState } from "react";
import type { PreviewRow, Review, ReviewList } from "../../lib/data/update.ts";
import { ACCOUNT_GROUPS } from "../../lib/setup/setup.ts";
import { leaveToStart, postForm } from "./client-tools.ts";
import { categoryName, countOf, grouped, groupIcon, longDate, monthYear, rupees, rupeesChange, rupeesExact } from "./format.ts";
import { Icon } from "./icons.tsx";
import { Picker } from "./picker.tsx";
import { WORDS } from "./wording.ts";

const LISTS: ReadonlyArray<{ key: ReviewList; label: string; empty: string }> = [
  { key: "added", label: "New", empty: "No new rows" },
  { key: "changed", label: "Changed", empty: "No changed rows" },
  { key: "removed", label: "Removed", empty: "No removed rows" },
];
const FIRST = 10;
const MORE = 50;
const UNGROUPED = "ungrouped";
const GROUP_CHOICES = [{ value: UNGROUPED, label: "Ungrouped" }, ...ACCOUNT_GROUPS.map((group) => ({ value: group, label: group }))];

/** The review the page draws from. The first rows of each list come with the page; more are asked for. */
export interface ReviewPage {
  version: number;
  review: Omit<Review, "lists"> & { lists: Record<ReviewList, PreviewRow[]> };
}

function removedLine(accounts: number, categories: number): string {
  const parts = [accounts > 0 ? countOf(accounts, "account", "accounts") : "", categories > 0 ? countOf(categories, "category", "categories") : ""].filter(Boolean);
  const verb = accounts + categories === 1 ? "is" : "are";
  return `${parts.join(" and ")} ${verb} no longer in this file. Their setup answers go when you confirm, and Undo brings them back.`;
}

/** New income or expense categories: shown as Not grouped, with nothing to choose (design, screen 8). */
function NewCategories({ kind, title, categories }: { kind: string; title: string; categories: ReadonlyArray<{ name: string; subcategories: string[] }> }) {
  if (categories.length === 0) return null;
  return (
    <section className="card span-12" aria-labelledby={`new-${kind}`}>
      <h2 id={`new-${kind}`}>{title}</h2>
      <p className="muted card__intro">These show as Not grouped. You can put them in a group in Settings.</p>
      <div className="pick-rows">
        {categories.map((category, index) => (
          <div className="pick-row pick-row--plain" key={index}>
            <div>
              <div className="pick-row__name">
                <span>{categoryName(category.name)}</span>
                <span className="tag">Not grouped</span>
              </div>
              {category.subcategories.length > 0 && <div className="pick-row__sub">{category.subcategories.join(" · ")}</div>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Screen 8, stage 2: "Check the changes". Nothing changes until Replace my data. */
export function UpdateReview({ page }: { page: ReviewPage }) {
  const { review } = page;
  const [list, setList] = useState<ReviewList>("added");
  const [rows, setRows] = useState(review.lists);
  const [groups, setGroups] = useState(review.newAccounts.map(() => UNGROUPED));
  const [ticked, setTicked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<"failed" | "stale" | null>(null);
  const sending = useRef(false);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const warning = review.warning;

  // The safe choice gets focus first when the file looks incomplete.
  useEffect(() => {
    if (warning !== null) cancelButton.current?.focus();
  }, [warning]);

  const shown = rows[list];
  const total = review.counts[list];
  const left = Math.min(MORE, total - shown.length);

  async function showMore() {
    const answer = await postForm("/api/update/rows", { list, offset: String(shown.length) });
    if (answer.status === 401) return leaveToStart();
    if (answer.status !== 200 || !Array.isArray(answer.body.rows)) return;
    setRows({ ...rows, [list]: [...shown, ...(answer.body.rows as PreviewRow[])] });
  }

  async function replace() {
    if (sending.current || (warning !== null && !ticked)) return;
    sending.current = true;
    setBusy(true);
    setProblem(null);
    const answer = await postForm("/api/update/confirm", {
      version: String(page.version),
      ticked: ticked ? "yes" : "no",
      groups: JSON.stringify(groups.map((group) => (group === UNGROUPED ? "" : group))),
    });
    sending.current = false;
    setBusy(false);
    if (answer.status === 200 && answer.body.ok === true) {
      // Back to the screen the owner came from, where the note shows.
      document.body.replaceChildren();
      window.location.replace("/");
      return;
    }
    if (answer.status === 401) return leaveToStart();
    setProblem(answer.body.error === "STALE" || answer.body.error === "NO_REVIEW" ? "stale" : "failed");
  }

  async function cancel() {
    await postForm("/api/update/cancel", {});
    document.body.replaceChildren();
    window.location.replace("/");
  }

  const change = review.netWorthNew - review.netWorthOld;
  return (
    <div className="enter">
      <h2 className="only-narrow mb-4">Check the changes</h2>
      {problem === "stale" && (
        <div className="note note--warn mb-4" role="alert">
          <Icon name="alert" />
          <div className="note__body">{WORDS.changedElsewhereUpload}</div>
          <a className="link" href="/upload">
            Upload again
          </a>
        </div>
      )}
      {warning !== null && (
        <div className="note note--warn mb-4">
          <Icon name="alert" />
          <div className="note__body">
            <strong>This file looks incomplete.</strong>
            {warning.startsLater && (
              <>
                <br />
                It starts in {monthYear(warning.startsLater.file)}, but your data starts in {monthYear(warning.startsLater.data)}.
              </>
            )}
            {warning.endsEarlier && (
              <>
                <br />
                It ends in {monthYear(warning.endsEarlier.file)}, but your data ends in {monthYear(warning.endsEarlier.data)}.
              </>
            )}
            {warning.fewerRows && (
              <>
                <br />
                It has {grouped(warning.fewerRows.file)} rows, and your data has {grouped(warning.fewerRows.data)}.
              </>
            )}
            {warning.mostAccountsMissing && (
              <>
                <br />
                Most of your current accounts aren&apos;t in this file.
              </>
            )}
            <br />
            <span className="muted">A new file replaces everything, so anything missing from it would go.</span>
            <label className="check mt-4">
              <input type="checkbox" checked={ticked} onChange={(event) => setTicked(event.target.checked)} />
              <span className="check__box">
                <Icon name="check" />
              </span>
              <span>I&apos;ve checked, and I want to use this file.</span>
            </label>
          </div>
        </div>
      )}
      <div className="grid">
        <section className="card card--hero span-5" aria-label="Net worth after this update">
          <div className="label">Net worth after this update</div>
          <div className="figure figure--display num">{rupees(review.netWorthNew)}</div>
          <div className={`delta ${change >= 0 ? "delta--up" : ""}`}>
            <span className="num">{rupeesChange(change)}</span>
            <span className="muted">from {rupees(review.netWorthOld)}</span>
          </div>
        </section>
        <section className="card stats span-7" aria-label="What changes">
          <div className="stat">
            <div className="label">New rows</div>
            <div className="figure num">{grouped(review.counts.added)}</div>
          </div>
          <div className="stat">
            <div className="label">Changed rows</div>
            <div className="figure num">{grouped(review.counts.changed)}</div>
          </div>
          <div className="stat">
            <div className="label">Removed rows</div>
            <div className="figure num">{grouped(review.counts.removed)}</div>
          </div>
          <div className="stat">
            <div className="label">Rows in this file</div>
            <div className="figure num">{grouped(review.counts.total)}</div>
          </div>
        </section>
        <section className="card span-12" aria-label="Rows">
          <p className="muted mb-4">
            {countOf(review.counts.total, "row", "rows")} from {longDate(review.fileFrom)} to {longDate(review.fileTo)}. Nothing has changed yet.
          </p>
          <div className="seg" role="radiogroup" aria-label="Which rows" data-i={LISTS.findIndex((item) => item.key === list)}>
            <span className="seg__thumb" />
            {LISTS.map((item) => (
              <label key={item.key}>
                <input type="radio" name="which-rows" value={item.key} checked={list === item.key} onChange={() => setList(item.key)} />
                <span>
                  {item.label} {grouped(review.counts[item.key])}
                </span>
              </label>
            ))}
          </div>
          {shown.length === 0 ? (
            <p className="muted mt-4">{LISTS.find((item) => item.key === list)?.empty}</p>
          ) : (
            <ul className="list mt-4">
              {shown.map((row, index) => (
                <li key={index}>
                  <div>
                    <div className="pick-row__sub">{longDate(row.date)}</div>
                    <div>{row.account}</div>
                    <div className="pick-row__sub">{categoryName(row.category)}</div>
                  </div>
                  <div className="num">
                    {rupeesExact(row.amountPaise)}
                    {row.wasPaise !== undefined && <div className="pick-row__sub">was {rupeesExact(row.wasPaise)}</div>}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {left > 0 && (
            <button className="btn btn--sm mt-4" type="button" onClick={() => void showMore()}>
              Show {left} more
            </button>
          )}
        </section>
        {review.newAccounts.length > 0 && (
          <section className="card span-12" aria-labelledby="new-accounts">
            <h2 id="new-accounts">New accounts</h2>
            <p className="muted card__intro">These go in Ungrouped until you choose a group.</p>
            <div className="pick-rows">
              {review.newAccounts.map((account, index) => (
                <div className="pick-row" key={index}>
                  <span className="glyph">
                    <Icon name={groupIcon(groups[index] ?? "")} />
                  </span>
                  <div>
                    <div className="pick-row__name">
                      <span>{account.name}</span>
                    </div>
                    <div className="pick-row__sub num">{rupees(account.balance)}</div>
                  </div>
                  <Picker
                    label={`Group for ${account.name}`}
                    value={groups[index] ?? UNGROUPED}
                    choices={GROUP_CHOICES}
                    onPick={(value) => setGroups(groups.map((group, at) => (at === index ? value : group)))}
                  />
                </div>
              ))}
            </div>
          </section>
        )}
        <NewCategories kind="income" title="New income categories" categories={review.newCategories.income} />
        <NewCategories kind="expense" title="New expense categories" categories={review.newCategories.expense} />
      </div>
      {(review.removedAccounts > 0 || review.removedCategories > 0) && (
        <div className="note note--warn mt-4">
          <Icon name="alert" />
          <div className="note__body">{removedLine(review.removedAccounts, review.removedCategories)}</div>
        </div>
      )}
      {problem === "failed" && (
        <div className="note note--danger mt-4" role="alert">
          <Icon name="alert" />
          <div className="note__body">{WORDS.replaceFailed}</div>
          <button className="link" type="button" onClick={() => void replace()}>
            Try again
          </button>
        </div>
      )}
      <div className="task__actions">
        <button className="btn btn--primary" type="button" disabled={busy || problem === "stale" || (warning !== null && !ticked)} onClick={() => void replace()}>
          {busy ? "Replacing…" : "Replace my data"}
        </button>
        <button className="btn" type="button" ref={cancelButton} disabled={busy} onClick={() => void cancel()}>
          Cancel
        </button>
      </div>
      <p className="muted fine-print">Your current data is kept, encrypted, so you can undo this until your next update.</p>
    </div>
  );
}

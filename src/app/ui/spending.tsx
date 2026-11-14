"use client";

import { useRouter } from "next/navigation";
import { type KeyboardEvent, type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { SpendRow } from "../../lib/metrics/spending.ts";
import type { LevelRow, SpendingLevel, SpendingPath } from "../../lib/spending/spending.ts";
import { leaveToStart, postForm } from "./client-tools.ts";
import { longDate, monthYear, rupees, rupeesExact } from "./format.ts";
import { Icon } from "./icons.tsx";
import { oldUploadLine, shortRupees } from "./overview-words.ts";
import {
  barWidth, categoryName, changeText, emptyText, moreLabel, rowLabel, shareText, showingLine, SPENDING_WORDS,
  subcategoryName, transactionCount, trendLabel, trendMonth, trendSummary, trendTop,
} from "./spending-words.ts";
import { WORDS } from "./wording.ts";

/** Design: no skeleton for loads under 200ms. Numbers roll 500ms; bars move 400ms (in the stylesheet). */
const SKELETON_AFTER = 200;
const ROLL = 500;
const PAGE = 50;

const TOP: SpendingPath = { view: "categories", group: null, category: null, subcategory: null };

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const ease = (progress: number) => 1 - (1 - progress) ** 3;

interface Answer {
  spending: SpendingLevel;
  path: SpendingPath;
  version: number;
  oldUpload: string | null;
}

/** How a load came about: the first one, a period change, a step down or up, a switch, or more rows. */
type How = "fresh" | "period" | "forward" | "back" | "switch" | "more";

function readAnswer(body: Record<string, unknown>): Answer | null {
  if (body.ok !== true || typeof body.spending !== "object" || body.spending === null || typeof body.path !== "object" || body.path === null) return null;
  return {
    spending: body.spending as SpendingLevel,
    path: body.path as SpendingPath,
    version: Number(body.version),
    oldUpload: typeof body.oldUpload === "string" ? body.oldUpload : null,
  };
}

/** The level goes in the request body only, never the web address (AC-11). */
function formOf(path: SpendingPath, shown: number, start: boolean): Record<string, string> {
  const fields: Record<string, string> = { view: path.view, shown: String(shown) };
  if (path.group !== null) fields.group = path.group;
  if (path.category !== null) fields.category = path.category;
  if (path.subcategory !== null) fields.subcategory = path.subcategory;
  if (start) fields.start = "1";
  return fields;
}

function depthOf(path: SpendingPath): number {
  return (path.group !== null ? 1 : 0) + (path.category !== null ? 1 : 0) + (path.subcategory !== null ? 1 : 0);
}

/** History entries keep Next.js's own state and add the path. The web address never changes. */
function pushPath(path: SpendingPath, replace = false): void {
  const state = { ...(window.history.state as Record<string, unknown> | null), spending: path };
  if (replace) window.history.replaceState(state, "");
  else window.history.pushState(state, "");
}

function pathFromHistory(state: unknown): SpendingPath {
  const saved = (state as { spending?: SpendingPath } | null)?.spending;
  return saved && typeof saved === "object" ? saved : TOP;
}

/** A figure that rolls from what it showed to its new value. It shows its first value at once. */
function useRolled(target: number): number {
  const [shown, setShown] = useState(target);
  const current = useRef(target);
  useEffect(() => {
    const from = current.current;
    if (from === target || reducedMotion()) {
      current.current = target;
      setShown(target);
      return;
    }
    const start = performance.now();
    let frame = 0;
    const tick = () => {
      const progress = Math.min(1, (performance.now() - start) / ROLL);
      current.current = from + (target - from) * ease(progress);
      setShown(current.current);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target]);
  return shown;
}

/** Watches a box's width, so the chart draws to fit. */
function useWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    setWidth(element.clientWidth);
    const observer = new ResizeObserver(() => setWidth(element.clientWidth));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

/** Screen 10. Asks the server for one level at a time; `periodKey` changes when the period does. */
export function SpendingScreen({ periodKey }: { periodKey: string }) {
  const router = useRouter();
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [stage, setStage] = useState<"waiting" | "skeleton" | "ready" | "error">("waiting");
  const [move, setMove] = useState<{ how: How; serial: number }>({ how: "fresh", serial: 0 });
  const [changed, setChanged] = useState(false);
  const [oldShown, setOldShown] = useState(true);
  const asking = useRef(0);
  const version = useRef<number | null>(null);
  const path = useRef<SpendingPath>(TOP);
  const shown = useRef(PAGE);
  const retry = useRef<() => void>(() => undefined);

  const load = useCallback(async (next: SpendingPath, how: How, start = false) => {
    const ask = ++asking.current;
    retry.current = () => void load(next, how === "fresh" ? "fresh" : "switch", start);
    if (how !== "more") shown.current = PAGE;
    const fresh = how === "fresh";
    if (fresh) setStage("waiting");
    const timer = fresh ? setTimeout(() => ask === asking.current && setStage("skeleton"), SKELETON_AFTER) : null;
    const reply = await postForm("/api/spending", formOf(next, shown.current, start));
    if (timer) clearTimeout(timer);
    if (ask !== asking.current) return;
    if (reply.status === 401) return leaveToStart();
    if (reply.status === 409) {
      // The group went away (Setup changed elsewhere): back to the top.
      pushPath(TOP, true);
      return void load(TOP, "switch");
    }
    const got = reply.status === 200 ? readAnswer(reply.body) : null;
    if (got === null) {
      setStage("error");
      return;
    }
    if (start && depthOf(got.path) > 0) {
      // Opened from the Overview at a category: Back goes to Spending's first level.
      pushPath(TOP, true);
      pushPath(got.path);
    } else if (fresh) {
      pushPath(got.path, true);
    }
    path.current = got.path;
    version.current = got.version;
    setChanged(false);
    setAnswer(got);
    setMove((last) => ({ how, serial: last.serial + 1 }));
    setStage("ready");
  }, []);

  // First load, and again whenever the period changes. The level stays (AC-12).
  // Keyed on the period, so running the effect twice for the same period asks only once.
  const loadedFor = useRef<string | null>(null);
  useEffect(() => {
    if (loadedFor.current === periodKey) return;
    const first = loadedFor.current === null;
    loadedFor.current = periodKey;
    if (first) {
      // A page load with no saved level may be the Overview's link to a category.
      const saved = pathFromHistory(window.history.state);
      void load(saved, "fresh", saved === TOP);
    } else {
      void load(path.current, "period");
    }
  }, [periodKey, load]);

  // The browser's Back and Forward move between levels (AC-11).
  useEffect(() => {
    const onPop = (event: PopStateEvent) => {
      const next = pathFromHistory(event.state);
      void load(next, depthOf(next) < depthOf(path.current) ? "back" : "forward");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [load]);

  // "Your data changed in another window": checked without counting as use. Numbers stay until Reload.
  useEffect(() => {
    const check = async () => {
      if (version.current === null) return;
      try {
        const response = await fetch("/api/status", { cache: "no-store", credentials: "same-origin" });
        if (!response.ok) return;
        const body = (await response.json()) as { version?: unknown };
        if (typeof body.version === "number" && body.version !== version.current) setChanged(true);
      } catch {
        // Can't tell this time.
      }
    };
    const onVisible = () => document.visibilityState === "visible" && void check();
    const timer = setInterval(check, 30_000);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  function goDown(next: SpendingPath) {
    pushPath(next);
    void load(next, "forward");
  }

  function goUp(depth: number) {
    window.history.go(depth - depthOf(path.current));
  }

  function switchView(view: SpendingPath["view"]) {
    const next = { ...TOP, view };
    pushPath(next, true);
    void load(next, "switch");
  }

  function showMore() {
    shown.current += PAGE;
    void load(path.current, "more");
  }

  async function dismissOld() {
    setOldShown(false);
    const reply = await postForm("/api/overview/old-note", {});
    if (reply.status === 401) leaveToStart();
  }

  async function showThisMonth() {
    const reply = await postForm("/api/period", { period: "this-month" });
    if (reply.status === 401) return leaveToStart();
    if (reply.status === 200) router.refresh();
  }

  function reload() {
    router.refresh();
    void load(path.current, "fresh");
  }

  if (stage === "error") {
    return (
      <div className="note note--danger" role="alert">
        <Icon name="alert" />
        <div className="note__body">{SPENDING_WORDS.failed}</div>
        <span className="btn-row">
          <button className="btn btn--sm" type="button" onClick={() => retry.current()}>
            {SPENDING_WORDS.tryAgain}
          </button>
        </span>
      </div>
    );
  }
  if (stage === "skeleton") return <SpendingSkeleton />;
  if (stage === "waiting" || answer === null) return <div aria-busy="true" aria-label="Loading" />;

  return (
    <>
      {answer.oldUpload !== null && oldShown && (
        <div className="note note--warn mb-4" role="status">
          <Icon name="alert" />
          <div className="note__body">
            {oldUploadLine(answer.oldUpload)}{" "}
            <a className="link" href="/upload">
              Upload
            </a>
          </div>
          <span className="btn-row">
            <button className="link" type="button" onClick={() => void dismissOld()}>
              Dismiss
            </button>
          </span>
        </div>
      )}
      {changed && (
        <div className="note note--warn mb-4" role="status">
          <Icon name="alert" />
          <div className="note__body">{WORDS.changedElsewhere}</div>
          <span className="btn-row">
            <button className="link" type="button" onClick={reload}>
              Reload
            </button>
          </span>
        </div>
      )}
      <Level
        key={JSON.stringify(answer.path)}
        view={answer.spending}
        path={answer.path}
        move={move}
        onDown={goDown}
        onUp={goUp}
        onSwitch={switchView}
        onMore={showMore}
        onThisMonth={() => void showThisMonth()}
      />
    </>
  );
}

/** Names for the path and headings. Blank names use the app's own labels (AC-4). */
function namesOf(view: SpendingLevel, path: SpendingPath) {
  const group = view.groupName ?? "";
  const category = path.category === null ? "" : categoryName(path.category);
  const subcategory = path.subcategory === null ? "" : subcategoryName(path.subcategory);
  const current = view.level === "subcategory" ? subcategory : view.level === "category" ? category : view.level === "group" ? group : "";
  return { group, category, subcategory, current };
}

function Level(props: {
  view: SpendingLevel;
  path: SpendingPath;
  move: { how: How; serial: number };
  onDown: (path: SpendingPath) => void;
  onUp: (depth: number) => void;
  onSwitch: (view: SpendingPath["view"]) => void;
  onMore: () => void;
  onThisMonth: () => void;
}) {
  const { view, path } = props;
  const heading = useRef<HTMLHeadingElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const names = namesOf(view, path);
  const top = view.level === "top";
  const empty = view.level === "subcategory" ? (view.transactions?.count ?? 0) === 0 : view.rows.length === 0;

  // A level change slides 180ms the way the owner went, and focus moves to the list's heading (AC-16, AC-17).
  const firstMove = useRef(props.move.serial);
  useLayoutEffect(() => {
    if (props.move.serial !== firstMove.current) return;
    const how = props.move.how;
    if (how === "forward" || how === "back") {
      box.current?.classList.add("enter");
      if (how === "back") box.current?.classList.add("enter--back");
      heading.current?.focus();
    }
  }, [props.move]);

  const crumbs: string[] = ["Spending"];
  if (path.group !== null) crumbs.push(names.group);
  if (path.category !== null) crumbs.push(names.category);
  if (path.subcategory !== null) crumbs.push(names.subcategory);

  const title = view.level === "subcategory" ? "Transactions"
    : view.level === "category" ? "By subcategory"
    : view.level === "group" ? `Categories in ${names.group}`
    : view.view === "groups" ? "By group" : "By category";
  const trendTitle = top ? "Spent by month" : `${view.level === "group" ? names.group : names.category} by month`;

  const step = (row: LevelRow): SpendingPath => {
    if (top && view.view === "groups") return { ...path, group: row.key };
    if (top || view.level === "group") return { ...path, category: row.key };
    return { ...path, subcategory: row.key };
  };
  const rowName = (row: LevelRow) => (top && view.view === "groups" ? row.name : view.level === "category" ? subcategoryName(row.name) : categoryName(row.name));

  return (
    <div ref={box}>
      {crumbs.length > 1 && (
        <nav className="path" aria-label="Where you are">
          <ol>
            {crumbs.map((crumb, index) =>
              index < crumbs.length - 1 ? (
                <li key={index}>
                  <button className="link" type="button" onClick={() => props.onUp(index)}>
                    {crumb}
                  </button>
                </li>
              ) : (
                <li key={index} aria-current="page">
                  {crumb}
                </li>
              ),
            )}
          </ol>
        </nav>
      )}
      <div className="grid">
        <Hero view={view} label={top ? "Spent" : `Spent on ${names.current}`} />
        <section className="card span-5 grid__side" aria-labelledby="spend-trend">
          <div className="card__head">
            <h2 id="spend-trend">{trendTitle}</h2>
            <span className="label">From {monthYear(view.trend.months[0] ?? "")}</span>
          </div>
          <Trend months={view.trend.months} values={view.trend.values} title={trendTitle} />
        </section>
        <section className="card span-7" aria-labelledby="spend-list">
          <div className="card__head">
            <h2 id="spend-list" tabIndex={-1} ref={heading}>
              {title}
            </h2>
            {top && view.hasGroups && !empty && <ViewSwitch view={view.view} onSwitch={props.onSwitch} />}
          </div>
          {empty ? (
            <>
              <p>{emptyText(view.level, names.current, view.thisMonth)}</p>
              {top && !view.thisMonth && (
                <div className="btn-row mt-4">
                  <button className="btn btn--sm" type="button" onClick={props.onThisMonth}>
                    {SPENDING_WORDS.showThisMonth}
                  </button>
                </div>
              )}
            </>
          ) : view.transactions !== null ? (
            <Transactions list={view.transactions.list} count={view.transactions.count} onMore={props.onMore} grew={props.move.how === "more" ? props.move.serial : 0} />
          ) : (
            <ol className="ranks">
              {view.rows.map((row) => {
                const share = shareText(row.spent, view.spent);
                const meta = [share === "" ? "" : `${share} of ${top ? "spent" : names.current}`, changeText(row.spent, row.earlier, view.vs)].filter((text) => text !== "");
                return (
                  <Rank
                    key={row.key}
                    name={rowName(row)}
                    spent={row.spent}
                    width={barWidth(row.spent, Math.max(...view.rows.map((line) => line.spent)))}
                    meta={meta}
                    onOpen={() => props.onDown(step(row))}
                  />
                );
              })}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}

function Hero({ view, label }: { view: SpendingLevel; label: string }) {
  const figure = useRolled(view.spent);
  const change = changeText(view.spent, view.earlier, view.vs);
  const count = view.level === "subcategory" && view.count > 0 ? ` · ${transactionCount(view.count)}` : "";
  return (
    <section className="card card--hero span-7" aria-label={label}>
      <div className="label">{label}</div>
      <div className="figure figure--display num hero__figure">{rupees(Math.round(figure))}</div>
      {change !== "" && view.spent !== 0 && (
        <div className="hero__delta">
          <span className="delta">{change}</span>
        </div>
      )}
      <div className="hero__delta">
        <span className="delta">
          {view.range}
          {count}
        </span>
      </div>
    </section>
  );
}

/** A segmented choice of two (AC-5). Hidden below level 1, with no groups, and on an empty level. */
function ViewSwitch({ view, onSwitch }: { view: SpendingPath["view"]; onSwitch: (view: SpendingPath["view"]) => void }) {
  return (
    <div className="seg seg--2" data-i={view === "groups" ? 1 : 0} role="radiogroup" aria-label="Show spending by">
      <span className="seg__thumb" />
      <label>
        <input type="radio" name="spend-by" value="categories" checked={view === "categories"} onChange={() => onSwitch("categories")} />
        <span>Categories</span>
      </label>
      <label>
        <input type="radio" name="spend-by" value="groups" checked={view === "groups"} onChange={() => onSwitch("groups")} />
        <span>Your groups</span>
      </label>
    </div>
  );
}

/** One ranked row: the whole row is one button. The bar's width is set from script (D-010) and moves in the stylesheet. */
function Rank(props: { name: string; spent: number; width: number; meta: string[]; onOpen: () => void }) {
  const fill = useRef<HTMLSpanElement>(null);
  const placed = useRef(false);
  const amount = useRolled(props.spent);
  useLayoutEffect(() => {
    const bar = fill.current;
    if (!bar) return;
    const width = `${(props.width * 100).toFixed(2)}%`;
    // A new row shows its bar at once (AC-17: a level change only slides); a row that stays moves from its old width.
    // The browser may already have styled the bar at 0 width (another layout effect can force that), so the
    // transition is switched off, the width set and the style flushed before the transition comes back.
    if (!placed.current) {
      placed.current = true;
      bar.style.transition = "none";
      bar.style.width = width;
      void bar.offsetWidth;
      bar.style.transition = "";
      return;
    }
    const frame = requestAnimationFrame(() => {
      bar.style.width = width;
    });
    return () => cancelAnimationFrame(frame);
  }, [props.width]);
  return (
    <li>
      <button className="rank" type="button" aria-label={rowLabel(props.name, props.spent, props.meta)} onClick={props.onOpen}>
        <span>
          <span className="rank__line">
            <span className="rank__name">{props.name}</span>
            <span className="num">{rupees(Math.round(amount))}</span>
          </span>
          <span className="meter" aria-hidden="true">
            <span className="bg-spent" ref={fill} />
          </span>
          {props.meta.length > 0 && (
            <span className="rank__meta">
              {props.meta.map((text) => (
                <span key={text}>{text}</span>
              ))}
            </span>
          )}
        </span>
        <Icon name="chev" />
      </button>
    </li>
  );
}

/** Level 3: newest first, 50 at a time. Notes are plain text (AC-9). Focus moves to the first new row after "Show 50 more". */
function Transactions(props: { list: SpendRow[]; count: number; onMore: () => void; grew: number }) {
  const list = useRef<HTMLOListElement>(null);
  const before = useRef(props.list.length);
  useEffect(() => {
    if (props.grew === 0) {
      before.current = props.list.length;
      return;
    }
    const row = list.current?.children[before.current] as HTMLElement | undefined;
    row?.focus();
    before.current = props.list.length;
  }, [props.grew, props.list.length]);
  const shown = props.list.length;
  return (
    <>
      <ol className="txns" ref={list}>
        {props.list.map((row, index) => (
          <li className="txn" key={index} tabIndex={-1}>
            <span className="txn__note">{row.note === "" ? <span className="muted">{SPENDING_WORDS.noNote}</span> : row.note}</span>
            <span className="txn__amt num">{rupeesExact(row.amount)}</span>
            <span className="txn__meta">
              {longDate(row.date)} · {row.account}
            </span>
            <span className="txn__orig">{row.original === null ? "" : `Paid ${row.original}`}</span>
          </li>
        ))}
      </ol>
      {props.count > shown && (
        <div className="btn-row mt-4">
          <button className="btn btn--sm" type="button" onClick={props.onMore}>
            {moreLabel(shown, props.count, PAGE)}
          </button>
          <span className="label">{showingLine(shown, props.count)}</span>
        </div>
      )}
    </>
  );
}

/**
 * The monthly trend (AC-7): from the file's first month to this month. It scrolls
 * inside its card when bars would sit under 7px apart, opens at the latest month,
 * and keeps its axis still. One Tab stop; arrow keys read each month aloud.
 */
function Trend({ months, values, title }: { months: string[]; values: number[]; title: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const scroller = useRef<HTMLDivElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<number | null>(null);
  const [spoken, setSpoken] = useState("");
  const count = values.length;
  const h = 180;
  const axis = 44;
  const padB = 22;
  const padT = 8;
  const plot = h - padB - padT;
  const slot = Math.max(7, (width - axis) / Math.max(1, count));
  const inner = Math.ceil(slot * count);
  const barW = Math.max(3, Math.min(14, slot * 0.62));
  const top = trendTop(Math.max(0, ...values));
  const y = (value: number) => padT + plot - (Math.max(0, value) / top) * plot;
  const current = at !== null && at < count ? at : null;

  // Open at the latest month.
  useLayoutEffect(() => {
    const box = scroller.current;
    if (box) box.scrollLeft = box.scrollWidth;
  }, [width, count, months[0]]);

  const place = useCallback(() => {
    const box = scroller.current;
    if (current === null || !tip.current || !box) return;
    const x = axis + slot * current + slot / 2 - box.scrollLeft;
    tip.current.style.left = `${Math.min(Math.max(0, x - 60), Math.max(0, width - 130))}px`;
    tip.current.style.top = "0px";
  }, [current, slot, width]);
  useEffect(place, [place]);

  function onKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const next = current === null ? count - 1 : Math.min(count - 1, Math.max(0, current + (event.key === "ArrowRight" ? 1 : -1)));
    setAt(next);
    const box = scroller.current;
    if (box) {
      const x = slot * next;
      if (x < box.scrollLeft) box.scrollLeft = x - slot * 4;
      else if (x > box.scrollLeft + box.clientWidth - slot) box.scrollLeft = x - box.clientWidth + slot * 5;
    }
    setSpoken(trendMonth(months[next] ?? "", values[next] ?? 0, next === count - 1));
  }

  const shown = current === null ? null : { month: months[current] ?? "", value: values[current] ?? 0, last: current === count - 1 };
  return (
    <div className="chart" ref={ref}>
      <p className="sr-only">{trendSummary(title, months, values)}</p>
      {width > 0 && (
        <div className="chart-split">
          <svg width={axis} height={h} aria-hidden="true">
            {[0, top / 2, top].map((value) => (
              <text key={value} x="0" y={y(value) + 4}>
                {shortRupees(value)}
              </text>
            ))}
          </svg>
          <div
            className="chart--scroll"
            ref={scroller}
            tabIndex={0}
            role="group"
            aria-label={`${title}. Use the left and right arrow keys to read each month.`}
            onKeyDown={onKey}
            onBlur={() => setAt(null)}
            onMouseLeave={() => setAt(null)}
            onScroll={place}
          >
            <svg width={inner} height={h} aria-hidden="true">
              {[0, top / 2, top].map((value) => (
                <line key={value} className="chart__grid" x1="0" x2={inner} y1={y(value)} y2={y(value)} />
              ))}
              {values.map((value, index) => {
                const cx = slot * index + slot / 2;
                const label = trendLabel(months[index] ?? "", index === count - 1);
                return (
                  <g key={months[index]} onMouseEnter={() => setAt(index)}>
                    <rect x={cx - slot / 2} y="0" width={slot} height={h} fill="transparent" />
                    {value > 0 && (
                      <rect className="chart__bar" x={cx - barW / 2} y={y(value)} width={barW} height={padT + plot - y(value)} rx="2" fill="var(--spent)" opacity={current !== null && current !== index ? 0.4 : 1} />
                    )}
                    {label !== "" && (
                      <text x={Math.min(Math.max(cx, 12), inner - 12)} y={h - 6} textAnchor="middle">
                        {label}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      )}
      <div className="chart__tip" ref={tip} hidden={shown === null}>
        {shown && (
          <>
            <strong>
              {monthYear(shown.month)}
              {shown.last ? " so far" : ""}
            </strong>
            <br />
            {shown.value === 0 ? "Nothing spent" : `Spent ${rupees(shown.value)}`}
          </>
        )}
      </div>
      <p className="sr-only" aria-live="polite">
        {spoken}
      </p>
    </div>
  );
}

/** Loading: the screen's real shape, with no shimmer (design system `.skel`). */
export function SpendingSkeleton() {
  return (
    <div className="grid skel-wrap" aria-busy="true" aria-label="Loading">
      <section className="card card--hero span-7">
        <span className="skel skel--label" />
        <span className="skel skel--display" />
        <span className="skel skel--line" />
      </section>
      <section className="card span-5 grid__side">
        <span className="skel skel--label" />
        <span className="skel skel--chart" />
      </section>
      <section className="card span-7">
        <span className="skel skel--label" />
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <span key={index} className="skel skel--row" />
        ))}
      </section>
    </div>
  );
}

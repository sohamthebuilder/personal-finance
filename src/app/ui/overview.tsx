"use client";

import { useRouter } from "next/navigation";
import { type KeyboardEvent, type RefObject, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Bar, Overview } from "../../lib/overview/overview.ts";
import { leaveToStart, postForm } from "./client-tools.ts";
import { categoryName, rupees, rupeesChange } from "./format.ts";
import { Icon } from "./icons.tsx";
import { axisTop, barLayout, chartLabel, helpLine, labelStep, labelsShown, OVERVIEW_WORDS, oldUploadLine, rateText, shortRupees } from "./overview-words.ts";
import { WORDS } from "./wording.ts";

interface Answer {
  overview: Overview;
  version: number;
  oldUpload: string | null;
  rollUp: boolean;
}

/** Design: no skeleton for loads under 200ms. Numbers roll 500ms, bars move 400ms. */
const SKELETON_AFTER = 200;
const ROLL = 500;
const BAR_MOVE = 400;

const ease = (progress: number) => 1 - (1 - progress) ** 3;
const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Every figure that rolls, by name, so a new period can start from what's on screen. */
function figuresOf(view: Overview): Record<string, number> {
  const figures: Record<string, number> = {
    netWorth: view.netWorth, change: view.change,
    earned: view.earned, spent: view.spent, saved: view.saved, invested: view.invested,
  };
  view.top.forEach((line, index) => (figures[`cat${index}`] = line.spent));
  view.bars.points.forEach((bar, index) => {
    figures[`bare${index}`] = Math.max(0, bar.earned);
    figures[`bars${index}`] = Math.max(0, bar.spent);
  });
  return figures;
}

function readAnswer(body: Record<string, unknown>): Answer | null {
  if (body.ok !== true || typeof body.overview !== "object" || body.overview === null) return null;
  return {
    overview: body.overview as Overview,
    version: Number(body.version),
    oldUpload: typeof body.oldUpload === "string" ? body.oldUpload : null,
    rollUp: body.rollUp === true,
  };
}

/** Rolls figures from where they were to the new ones. With reduced motion, the new ones show at once. */
function useRoll() {
  const [, setFrame] = useState(0);
  const motion = useRef<{ from: Record<string, number>; to: Record<string, number>; start: number } | null>(null);
  const raf = useRef(0);

  const value = useCallback((key: string, duration: number): number => {
    const run = motion.current;
    if (run === null) return 0;
    const to = run.to[key] ?? 0;
    const from = run.from[key] ?? 0;
    const progress = Math.min(1, Math.max(0, (performance.now() - run.start) / duration));
    return from + (to - from) * ease(progress);
  }, []);

  const go = useCallback((to: Record<string, number>, from: Record<string, number> | null) => {
    cancelAnimationFrame(raf.current);
    motion.current = { from: from ?? to, to, start: from === null || reducedMotion() ? -Infinity : performance.now() };
    setFrame((frame) => frame + 1);
    if (from === null || reducedMotion()) return;
    const tick = () => {
      setFrame((frame) => frame + 1);
      if (motion.current && performance.now() - motion.current.start < ROLL) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  }, []);

  /** What's on screen now, for the next roll to start from. */
  const snapshot = useCallback((): Record<string, number> | null => {
    const run = motion.current;
    if (run === null) return null;
    const shown: Record<string, number> = {};
    for (const key of Object.keys(run.to)) shown[key] = value(key, key.startsWith("bar") ? BAR_MOVE : ROLL);
    return shown;
  }, [value]);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  return useMemo(() => ({ value, go, snapshot }), [value, go, snapshot]);
}

/** Screen 9. Asks the server for its figures; `periodKey` changes when the period does. */
export function OverviewScreen({ periodKey }: { periodKey: string }) {
  const router = useRouter();
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [stage, setStage] = useState<"waiting" | "skeleton" | "ready" | "error">("waiting");
  const [changed, setChanged] = useState(false);
  const [oldShown, setOldShown] = useState(true);
  const roll = useRoll();
  const version = useRef<number | null>(null);
  const asking = useRef(0);

  const load = useCallback(
    async (fresh: boolean) => {
      const ask = ++asking.current;
      const from = fresh ? null : roll.snapshot();
      if (fresh) setStage("waiting");
      const timer = fresh ? setTimeout(() => ask === asking.current && setStage("skeleton"), SKELETON_AFTER) : null;
      const reply = await postForm("/api/overview", {});
      if (timer) clearTimeout(timer);
      if (ask !== asking.current) return;
      if (reply.status === 401) return leaveToStart();
      const next = reply.status === 200 ? readAnswer(reply.body) : null;
      if (next === null) {
        setStage("error");
        return;
      }
      const to = figuresOf(next.overview);
      const zeros = Object.fromEntries(Object.keys(to).map((key) => [key, 0]));
      roll.go(to, next.rollUp ? zeros : from);
      version.current = next.version;
      setChanged(false);
      setAnswer(next);
      setStage("ready");
    },
    [roll],
  );

  // First load, and again whenever the period changes.
  useEffect(() => {
    void load(answer === null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodKey]);

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

  /** Reload after a change elsewhere: the figures, and the server-drawn notes above them, such as Phase 4's Undo note (QA Q5-5). */
  function reload() {
    router.refresh();
    void load(true);
  }

  async function dismissOld() {
    setOldShown(false);
    const reply = await postForm("/api/overview/old-note", {});
    if (reply.status === 401) leaveToStart();
  }

  /** A top category opens Spending at that category, for the same period (AC-13). Nothing goes in the web address. */
  async function openCategory(category: string) {
    const reply = await postForm("/api/spending/open", { category });
    if (reply.status === 401) return leaveToStart();
    window.location.assign("/spending");
  }

  async function showThisMonth() {
    const reply = await postForm("/api/period", { period: "this-month" });
    if (reply.status === 401) return leaveToStart();
    if (reply.status === 200) router.refresh();
  }

  if (stage === "error") {
    return (
      <div className="note note--danger" role="alert">
        <Icon name="alert" />
        <div className="note__body">{OVERVIEW_WORDS.failed}</div>
        <span className="btn-row">
          <button className="btn btn--sm" type="button" onClick={() => void load(true)}>
            {OVERVIEW_WORDS.tryAgain}
          </button>
        </span>
      </div>
    );
  }
  if (stage === "skeleton") return <OverviewSkeleton />;
  if (stage === "waiting" || answer === null) return <div aria-busy="true" aria-label="Loading" />;

  const view = answer.overview;
  const money = (key: string) => rupees(Math.round(roll.value(key, ROLL)));
  const help = helpLine(view.fewRows, view.rateState);
  const change = Math.round(roll.value("change", ROLL));
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
      <div className="grid">
        <section className="card card--hero span-5" aria-label="Net worth">
          <div className="label">Net worth</div>
          <div className="figure figure--display num hero__figure">{money("netWorth")}</div>
          <div className={`delta hero__delta ${view.change > 0 ? "delta--up" : ""}`}>
            <span className="num">{rupeesChange(change)}</span>
            <span className="muted">{view.range}</span>
          </div>
          <Spark values={view.spark} label={`Net worth at the end of each month, ${view.sparkFrom} to ${view.sparkTo}`} />
        </section>
        <section className="card stats span-7" aria-label="This period">
          <Stat label="Earned" value={money("earned")} />
          <Stat label="Spent" value={money("spent")} />
          <Stat label={`Saved · ${rateText(view.rate, view.rateState)}`} value={money("saved")} />
          <Stat label="Invested" value={money("invested")} />
          {help !== "" && <p className="stat stat--wide label muted">{help}</p>}
        </section>
        <section className="card span-7">
          <div className="card__head">
            <h2>Earned and spent by {view.bars.by}</h2>
            <div className="legend" aria-hidden="true">
              <span>
                <i className="bg-earned" />
                Earned
              </span>
              <span>
                <i className="bg-spent" />
                Spent
              </span>
            </div>
          </div>
          <Bars bars={view.bars.points} by={view.bars.by} height={(index, kind) => roll.value(`bar${kind}${index}`, BAR_MOVE)} />
        </section>
        <section className="card span-5">
          <h2 className="card__title">Top categories</h2>
          {view.top.length === 0 ? (
            periodKey.startsWith("this-month") ? (
              <p className="muted">{OVERVIEW_WORDS.noSpendThisMonth}</p>
            ) : (
              <p className="muted">
                {OVERVIEW_WORDS.noSpendPeriod}{" "}
                <button className="link" type="button" onClick={() => void showThisMonth()}>
                  {OVERVIEW_WORDS.showThisMonth}
                </button>
              </p>
            )
          ) : (
            <ol className="ranks">
              {view.top.map((line, index) => (
                <CategoryRow
                  key={index}
                  name={categoryName(line.category)}
                  amount={money(`cat${index}`)}
                  share={line.spent / (view.top[0]?.spent || 1)}
                  onOpen={() => void openCategory(line.category)}
                />
              ))}
            </ol>
          )}
        </section>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className="figure num">{value}</div>
    </div>
  );
}

/** One top category, as a ranked row that opens Spending at it (Phase 6, AC-13). The meter's width is set from script (D-010). */
function CategoryRow({ name, amount, share, onOpen }: { name: string; amount: string; share: number; onOpen: () => void }) {
  const fill = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    // One frame later, so the width moves from where it was.
    const frame = requestAnimationFrame(() => {
      if (fill.current) fill.current.style.width = `${Math.max(0, Math.min(1, share)) * 100}%`;
    });
    return () => cancelAnimationFrame(frame);
  }, [share]);
  return (
    <li>
      <button className="rank" type="button" aria-label={`${name}, ${amount}. Open in Spending`} onClick={onOpen}>
        <span>
          <span className="rank__line">
            <span className="rank__name">{name}</span>
            <span className="num">{amount}</span>
          </span>
          <span className="meter" aria-hidden="true">
            <span className="bg-spent" ref={fill} />
          </span>
        </span>
        <Icon name="chev" />
      </button>
    </li>
  );
}

/** Watches a box's width, so the charts draw to fit. */
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

/** The hero's small line. It redraws at once and never animates. */
function Spark({ values, label }: { values: number[]; label: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const height = 72;
  const low = Math.min(...values);
  const high = Math.max(...values);
  const points = values.map((value, index) => [
    (index / Math.max(1, values.length - 1)) * width,
    high === low ? height / 2 : height - 6 - ((value - low) / (high - low)) * (height - 16),
  ]);
  const path = points.map(([x, y], index) => `${index ? "L" : "M"}${(x ?? 0).toFixed(1)} ${(y ?? 0).toFixed(1)}`).join(" ");
  const end = points.at(-1) ?? [0, 0];
  return (
    <div className="chart hero__spark" ref={ref}>
      {width > 0 && (
        <svg height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
          <defs>
            <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--rail-ink)" stopOpacity=".18" />
              <stop offset="1" stopColor="var(--rail-ink)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`${path} L${width} ${height} L0 ${height} Z`} fill="url(#spark-fill)" />
          <path d={path} fill="none" stroke="var(--rail-ink)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          <circle cx={(end[0] ?? 0) - 1} cy={end[1] ?? 0} r="4" fill="var(--rail-ink)" />
        </svg>
      )}
    </div>
  );
}

/**
 * "Earned and spent by month": one Tab stop, arrow keys move between months,
 * hover or focus shows the exact figures. A month with Earned at zero or below
 * has no Earned bar, and keeps its label.
 */
function Bars(props: { bars: Bar[]; by: "month" | "year"; height: (index: number, kind: "e" | "s") => number }) {
  const { bars } = props;
  const [ref, width] = useWidth<HTMLDivElement>();
  const tip = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<number | null>(null);
  const count = bars.length;
  const h = 200;
  const padL = 40;
  const padB = 24;
  const padT = 6;
  const plot = h - padB - padT;
  const slot = (Math.max(width, padL + count) - padL) / Math.max(1, count);
  const { width: barWidth, gap } = barLayout(slot, count);
  const top = axisTop(Math.max(1_000_00, ...bars.map((bar) => Math.max(bar.earned, bar.spent))));
  const size = (value: number) => (Math.max(0, value) / top) * plot;
  const y = (value: number) => padT + plot - size(value);
  const labelled = useMemo(() => labelsShown(bars, props.by, labelStep(slot, bars.map((bar) => bar.label))), [bars, props.by, slot]);
  const current = at !== null && at < count ? at : null;

  useEffect(() => {
    if (current === null || !tip.current) return;
    const x = padL + slot * current + slot / 2;
    tip.current.style.left = `${Math.min(Math.max(0, x - 70), Math.max(0, width - 150))}px`;
    tip.current.style.top = "0px";
  }, [current, slot, width]);

  function onKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const step = event.key === "ArrowRight" ? 1 : -1;
    setAt(current === null ? count - 1 : (current + step + count) % count);
  }

  const shown = current === null ? null : bars[current];
  return (
    <div
      className="chart"
      ref={ref}
      tabIndex={0}
      role="group"
      aria-label={chartLabel(props.by, bars)}
      onKeyDown={onKey}
      onFocus={() => setAt((value) => value ?? count - 1)}
      onBlur={() => setAt(null)}
      onMouseLeave={() => setAt(null)}
    >
      {width > 0 && (
        <svg height={h} viewBox={`0 0 ${width} ${h}`} aria-hidden="true">
          {[0, top / 2, top].map((value) => (
            <g key={value}>
              <line className="chart__grid" x1={padL} x2={width} y1={y(value)} y2={y(value)} />
              <text x="0" y={y(value) + 4}>
                {shortRupees(value)}
              </text>
            </g>
          ))}
          {bars.map((bar, index) => {
            const cx = padL + slot * index + slot / 2;
            const earned = size(props.height(index, "e"));
            const spent = size(props.height(index, "s"));
            const dim = current !== null && current !== index ? 0.4 : 1;
            return (
              <g key={index} onMouseEnter={() => setAt(index)}>
                <rect x={cx - slot / 2} y={padT} width={slot} height={plot + padB} fill="transparent" />
                <rect className="chart__bar" x={cx - barWidth - gap / 2} y={padT + plot - earned} width={barWidth} height={earned} rx="3" fill="var(--earned)" opacity={dim} />
                <rect className="chart__bar" x={cx + gap / 2} y={padT + plot - spent} width={barWidth} height={spent} rx="3" fill="var(--spent)" opacity={dim} />
                {labelled[index] && (
                  <text x={cx} y={h - 6} textAnchor="middle">
                    {bar.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
      <div className="chart__tip" ref={tip} hidden={shown === null || shown === undefined} role="status" aria-live="polite">
        {shown && (
          <>
            <strong>
              {shown.name}
              {shown.soFar ? " so far" : ""}
            </strong>
            <br />
            Earned {rupees(shown.earned)}
            <br />
            Spent {rupees(shown.spent)}
          </>
        )}
      </div>
    </div>
  );
}

/** Loading: the screen's real shape, with no shimmer (design system `.skel`). */
export function OverviewSkeleton() {
  const stat = (
    <div className="stat">
      <span className="skel skel--label" />
      <span className="skel skel--figure" />
    </div>
  );
  return (
    <div className="grid skel-wrap" aria-busy="true" aria-label="Loading">
      <section className="card card--hero span-5">
        <span className="skel skel--label" />
        <span className="skel skel--display" />
        <span className="skel skel--line" />
        <span className="skel skel--spark" />
      </section>
      <section className="card stats span-7">
        {stat}
        {stat}
        {stat}
        {stat}
      </section>
      <section className="card span-7">
        <span className="skel skel--label" />
        <span className="skel skel--chart" />
      </section>
      <section className="card span-5">
        <span className="skel skel--label" />
        {[0, 1, 2, 3, 4].map((index) => (
          <span key={index} className="skel skel--row" />
        ))}
      </section>
    </div>
  );
}

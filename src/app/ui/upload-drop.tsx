"use client";

import { type DragEvent, useEffect, useRef, useState } from "react";
import { REJECTION_MESSAGES, type RejectionCode } from "../../lib/import/errors.ts";
import { leaveToStart, postForm } from "./client-tools.ts";
import { Icon } from "./icons.tsx";
import { rowsLine, WORDS } from "./wording.ts";

const STAGES = ["Checking the file", "Reading rows", "Adding up balances"] as const;
const UPDATE_STAGE = "Comparing with your current data";

interface Refusal {
  code: RejectionCode;
  rows: number[];
  rowCount: number;
}

function readRefusal(body: Record<string, unknown>): Refusal {
  const code = typeof body.code === "string" && Object.hasOwn(REJECTION_MESSAGES, body.code) ? (body.code as RejectionCode) : "INTERNAL_ERROR";
  const rows = Array.isArray(body.rows) ? body.rows.filter((row): row is number => Number.isInteger(row)) : [];
  return { code, rows, rowCount: typeof body.rowCount === "number" ? body.rowCount : rows.length };
}

/**
 * The drop area on screens 4 and 8. The file goes to the server as the raw
 * request body. Refusals show fixed wording, plus row numbers only.
 */
export function UploadDrop({ mode, lost }: { mode: "first" | "update"; lost?: boolean }) {
  const stages = mode === "update" ? [...STAGES, UPDATE_STAGE] : STAGES;
  const [stage, setStage] = useState<number | null>(null);
  const [over, setOver] = useState(false);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [same, setSame] = useState(false);
  const [showLost, setShowLost] = useState(lost === true);
  const input = useRef<HTMLInputElement>(null);
  const sending = useRef(false);

  // A file dropped beside the area must never open in the browser.
  useEffect(() => {
    const stop = (event: Event) => event.preventDefault();
    window.addEventListener("dragover", stop);
    window.addEventListener("drop", stop);
    return () => {
      window.removeEventListener("dragover", stop);
      window.removeEventListener("drop", stop);
    };
  }, []);

  // One named stage at a time while the server reads the file.
  useEffect(() => {
    if (stage === null || stage >= stages.length - 1) return;
    const timer = setTimeout(() => setStage((now) => (now === null ? null : Math.min(now + 1, stages.length - 1))), 700);
    return () => clearTimeout(timer);
  }, [stage, stages.length]);

  async function send(file: File | undefined) {
    if (!file || sending.current) return;
    sending.current = true;
    setRefusal(null);
    setSame(false);
    setShowLost(false);
    setStage(0);
    let status = 0;
    let body: Record<string, unknown> = {};
    try {
      const response = await fetch(mode === "first" ? "/api/upload" : "/api/update/upload", {
        method: "POST",
        body: file,
        headers: { "Content-Type": "application/octet-stream" },
        credentials: "same-origin",
        cache: "no-store",
        redirect: "error",
      });
      status = response.status;
      body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    } catch {
      status = 0;
    }
    sending.current = false;
    if (input.current) input.current.value = "";
    if (status === 200 && body.ok === true) {
      if (mode === "update" && body.same === true) {
        setStage(null);
        setSame(true);
        return;
      }
      // The server chooses what shows next: setup, or the review.
      document.body.replaceChildren();
      window.location.replace(mode === "first" ? "/" : "/upload");
      return;
    }
    if (status === 401 || body.code === "LOCKED" || body.code === "WRONG_STEP") return leaveToStart();
    setStage(null);
    setRefusal(status === 413 ? { code: "FILE_TOO_LARGE", rows: [], rowCount: 0 } : readRefusal(body));
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setOver(false);
    void send(event.dataTransfer.files[0]);
  }

  async function cancel() {
    await postForm("/api/update/cancel", {});
    document.body.replaceChildren();
    window.location.replace("/");
  }

  const rows = refusal ? rowsLine(refusal.rows, refusal.rowCount) : "";
  return (
    <>
      {showLost && (
        <div className="note note--warn mb-4" role="status">
          <Icon name="alert" />
          <div className="note__body">{WORDS.uploadLost}</div>
        </div>
      )}
      {same && (
        <div className="note mb-4" role="status">
          <Icon name="check" />
          <div className="note__body">{WORDS.sameFile}</div>
          <a className="link" href="/">
            Done
          </a>
        </div>
      )}
      {refusal && (
        <div className="note note--danger mb-4" role="alert">
          <Icon name="alert" />
          <div className="note__body">
            <strong>
              {REJECTION_MESSAGES[refusal.code]}
              {rows === "" ? "" : ` ${rows}`}
            </strong>
            <br />
            <span className="muted">{mode === "first" ? WORDS.firstRefused : WORDS.updateRefused}</span>
          </div>
        </div>
      )}
      <div
        className={`drop ${over ? "is-over" : ""}`}
        onDragEnter={(event) => {
          event.preventDefault();
          setOver(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        <span className="glyph">
          <Icon name="file" />
        </span>
        {stage === null ? (
          <>
            <strong className="only-wide">Drop your export here</strong>
            <strong className="only-narrow">Choose your export</strong>
            <p className="muted only-wide">or choose it from your Mac</p>
            <input
              ref={input}
              className="sr"
              type="file"
              accept=".xlsx"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(event) => void send(event.target.files?.[0])}
            />
            <button className="btn mt-4" type="button" onClick={() => input.current?.click()}>
              Choose file
            </button>
          </>
        ) : (
          <>
            <strong role="status">{stages[stage]}</strong>
            <StageMeter step={stage + 1} of={stages.length} />
          </>
        )}
      </div>
      {mode === "update" && (
        <div className="task__actions">
          <button className="link" type="button" onClick={() => void cancel()}>
            Cancel
          </button>
        </div>
      )}
    </>
  );
}

/** The progress line. Its width is set from script after load, because the app has no inline styles (D-010). */
function StageMeter({ step, of }: { step: number; of: number }) {
  const line = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (line.current) {
      line.current.style.width = "100%";
      line.current.style.maxWidth = "280px";
    }
    if (bar.current) bar.current.style.width = `${Math.round((step / of) * 100)}%`;
  }, [step, of]);
  return (
    <div className="meter mt-4" ref={line}>
      <div ref={bar} />
    </div>
  );
}

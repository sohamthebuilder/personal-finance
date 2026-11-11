"use client";

import { useEffect, useRef, useState } from "react";
import { WIPE_COMMAND } from "../../lib/wipe-command.ts";
import { Icon } from "./icons.tsx";
import { WORDS } from "./wording.ts";

/** The forgotten-password steps. What Copy copies is the same constant the screen shows. */
export function ForgotPanel() {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(WIPE_COMMAND);
      setFailed(false);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setFailed(true);
    }
  }

  return (
    <div className="card enter mt-5" id="forgot">
      <h2>Start again without your password</h2>
      <p className="muted card__intro">There&apos;s no reset, because a reset would be a way in for anyone else.</p>
      <ol className="list steps">
        <li>
          <span className="glyph num">1</span>
          <span className="steps__text">To start again, stop the app by pressing Control-C in its Terminal window.</span>
        </li>
        <li>
          <span className="glyph num">2</span>
          <span className="steps__text">
            <span className="steps__lead">
              Then, in that same Terminal window, paste this and press Return. It lists what it will delete and asks you to type DELETE.
            </span>
            <span className="cmd">
              <code>{WIPE_COMMAND}</code>
              <button className="btn btn--sm" type="button" onClick={copy}>
                <Icon name="copy" />
                <span>{copied ? "Copied" : "Copy"}</span>
              </button>
            </span>
            <span className="field__hint" role="status">
              {failed ? WORDS.copyFailed : ""}
            </span>
          </span>
        </li>
        <li>
          <span className="glyph num">3</span>
          <span className="steps__text">Then run the app again and create a new password.</span>
        </li>
      </ol>
      <p className="label fine-print">
        It deletes everything in the app, including setup answers, the undo copy and AI keys. Export files on your Mac
        aren&apos;t touched. It downloads nothing and never asks for your Mac password. Only use this command from this
        screen.
      </p>
    </div>
  );
}

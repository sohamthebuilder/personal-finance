import type { ReactNode } from "react";
import { Icon } from "./icons.tsx";

const STEPS = ["Create password", "Add your export", "Set up", "Confirm"] as const;

export function Logo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect width="24" height="24" rx="7" fill="currentColor" />
      <path d="M7 16.5v-3M12 16.5v-6M17 16.5v-9" stroke="var(--logo-ink,#0C3A32)" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

/** The Task layout. `step` is 0 to 3 for the first-time flow, or null for log in, locked and the like. */
export function TaskFrame({ step, children }: { step: number | null; children: ReactNode }) {
  return (
    <div className="task">
      <aside className="rail">
        <div className="brand">
          <Logo />
          Personal Finance
        </div>
        {step !== null && (
          <ol className="rail-steps">
            {STEPS.map((name, index) => (
              <li
                key={name}
                className={`rail-step ${index === step ? "is-now" : index < step ? "is-done" : ""}`}
                aria-current={index === step ? "step" : undefined}
              >
                <span className="rail-step__dot">{index < step ? <Icon name="check" /> : index + 1}</span>
                <div>
                  <div className="rail-step__name">{name}</div>
                  {index < step && index === 0 && <div className="rail-step__detail">Created</div>}
                </div>
              </li>
            ))}
          </ol>
        )}
        <p className="rail__foot">
          <Icon name="lock" />
          <span>Everything stays on this Mac, locked with your password.</span>
        </p>
      </aside>
      <div>
        <div className="task__top">
          <div className="brand">
            <Logo />
            Personal Finance
          </div>
          {step !== null && (
            <>
              <div className="label mb-1">
                Step {step + 1} of 4 · {STEPS[step]}
              </div>
              <div className="meter">
                <div data-step={step + 1} />
              </div>
            </>
          )}
        </div>
        <div className="task__pane">
          <div className="task__body enter">{children}</div>
        </div>
      </div>
    </div>
  );
}

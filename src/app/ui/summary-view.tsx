import type { Summary } from "../../lib/data/update.ts";
import { countOf, groupIcon, grouped, longDate, rupees } from "./format.ts";
import { Icon } from "./icons.tsx";
import { SummaryActions } from "./summary-actions.tsx";

/** Screen 6: "Does this look right?" Every line the design lists, drawn on the server. */
export function SummaryView({ summary }: { summary: Summary }) {
  return (
    <>
      <h1>Does this look right?</h1>
      <p className="task__lede">Compare this with your Money Manager app before you carry on.</p>
      <div className="card">
        <div className="label">Net worth today</div>
        <div className="figure figure--display num mb-1">{rupees(summary.netWorth)}</div>
        <div className="muted">
          {countOf(summary.rows, "row", "rows")} from {longDate(summary.from)} to {longDate(summary.to)}
        </div>
        <ul className="list mt-4">
          {summary.groups.map((group) => (
            <li key={group.group}>
              <span className="with-glyph">
                <span className="glyph">
                  <Icon name={groupIcon(group.group)} />
                </span>
                <span>
                  {group.group}
                  <span className="muted"> · {grouped(group.accounts)}</span>
                </span>
              </span>
              <span className="num">{rupees(group.total)}</span>
            </li>
          ))}
        </ul>
      </div>
      {(summary.unmatchedTransfers > 0 || summary.futureRows > 0) && (
        <>
          {summary.unmatchedTransfers > 0 && (
            <div className="note note--warn mt-4">
              <Icon name="alert" />
              <div className="note__body">
                {summary.unmatchedTransfers === 1
                  ? "1 transfer has no partner. It gets its own line in the net worth breakdown."
                  : `${grouped(summary.unmatchedTransfers)} transfers have no partner. They get their own line in the net worth breakdown.`}
              </div>
            </div>
          )}
          {summary.futureRows > 0 && (
            <div className="note note--warn mt-4">
              <Icon name="alert" />
              <div className="note__body">
                {summary.futureRows === 1
                  ? "1 row is dated in the future. It counts from its date."
                  : `${grouped(summary.futureRows)} rows are dated in the future. They count from their date.`}
              </div>
            </div>
          )}
        </>
      )}
      <SummaryActions version={summary.version} />
    </>
  );
}

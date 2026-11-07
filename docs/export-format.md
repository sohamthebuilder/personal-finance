# Export format

This describes the shape of the export. It comes only from section 2 of `docs/PROJECT_BRIEF.md` and holds no values, account names or category names from any real file.

## Layout

- A true `.xlsx` file, confirmed by the owner's file type check on 2026-11-07.
- One sheet with 12 columns.
- There are no row IDs.
- **Read columns by position, never by name,** because `Accounts` appears twice.

| Position | Column | What's known |
|---|---|---|
| 1 | `Period` | Date and time, shown like `30/11/2026, 04:26:01` (day first) |
| 2 | `Accounts` | Account name |
| 3 | `Category` | |
| 4 | `Subcategory` | |
| 5 | `Note` | Free text, treated as untrusted |
| 6 | `INR` | The amount used for all maths. Positive for `Exp.` and `Transfer-Out` |
| 7 | `Income/Expense` | The row type |
| 8 | `Tag` | Effectively empty, so the app ignores it |
| 9 | `Description` | Effectively empty, so the app ignores it |
| 10 | `Amount` | Original amount, for reference |
| 11 | `Currency` | Original currency, for reference |
| 12 | `Accounts` | Also an account name. On a transfer it's the other account, confirmed by the owner |

Both sides of a foreign-currency transfer show the same `INR` amount.

The owner gave these details as text on 2026-11-07. No agent opened the file.

## Row types

| Row type | What it really is |
|---|---|
| `Exp.` | Real spending |
| `Income` | Salary and similar, mixed with market gain and loss rows |
| `Transfer-In` / `Transfer-Out` | Moves between the owner's own accounts, always in matching pairs. Neither income nor spending |
| `Income Balance` / `Expense Balance` | Manual "Modified Bal." corrections, not real income or spending |

Transfers pair up exactly and closed accounts come to zero, so balances and a net worth history can be rebuilt from the file.

## Traps

| # | Problem | How the app handles it |
|---|---|---|
| 1 | Market moves are logged as income, including losses as negative income | Treated as Investment returns, separate from earned income |
| 2 | Loans can be logged as income | Excluded from earned income |
| 3 | Balance corrections are large | Left out of income and spending, but shown openly in the net worth breakdown |
| 4 | Early history can be incomplete | Spending trends start from a date the owner chooses; net worth uses the full history |
| 5 | Rows can be dated in the future | Kept and flagged, and counted only once that date arrives |
| 6 | `Accounts` appears twice as a column | Columns are read by position, not by name |
| 7 | Mixed currencies | All maths uses the `INR` column; the original currency is shown for reference |
| 8 | Identical repeat rows can be genuine | Never de-duplicated, because removing them would break balances |
| 9 | Large one-off items distort trends | Kept in totals; drill-down makes them easy to see |

/**
 * What a page needs from the server before it draws. Pages are server-only;
 * nothing here reaches the browser except the fixed values returned.
 */
import { headers } from "next/headers";
import { type ReturnScreen, sessionFor, sessionStore, tokenFromCookieHeader, type Unlocked } from "../../lib/auth/session.ts";
import { type StartScreen, startScreen } from "../../lib/auth/start-screen.ts";
import { rangeLine, serverToday } from "../../lib/period.ts";

export async function pageToken(): Promise<string | null> {
  return tokenFromCookieHeader((await headers()).get("cookie"));
}

/** The server-chosen screen. A page load counts as use. */
export async function currentScreen(): Promise<{ start: StartScreen; token: string | null }> {
  const token = await pageToken();
  sessionFor(token, { touch: true });
  return { start: startScreen(token), token };
}

export interface ShellData {
  period: string;
  firstYear: number;
  today: string;
  /** The period's range line, such as "1 Apr to 30 Jun 2026". */
  range: string;
}

/** For a Shell page: remembers it as the return screen and reads what the header needs. */
export function shellData(token: string | null, screen: ReturnScreen): ShellData | null {
  const session: Unlocked | null = sessionFor(token, { touch: false });
  if (session === null) return null;
  sessionStore().returnTo = screen;
  const today = serverToday();
  let first: string | null = null;
  try {
    const row = session.db.prepare("SELECT min(occurred_at) AS first FROM import_rows").get() as { first: string | null } | undefined;
    if (row?.first) first = row.first.slice(0, 10);
  } catch {
    // No rows table: the picker offers this year only.
  }
  const firstYear = Number((first ?? today).slice(0, 4));
  return { period: session.period.kind, firstYear, today, range: rangeLine(session.period, today, first) };
}

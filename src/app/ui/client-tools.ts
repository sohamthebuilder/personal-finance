/** Small helpers for the page's own scripts. */

export interface Answer {
  status: number;
  body: Record<string, unknown>;
}

/**
 * Sends a small form to one of the app's routes. Network failure gives status 0.
 * The body goes as form text in the request body, never in the web address.
 */
export async function postForm(path: string, fields: Record<string, string>): Promise<Answer> {
  try {
    const response = await fetch(path, {
      method: "POST",
      body: new URLSearchParams(fields),
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
    });
    let body: Record<string, unknown> = {};
    try {
      body = (await response.json()) as Record<string, unknown>;
    } catch {
      body = {};
    }
    return { status: response.status, body };
  } catch {
    return { status: 0, body: {} };
  }
}

/** Clears the page at once and lets the server choose what shows next. */
export function leaveToStart(): void {
  document.body.replaceChildren();
  window.location.replace("/");
}

/** Characters, after the same Unicode form the server uses. */
export function characterCount(text: string): number {
  return Array.from(text.normalize("NFKC")).length;
}

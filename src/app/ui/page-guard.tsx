"use client";

import { useEffect } from "react";

/**
 * Back after a lock (S4-10, condition 34): a page Chrome restores from its
 * back/forward cache is cleared at once, and the server is asked again.
 */
export function PageGuard() {
  useEffect(() => {
    const onShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      document.body.replaceChildren();
      window.location.reload();
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);
  return null;
}

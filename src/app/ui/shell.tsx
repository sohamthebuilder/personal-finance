"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { leaveToStart, postForm } from "./client-tools.ts";
import { Icon, type IconName } from "./icons.tsx";
import { LogIn } from "./log-in.tsx";
import { PeriodPicker } from "./period-picker.tsx";
import { Logo, TaskFrame } from "./task-frame.tsx";

export type ShellScreen = "overview" | "upload" | "settings";

const NAV: Array<{ name: string; short: string; icon: IconName; href: string | null }> = [
  { name: "Overview", short: "Overview", icon: "home", href: "/" },
  // Built in Phases 6 to 8. Shown, but not links yet.
  { name: "Spending", short: "Spending", icon: "bars", href: null },
  { name: "Savings & Net worth", short: "Savings", icon: "trend", href: null },
  { name: "Accounts & Investments", short: "Accounts", icon: "bank", href: null },
];

const TITLES: Record<ShellScreen, string> = { overview: "Overview", upload: "Upload", settings: "Settings" };

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem("side") === "1";
  } catch {
    return false;
  }
}

/** Asks the server on focus, wake and every 30 seconds. Never counts as use. A lock clears the page. */
function useSessionWatch(onLocked: () => void) {
  useEffect(() => {
    let stopped = false;
    const check = async () => {
      if (stopped) return;
      try {
        const response = await fetch("/api/status", { cache: "no-store", credentials: "same-origin" });
        if (response.status === 401 && !stopped) onLocked();
      } catch {
        // The server can't be reached. A stopped server holds no key.
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    const timer = setInterval(check, 30_000);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearInterval(timer);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [onLocked]);
}

type LoggedOut = null | "pending" | "logout" | "unconfirmed";

/** Screen 7: the Shell layout with the shared header and navigation. */
export function Shell(props: {
  screen: ShellScreen;
  period: string;
  firstYear: number;
  today: string;
  /** The header's title, when a screen's stage changes it (screen 8). Fixed text only. */
  title?: string;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [menu, setMenu] = useState(false);
  const [loggedOut, setLoggedOut] = useState<LoggedOut>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => setCollapsed(readCollapsed()), []);
  useSessionWatch(leaveToStart);

  useEffect(() => {
    if (!menu) return;
    menuRef.current?.querySelector<HTMLElement>(".pop__opt")?.focus();
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenu(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menu]);

  function toggleSide() {
    const next = !collapsed;
    setCollapsed(next);
    try {
      window.localStorage.setItem("side", next ? "1" : "0");
    } catch {
      // The choice just isn't remembered.
    }
  }

  /** Clears at once, shows Locked, and says "logged out" only once the server confirms (S3-1). */
  async function logOut() {
    setLoggedOut("pending");
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const answer = await postForm("/api/logout", {});
      // 401: the server holds no session. 0: it can't be reached, and a stopped server holds no key.
      if (answer.status === 200 || answer.status === 401 || answer.status === 0) {
        setLoggedOut("logout");
        return;
      }
    }
    setLoggedOut("unconfirmed");
  }

  if (loggedOut !== null) {
    return (
      <TaskFrame step={null}>
        {loggedOut === "pending" ? <h1>Locked</h1> : <LogIn mode={{ kind: "locked", reason: loggedOut }} />}
      </TaskFrame>
    );
  }

  const title = props.title ?? TITLES[props.screen];
  return (
    <div className={`shell ${collapsed ? "is-collapsed" : ""}`}>
      <nav className="side" aria-label="Screens">
        <div className="brand">
          <Logo />
          <span className="side__text">Personal Finance</span>
        </div>
        {NAV.map((item) =>
          item.href ? (
            <a key={item.name} className="side__link" href={item.href} data-tip={item.name} aria-current={props.screen === "overview" ? "page" : undefined}>
              <Icon name={item.icon} />
              <span className="side__text">{item.name}</span>
            </a>
          ) : (
            <span key={item.name} className="side__link" data-tip={item.name} aria-disabled="true">
              <Icon name={item.icon} />
              <span className="side__text">{item.name}</span>
            </span>
          ),
        )}
        <button
          className="side__link side__toggle"
          type="button"
          data-tip="Expand sidebar"
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          onClick={toggleSide}
        >
          <Icon name="fold" />
          <span className="side__text">Collapse</span>
        </button>
      </nav>
      <div>
        <header className="top">
          <h1>{title}</h1>
          <PeriodPicker initial={props.period} firstYear={props.firstYear} today={props.today} />
          <a className="btn btn--sm only-wide" href="/upload" aria-current={props.screen === "upload" ? "page" : undefined}>
            <Icon name="upload" />
            Upload
          </a>
          <a className="btn btn--sm btn--quiet only-wide" href="/settings" aria-current={props.screen === "settings" ? "page" : undefined}>
            <Icon name="gear" />
            Settings
          </a>
          <button className="btn btn--sm btn--quiet only-wide" type="button" data-leave onClick={logOut}>
            <Icon name="out" />
            Log out
          </button>
          <a className="btn btn--sm btn--icon only-narrow" href="/upload" aria-label="Upload">
            <Icon name="upload" />
          </a>
          <div className="menu only-narrow" ref={menuRef} onKeyDown={(event) => event.key === "Escape" && setMenu(false)}>
            <button className="btn btn--sm btn--icon" type="button" aria-label="Settings and log out" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(!menu)}>
              <Icon name="more" />
            </button>
            {menu && (
              <div className="pop" role="menu">
                <a className="pop__opt" role="menuitem" href="/settings">
                  <span>Settings</span>
                </a>
                <button className="pop__opt" role="menuitem" type="button" data-leave onClick={logOut}>
                  <span>Log out</span>
                </button>
              </div>
            )}
          </div>
        </header>
        <main className="page">{props.children}</main>
      </div>
      <nav className="tabbar" aria-label="Screens">
        {NAV.map((item) =>
          item.href ? (
            <a key={item.name} href={item.href} aria-current={props.screen === "overview" ? "page" : undefined}>
              <Icon name={item.icon} />
              {item.short}
            </a>
          ) : (
            <a key={item.name} aria-disabled="true">
              <Icon name={item.icon} />
              {item.short}
            </a>
          ),
        )}
      </nav>
    </div>
  );
}

import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./system.css";
import "./fonts.css";
import { IconSprite } from "./ui/icons.tsx";
import { PageGuard } from "./ui/page-guard.tsx";

// Pages must render per request so that each one gets its own nonce.
export const dynamic = "force-dynamic";

// A fixed name for every screen. Nothing from a file or a request ever goes in the tab title.
export const metadata: Metadata = {
  title: "Personal Finance",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <IconSprite />
        <PageGuard />
        {children}
      </body>
    </html>
  );
}

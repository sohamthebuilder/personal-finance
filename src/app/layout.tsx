import type { Metadata } from "next";
import type { ReactNode } from "react";

// Pages must render per request so that each one gets its own nonce.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Personal Finance",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "LSAT Drill",
  description: "Local-only LSAT wrong-question bank and drill trainer.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <div className="brand">
            <span className="dot" /> LSAT Drill
          </div>
          <nav className="nav">
            <Link href="/">Drill</Link>
            <Link href="/manage">Manage wrong questions</Link>
          </nav>
          <div className="local-badge" title="All data stays in ./data/lsat.db on this machine">
            local · offline
          </div>
        </header>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}

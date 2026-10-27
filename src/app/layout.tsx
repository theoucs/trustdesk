import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import Link from "next/link";
import { Nav } from "@/components/nav";
import "./globals.css";

const plexSans = IBM_Plex_Sans({ variable: "--font-plex-sans", subsets: ["latin"], weight: ["400", "500", "600"] });
const plexMono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: { default: "Trustdesk", template: "%s · Trustdesk" },
  description: "Draft security questionnaire and RFP answers from your documentation, with sources.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${plexSans.variable} ${plexMono.variable} antialiased`}>
      <body className="min-h-screen flex flex-col">
        <header className="sticky top-0 z-10 border-b border-border bg-surface">
          <div className="mx-auto flex h-14 max-w-6xl items-center gap-8 px-4 sm:px-6">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <span aria-hidden className="grid h-6 w-6 place-items-center rounded-[5px] bg-accent text-[11px] font-semibold text-white">
                T
              </span>
              Trustdesk
            </Link>
            <Nav />
            <span className="ml-auto hidden text-xs text-muted sm:block">Workspace: Vantrel</span>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">{children}</main>
        <footer className="border-t border-border">
          <div className="mx-auto max-w-6xl px-4 py-5 text-xs text-muted sm:px-6">
            Demo workspace. Vantrel is a fictional company and its documentation is made up. Built by{" "}
            <a className="underline hover:text-text" href="https://tblabs.dev">
              Théo Bodart
            </a>
            .
          </div>
        </footer>
      </body>
    </html>
  );
}

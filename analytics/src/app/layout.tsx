import type { Metadata } from "next";
import { Newsreader, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { CommandPaletteProvider } from "@/components/CommandPaletteProvider";
import AIPanel from "@/components/AIPanel";

/* Three type voices. Each is exposed under its own CSS variable; globals.css
   composes them into --font-serif / --font-sans / --font-mono with fallbacks.
   Do NOT bind next/font directly to --font-mono etc. — the generated class
   sits on <html> at the same specificity as :root, so it would race with the
   token layer instead of feeding it. */
const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
  weight: ["400", "500", "600"],
  display: "swap",
});

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  variable: "--font-plex-sans",
  weight: ["400", "500", "600"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-plex-mono",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "HireFeed Analytics",
  description: "Real-time job market intelligence dashboard",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${newsreader.variable} ${plexSans.variable} ${plexMono.variable}`}
    >
      <body>
        <CommandPaletteProvider>
          {children}
          <AIPanel />
        </CommandPaletteProvider>
      </body>
    </html>
  );
}

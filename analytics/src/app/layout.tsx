import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { CommandPaletteProvider } from "@/components/CommandPaletteProvider";
import AIPanel from "@/components/AIPanel";

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
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
    <html lang="en" className={jetbrainsMono.variable}>
      <body>
        <CommandPaletteProvider>
          {children}
          <AIPanel />
        </CommandPaletteProvider>
      </body>
    </html>
  );
}

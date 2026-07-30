"use client";

import { useAuth } from "@/hooks/useAuth";
import { JobsDashboard } from "@/components/JobsDashboard";
import Link from "next/link";
import { useState, useEffect } from "react";
import {
  CircleNotch,
  ArrowRight,
  LinkedinLogo,
  GithubLogo,
  Buildings,
  Briefcase,
  Sparkle,
  Lightning,
  FileText,
  Bell,
} from "@phosphor-icons/react";
import { Kicker, StatusBadge, dsButtonVariants } from "@/components/ds";
import { cn } from "@/lib/utils";

const SOURCES = [
  { icon: LinkedinLogo, label: "LinkedIn" },
  { icon: GithubLogo, label: "GitHub" },
  { icon: Buildings, label: "MathWorks" },
  { icon: Briefcase, label: "Jobright" },
  { icon: Sparkle, label: "Custom ATS" },
];

const CAPABILITIES = [
  {
    label: "SOURCES",
    rows: ["LinkedIn", "GitHub", "MathWorks", "Jobright", "Custom ATS / Greenhouse"],
    icon: Lightning,
  },
  {
    label: "INTELLIGENCE",
    rows: ["AI job analysis", "Resume matching", "Keyword filtering", "Company blocking"],
    icon: FileText,
  },
  {
    label: "DELIVERY",
    rows: ["Real-time WebSocket push", "Magic link auth", "Personal job feed", "Save & dismiss"],
    icon: Bell,
  },
];

const FEED_JOBS = [
  { company: "Google",     role: "Software Engineer III",   src: "LI", age: "0:12" },
  { company: "Meta",       role: "ML Engineer, Core AI",    src: "GH", age: "0:34" },
  { company: "Stripe",     role: "Frontend Engineer",       src: "JR", age: "1:05" },
  { company: "Apple",      role: "iOS Platform Engineer",   src: "LI", age: "1:22" },
  { company: "OpenAI",     role: "Research Engineer",       src: "CS", age: "2:41" },
  { company: "Microsoft",  role: "Senior SWE, Azure",       src: "LI", age: "3:18" },
  { company: "Palantir",   role: "SWE, Forward Deployed",   src: "CS", age: "4:02" },
  { company: "Anthropic",  role: "Infrastructure Engineer", src: "GH", age: "5:11" },
  { company: "Figma",      role: "Backend Engineer",        src: "JR", age: "6:33" },
  { company: "MathWorks",  role: "Software Dev Engineer",   src: "MW", age: "7:45" },
];

const ACTIVITY = [8, 14, 10, 22, 18, 28, 24, 19, 32, 27, 15, 36, 40, 33, 28, 43, 37, 50, 46, 40, 52, 44, 38, 55];

const SOURCE_CODES = ["LI", "GH", "MW", "JR", "CS"];

const FEED_GRID = "grid-cols-[1fr_1.5fr_36px_46px]";

/** The live wire: an editorial data table that fills as postings land. */
function LiveFeedPanel() {
  const [visible, setVisible] = useState(3);
  const [countdown, setCountdown] = useState(154);
  const [totalIndexed, setTotalIndexed] = useState(1247);

  useEffect(() => {
    // Stream in job rows one at a time
    if (visible < FEED_JOBS.length) {
      const t = setTimeout(() => setVisible((v) => v + 1), visible < 5 ? 600 : 1400);
      return () => clearTimeout(t);
    }
  }, [visible]);

  useEffect(() => {
    const t = setInterval(() => {
      setCountdown((c) => (c <= 0 ? 180 : c - 1));
      setTotalIndexed((n) => n + Math.floor(Math.random() * 3));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  const metrics = [
    { label: "Scan rate", value: "847", unit: "/hr", tone: "text-ink" },
    { label: "Next scan", value: fmt(countdown), unit: "", tone: "text-brick" },
    { label: "Uptime", value: "99.9", unit: "%", tone: "text-forest" },
  ];

  return (
    <div className="hidden h-full flex-col overflow-hidden border-l border-hairline bg-paper-card lg:flex">
      {/* Panel header */}
      <div className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3">
        <StatusBadge label="Live feed" tone="complete" live />
        <div className="flex items-center gap-3">
          <Kicker className="text-ink-faint">{totalIndexed.toLocaleString()} indexed</Kicker>
          <span aria-hidden className="h-3 w-px bg-hairline-strong" />
          <Kicker className="text-ink-faint">5 sources</Kicker>
        </div>
      </div>

      {/* Column headers */}
      <div className={`grid gap-2 border-b border-hairline bg-paper-sunk px-4 py-2 ${FEED_GRID}`}>
        <Kicker>Company</Kicker>
        <Kicker>Role</Kicker>
        <Kicker>Src</Kicker>
        <Kicker className="text-right">Ago</Kicker>
      </div>

      {/* Job rows */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {FEED_JOBS.slice(0, visible).map((job, i) => (
          <div
            key={job.company}
            className={`animate-job-enter grid items-center gap-2 border-b border-hairline px-4 py-2.5 transition-colors duration-[120ms] hover:bg-paper-sunk ${FEED_GRID}`}
          >
            <div className="flex min-w-0 items-center gap-1.5">
              {i === 0 && (
                <span aria-hidden className="size-1 shrink-0 bg-brick" />
              )}
              <span
                className={`truncate font-serif text-[15px] leading-tight ${
                  i === 0 ? "font-semibold text-ink" : "text-ink-2"
                }`}
              >
                {job.company}
              </span>
            </div>
            <span className="truncate font-sans text-[13px] text-ink-muted">{job.role}</span>
            <span className="font-mono text-[11px] uppercase tracking-[0.09em] text-ink-muted">
              {job.src}
            </span>
            <span className="text-right font-mono text-[11px] tabular-nums text-ink-faint">
              {job.age}
            </span>
          </div>
        ))}

        {/* Blinking cursor row — terminal-authentic loading state */}
        {visible < FEED_JOBS.length && (
          <div className="flex items-center gap-2 border-b border-hairline px-4 py-2.5">
            <span aria-hidden className="animate-cursor-blink font-mono text-[13px] leading-none text-brick">
              &#9608;
            </span>
            <Kicker>Scanning</Kicker>
          </div>
        )}
      </div>

      {/* Metrics footer */}
      <div className="border-t border-hairline">
        <div className="grid grid-cols-3 border-b border-hairline">
          {metrics.map(({ label, value, unit, tone }, i) => (
            <div
              key={label}
              className={`px-4 py-3 ${i < 2 ? "border-r border-hairline" : ""}`}
            >
              <Kicker className="mb-1.5">{label}</Kicker>
              <p className={`font-serif text-[22px] font-semibold leading-none tabular-nums ${tone}`}>
                {value}
                {unit && (
                  <span className="ml-0.5 font-mono text-[11px] font-normal text-ink-faint">
                    {unit}
                  </span>
                )}
              </p>
            </div>
          ))}
        </div>

        {/* Activity sparkline */}
        <div className="px-4 py-3">
          <Kicker className="mb-2">Activity &middot; 24hr</Kicker>
          <div className="flex h-7 items-end gap-px">
            {ACTIVITY.map((h, i) => {
              const isLast = i === ACTIVITY.length - 1;
              return (
                <div
                  key={i}
                  className={`min-h-[2px] flex-1 transition-all duration-700 ${
                    isLast ? "bg-brick" : "bg-hairline-strong"
                  }`}
                  style={{ height: `${(h / 55) * 100}%` }}
                />
              );
            })}
          </div>
          <div className="mt-1.5 flex justify-between">
            <Kicker className="text-ink-faint">-24h</Kicker>
            <Kicker className="text-ink-faint">Now</Kicker>
          </div>
        </div>

        {/* Source status row */}
        <div className="flex flex-wrap items-center gap-3 border-t border-hairline px-4 py-2.5">
          {SOURCE_CODES.map((name) => (
            <span key={name} className="flex items-center gap-1.5">
              <span aria-hidden className="size-1 shrink-0 rounded-full bg-ink-faint" />
              <Kicker>{name}</Kicker>
            </span>
          ))}
          <StatusBadge label="All online" tone="complete" className="ml-auto" />
        </div>
      </div>
    </div>
  );
}

/** Compact proof strip for viewports that hide the full live-feed panel. */
function CompactFeedProof() {
  return (
    <div className="border-t border-hairline bg-paper-card lg:hidden">
      <div className="flex items-center justify-between gap-3 border-b border-hairline px-5 py-3">
        <StatusBadge label="Live feed" tone="complete" live />
        <Kicker className="text-ink-faint">5 sources online</Kicker>
      </div>
      <div className="divide-y divide-hairline">
        {FEED_JOBS.slice(0, 4).map((job, i) => (
          <div key={job.company} className="flex items-baseline justify-between gap-3 px-4 py-2.5 sm:px-5">
            <div className="min-w-0 flex-1">
              <div
                className={`truncate font-serif text-[15px] leading-tight ${
                  i === 0 ? "font-semibold text-ink" : "text-ink-2"
                }`}
              >
                {job.company}
              </div>
              <div className="truncate font-sans text-[13px] text-ink-muted">
                {job.role}
              </div>
            </div>
            <span className="shrink-0 font-mono text-[11px] tabular-nums text-ink-faint">
              {job.age}
            </span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-3 border-t border-hairline">
        {[
          { label: "Scan rate", value: "847/hr" },
          { label: "Indexed", value: "1.2k" },
          { label: "Uptime", value: "99.9%" },
        ].map(({ label, value }, i) => (
          <div
            key={label}
            className={`px-4 py-3 ${i < 2 ? "border-r border-hairline" : ""}`}
          >
            <Kicker className="mb-1">{label}</Kicker>
            <p className="font-serif text-[18px] font-semibold leading-none tabular-nums text-ink">
              {value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Home() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-paper" role="status" aria-label="Loading">
        <CircleNotch className="size-6 animate-spin text-brick" />
      </div>
    );
  }

  if (user) {
    return <JobsDashboard />;
  }

  return (
    <div className="flex min-h-dvh flex-col bg-paper text-ink">
      {/* Masthead */}
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-hairline px-4 py-4 pt-[max(1rem,env(safe-area-inset-top))] sm:gap-4 sm:px-5">
        <div className="flex min-w-0 items-baseline gap-3 sm:gap-4">
          <span className="font-serif text-[19px] font-semibold leading-none text-ink">
            HireFeed<span className="text-brick">.</span>
          </span>
          <Kicker className="hidden sm:block">Job Intelligence Desk</Kicker>
        </div>
        <div className="flex shrink-0 items-center gap-3 sm:gap-5">
          <StatusBadge label="Live" tone="complete" live className="hidden sm:inline-flex" />
          <Link
            href="/login"
            className="flex min-h-11 items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.09em] text-ink-2 transition-colors duration-[120ms] hover:text-brick focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brick/40 rounded-[4px]"
          >
            Sign in
            <ArrowRight className="size-3" />
          </Link>
        </div>
      </header>

      {/* Hero — copy leads; feed proof sits beside on lg+ and below on narrow */}
      <section className="grid grid-cols-1 border-b border-hairline lg:min-h-[560px] lg:grid-cols-[1fr_minmax(360px,440px)] xl:grid-cols-[1fr_500px]">
        <div className="flex flex-col justify-center gap-8 px-4 pb-10 pt-10 sm:px-5 sm:pt-12 lg:border-r lg:border-hairline lg:py-14">
          <div>
            <h1 className="mb-5 max-w-[16ch] font-serif text-[32px] font-semibold leading-[1.08] tracking-[-0.01em] text-ink sm:text-[46px] lg:text-[56px]">
              Every opening, the minute it posts.
            </h1>
            <p className="mb-8 max-w-[52ch] font-sans text-[17px] leading-relaxed text-ink-2">
              HireFeed watches LinkedIn, GitHub, MathWorks and your own ATS boards,
              reads each posting, and files it to your feed as it lands. You stop
              searching.
            </p>

            <div className="mb-8 flex flex-wrap gap-2">
              {SOURCES.map(({ label, icon: Icon }) => (
                <span
                  key={label}
                  className="inline-flex items-center gap-2 rounded-[4px] border border-hairline bg-paper-card px-3 py-1.5"
                >
                  <Icon className="size-[14px] shrink-0 text-ink-muted" />
                  <span className="font-mono text-[11px] uppercase tracking-[0.09em] text-ink-2">
                    {label}
                  </span>
                </span>
              ))}
            </div>

            <Link href="/login" className={cn(dsButtonVariants({ variant: "primary" }))}>
              Get access
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>

        <LiveFeedPanel />
        <CompactFeedProof />
      </section>

      {/* Capabilities table */}
      <section className="border-b border-hairline">
        <div className="border-b border-hairline px-5 py-3">
          <Kicker as="h2">Capabilities</Kicker>
        </div>
        <div className="grid grid-cols-1 divide-y divide-hairline sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {CAPABILITIES.map(({ label, rows, icon: Icon }) => (
            <div key={label} className="px-5 py-6">
              <div className="mb-4 flex items-center gap-2">
                <Icon className="size-4 shrink-0 text-ink-muted" />
                <Kicker as="h3">{label}</Kicker>
              </div>
              <ul className="space-y-2.5">
                {rows.map((row) => (
                  <li key={row} className="flex items-baseline gap-2.5">
                    <span aria-hidden className="mt-2 size-1 shrink-0 bg-ink-faint" />
                    <span className="font-sans text-[15px] leading-snug text-ink-2">{row}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* Secondary CTA strip */}
      <section className="flex flex-col items-start justify-between gap-5 border-b border-hairline px-5 py-6 sm:flex-row sm:items-center">
        <p className="max-w-[46ch] font-sans text-[15px] leading-relaxed text-ink-2">
          Passwordless access. Magic link only. Your feed starts the moment you sign in.
        </p>
        <Link href="/login" className={cn(dsButtonVariants({ variant: "secondary" }), "shrink-0")}>
          Sign in / Register
          <ArrowRight className="size-4" />
        </Link>
      </section>

      {/* Footer */}
      <footer className="mt-auto flex shrink-0 items-center justify-between gap-4 border-t border-hairline px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <Kicker>Powered by DeepSeek + Supabase</Kicker>
        <Kicker>&copy; 2026 HireFeed</Kicker>
      </footer>
    </div>
  );
}

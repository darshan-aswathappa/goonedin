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

const MONO: React.CSSProperties = {
  fontFamily: "var(--font-ibm-mono), 'Courier New', monospace",
};

const SOURCES = [
  { icon: LinkedinLogo, label: "LinkedIn", dot: "#0A66C2" },
  { icon: GithubLogo, label: "GitHub", dot: "#888" },
  { icon: Buildings, label: "MathWorks", dot: "#ED1C24" },
  { icon: Briefcase, label: "Jobright", dot: "#5465FF" },
  { icon: Sparkle, label: "Custom ATS", dot: "#FF6E00" },
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
  { company: "Google",     role: "Software Engineer III",      src: "LI",  srcColor: "#0A66C2", age: "0:12" },
  { company: "Meta",       role: "ML Engineer, Core AI",       src: "GH",  srcColor: "#888",    age: "0:34" },
  { company: "Stripe",     role: "Frontend Engineer",          src: "JR",  srcColor: "#5465FF", age: "1:05" },
  { company: "Apple",      role: "iOS Platform Engineer",      src: "LI",  srcColor: "#0A66C2", age: "1:22" },
  { company: "OpenAI",     role: "Research Engineer",          src: "CS",  srcColor: "#FF6E00", age: "2:41" },
  { company: "Microsoft",  role: "Senior SWE, Azure",          src: "LI",  srcColor: "#0A66C2", age: "3:18" },
  { company: "Palantir",   role: "SWE, Forward Deployed",      src: "CS",  srcColor: "#FF6E00", age: "4:02" },
  { company: "Anthropic",  role: "Infrastructure Engineer",    src: "GH",  srcColor: "#888",    age: "5:11" },
  { company: "Figma",      role: "Backend Engineer",           src: "JR",  srcColor: "#5465FF", age: "6:33" },
  { company: "MathWorks",  role: "Software Dev Engineer",      src: "MW",  srcColor: "#ED1C24", age: "7:45" },
];

const ACTIVITY = [8, 14, 10, 22, 18, 28, 24, 19, 32, 27, 15, 36, 40, 33, 28, 43, 37, 50, 46, 40, 52, 44, 38, 55];

function TerminalPanel() {
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

  return (
    <div
      className="hidden lg:flex flex-col h-full"
      style={{ borderLeft: "1px solid #1A1A1A", background: "#020202" }}
    >
      {/* Panel header */}
      <div
        className="px-4 py-2.5 flex items-center justify-between"
        style={{ borderBottom: "1px solid #1A1A1A", background: "#060606" }}
      >
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 bg-[#00B050] animate-pulse" />
          <span className="text-[#00B050] text-[9px] tracking-[0.22em] uppercase font-bold">LIVE FEED</span>
        </div>
        <div className="flex items-center gap-3 text-[#333] text-[9px] tracking-[0.15em] uppercase">
          <span>{totalIndexed.toLocaleString()} INDEXED</span>
          <span className="text-[#1A1A1A]">│</span>
          <span>5 SOURCES</span>
        </div>
      </div>

      {/* Column headers */}
      <div
        className="px-4 py-1.5 grid gap-2"
        style={{
          gridTemplateColumns: "1fr 1.5fr 36px 42px",
          borderBottom: "1px solid #141414",
          background: "#040404",
        }}
      >
        {["COMPANY", "ROLE", "SRC", "AGO"].map((h, i) => (
          <span
            key={h}
            className="text-[#FF6E00] uppercase font-bold"
            style={{ fontSize: "8px", letterSpacing: "0.2em", textAlign: i === 3 ? "right" : "left" }}
          >
            {h}
          </span>
        ))}
      </div>

      {/* Job rows */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {FEED_JOBS.slice(0, visible).map((job, i) => (
          <div
            key={i}
            className="px-4 py-2.5 grid gap-2 transition-colors"
            style={{
              gridTemplateColumns: "1fr 1.5fr 36px 42px",
              borderBottom: "1px solid #0A0A0A",
              animation: "job-enter 0.35s cubic-bezier(0.25,1,0.5,1) both",
              animationDelay: "0ms",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "#080808"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              {i === 0 && (
                <span className="text-[#FF6E00] shrink-0" style={{ fontSize: "8px" }}>►</span>
              )}
              <span
                className="truncate"
                style={{ fontSize: "10px", color: i === 0 ? "#FFFFFF" : "#888", fontWeight: i === 0 ? 700 : 400 }}
              >
                {job.company}
              </span>
            </div>
            <span className="truncate" style={{ fontSize: "10px", color: "#555" }}>{job.role}</span>
            <span className="font-bold" style={{ fontSize: "9px", color: job.srcColor, letterSpacing: "0.05em" }}>
              {job.src}
            </span>
            <span className="text-right tabular-nums" style={{ fontSize: "9px", color: "#2A2A2A" }}>
              {job.age}
            </span>
          </div>
        ))}

        {/* Blinking cursor row */}
        {visible < FEED_JOBS.length && (
          <div className="px-4 py-2.5 flex items-center gap-1" style={{ borderBottom: "1px solid #0A0A0A" }}>
            <span className="text-[#FF6E00] animate-cursor-blink" style={{ fontSize: "10px" }}>█</span>
            <span className="text-[#222]" style={{ fontSize: "9px", letterSpacing: "0.15em" }}>SCANNING...</span>
          </div>
        )}
      </div>

      {/* Metrics footer */}
      <div style={{ borderTop: "1px solid #1A1A1A" }}>
        <div className="grid grid-cols-3" style={{ borderBottom: "1px solid #111" }}>
          {[
            { label: "SCAN RATE", value: "847", unit: "/hr", color: "#888" },
            { label: "NEXT SCAN", value: fmt(countdown), unit: "", color: "#FF6E00" },
            { label: "UPTIME",    value: "99.9",  unit: "%",  color: "#00B050" },
          ].map(({ label, value, unit, color }, i) => (
            <div
              key={label}
              className="px-3 py-3"
              style={{ borderRight: i < 2 ? "1px solid #111" : "none" }}
            >
              <p className="uppercase mb-1" style={{ fontSize: "8px", color: "#333", letterSpacing: "0.15em" }}>
                {label}
              </p>
              <p className="font-bold tabular-nums" style={{ fontSize: "12px", color }}>
                {value}
                {unit && <span style={{ fontSize: "8px", color: "#444", fontWeight: 400 }}>{unit}</span>}
              </p>
            </div>
          ))}
        </div>

        {/* Activity sparkline */}
        <div className="px-3 py-3">
          <p className="uppercase mb-2" style={{ fontSize: "8px", color: "#2A2A2A", letterSpacing: "0.15em" }}>
            ACTIVITY · 24HR
          </p>
          <div className="flex items-end gap-px" style={{ height: "28px" }}>
            {ACTIVITY.map((h, i) => {
              const isLast = i === ACTIVITY.length - 1;
              const pct = (h / 55) * 100;
              return (
                <div
                  key={i}
                  className="flex-1 transition-all duration-700"
                  style={{
                    height: `${pct}%`,
                    minHeight: "2px",
                    background: isLast ? "#FF6E00" : i > ACTIVITY.length - 4 ? "#2A2A2A" : "#1A1A1A",
                  }}
                />
              );
            })}
          </div>
          <div className="flex justify-between mt-1">
            <span style={{ fontSize: "8px", color: "#1A1A1A" }}>-24H</span>
            <span style={{ fontSize: "8px", color: "#1A1A1A" }}>NOW</span>
          </div>
        </div>

        {/* Source status row */}
        <div
          className="px-3 py-2 flex items-center gap-2 flex-wrap"
          style={{ borderTop: "1px solid #0F0F0F" }}
        >
          {[
            { name: "LI", color: "#0A66C2" },
            { name: "GH", color: "#888" },
            { name: "MW", color: "#ED1C24" },
            { name: "JR", color: "#5465FF" },
            { name: "CS", color: "#FF6E00" },
          ].map(({ name, color }) => (
            <div key={name} className="flex items-center gap-1">
              <div className="w-1 h-1 rounded-full animate-pulse" style={{ background: color }} />
              <span style={{ fontSize: "8px", color: "#333", letterSpacing: "0.1em" }}>{name}</span>
            </div>
          ))}
          <span className="ml-auto" style={{ fontSize: "8px", color: "#1E1E1E", letterSpacing: "0.12em" }}>
            ALL ONLINE
          </span>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#000" }}>
        <CircleNotch weight="bold" className="h-6 w-6 animate-spin" style={{ color: "#FF6E00" }} />
      </div>
    );
  }

  if (user) {
    return <JobsDashboard />;
  }

  return (
    <div className="min-h-screen bg-[#000] text-white flex flex-col" style={MONO}>

      {/* Top bar */}
      <div
        className="shrink-0 px-5 py-2.5 flex items-center justify-between"
        style={{ borderBottom: "1px solid #1E1E1E" }}
      >
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 bg-[#FF6E00]" />
          <span className="text-[#FF6E00] text-[11px] font-bold tracking-[0.22em] uppercase">HIREFEED</span>
          <span className="text-[#2A2A2A] text-xs mx-1">│</span>
          <span className="text-[#444] text-[10px] tracking-[0.15em] uppercase">Job Intelligence Platform</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 bg-[#00B050] animate-pulse" />
            <span className="text-[#00B050] text-[9px] tracking-[0.2em] uppercase">LIVE</span>
          </div>
          <Link
            href="/login"
            className="flex items-center gap-1.5 text-[#FF6E00] text-[9px] tracking-[0.18em] uppercase hover:text-[#FF8A00] transition-colors"
          >
            SIGN IN
            <ArrowRight weight="bold" className="h-3 w-3" />
          </Link>
        </div>
      </div>

      {/* Hero — two columns */}
      <div
        className="grid grid-cols-1 lg:grid-cols-[1fr_420px] xl:grid-cols-[1fr_480px]"
        style={{ borderBottom: "1px solid #1A1A1A", minHeight: "520px" }}
      >
        {/* Left: copy */}
        <div
          className="px-5 pt-14 pb-10 flex flex-col justify-between"
          style={{ borderRight: "1px solid #1A1A1A" }}
        >
          <div>
            <p className="text-[#FF6E00] text-[9px] tracking-[0.3em] uppercase mb-4">
              REAL-TIME JOB FEED
            </p>
            <h1 className="text-4xl sm:text-5xl font-bold uppercase tracking-tight text-white leading-[1.05] mb-5">
              Job Extraction<br />
              Engine
            </h1>
            <p className="text-[#666] text-sm leading-relaxed max-w-md mb-8">
              Track thousands of openings across LinkedIn, GitHub, MathWorks &amp; custom sources —
              AI-analyzed and delivered in real-time. No manual searching.
            </p>

            <div className="flex flex-wrap gap-1.5 mb-10">
              {SOURCES.map(({ label, dot }) => (
                <div
                  key={label}
                  className="flex items-center gap-2 px-2.5 py-1.5"
                  style={{ border: "1px solid #1A1A1A", background: "#050505" }}
                >
                  <div className="w-1.5 h-1.5 shrink-0" style={{ background: dot }} />
                  <span className="text-[#777] text-[9px] uppercase tracking-[0.18em]">{label}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <Link href="/login">
              <button
                className="flex items-center gap-2 px-6 py-3.5 text-black font-bold text-[10px] tracking-[0.22em] uppercase transition-colors"
                style={{ background: "#FF6E00" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#FF8A00"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#FF6E00"; }}
              >
                GET ACCESS
                <ArrowRight weight="bold" className="h-3.5 w-3.5" />
              </button>
            </Link>
          </div>
        </div>

        {/* Right: terminal panel */}
        <TerminalPanel />
      </div>

      {/* Capabilities table */}
      <div style={{ borderBottom: "1px solid #1A1A1A" }}>
        <div className="px-5 py-3" style={{ borderBottom: "1px solid #1A1A1A" }}>
          <span className="text-[#FF6E00] text-[9px] tracking-[0.25em] uppercase">CAPABILITIES</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3">
          {CAPABILITIES.map(({ label, rows, icon: Icon }, i) => (
            <div
              key={label}
              className="px-5 py-5"
              style={{ borderRight: i < CAPABILITIES.length - 1 ? "1px solid #1A1A1A" : "none" }}
            >
              <div className="flex items-center gap-2 mb-4">
                <Icon weight="bold" className="h-3 w-3 text-[#FF6E00]" />
                <span className="text-[#FF6E00] text-[9px] tracking-[0.22em] uppercase font-bold">{label}</span>
              </div>
              <div className="space-y-2">
                {rows.map((row) => (
                  <div key={row} className="flex items-center gap-2">
                    <span className="text-[#1E1E1E] text-[9px]">—</span>
                    <span className="text-[#666] text-[11px] tracking-wide">{row}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Secondary CTA strip */}
      <div
        className="px-5 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
        style={{ borderBottom: "1px solid #1A1A1A" }}
      >
        <p className="text-[#444] text-[11px] leading-relaxed max-w-sm">
          Passwordless access. Magic link only. Your personal feed starts the moment you sign in.
        </p>
        <Link href="/login">
          <button
            className="shrink-0 px-5 py-2.5 text-[#FF6E00] text-[9px] font-bold tracking-[0.2em] uppercase transition-colors"
            style={{ border: "1px solid #2A2A2A" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#FF6E00"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#2A2A2A"; }}
          >
            SIGN IN / REGISTER →
          </button>
        </Link>
      </div>

      {/* Footer */}
      <div
        className="shrink-0 px-5 py-1.5 flex items-center justify-between"
        style={{ borderTop: "1px solid #111" }}
      >
        <span className="text-[#222] text-[9px] tracking-[0.18em] uppercase">Powered by DeepSeek + Supabase</span>
        <span className="text-[#222] text-[9px] tracking-[0.18em] uppercase">© 2025 HireFeed</span>
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import {
  Briefcase,
  Sparkle,
  ArrowRight,
  X,
  LinkedinLogo,
  GithubLogo,
  Buildings,
  Gear,
  Terminal,
} from "@phosphor-icons/react";
import Link from "next/link";

const ONBOARDING_KEY = "hirefeed-onboarding-v1";

interface OnboardingModalProps {
  userEmail?: string;
}

export function OnboardingModal({ userEmail }: OnboardingModalProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    try {
      const completed = localStorage.getItem(ONBOARDING_KEY);
      if (!completed) {
        const t = setTimeout(() => setOpen(true), 600);
        return () => clearTimeout(t);
      }
    } catch {
      // localStorage unavailable — skip onboarding
    }
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(ONBOARDING_KEY, "completed");
    } catch {}
    setOpen(false);
  };

  if (!open) return null;

  const steps = ["INIT", "PROCESS", "READY"];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
      <div
        className="w-full max-w-lg bg-[#000] border border-[#1E1E1E] relative"
        style={{ fontFamily: "var(--font-ibm-mono), 'Courier New', monospace" }}
      >
        {/* Terminal title bar */}
        <div className="border-b border-[#1E1E1E] px-4 py-2.5 flex items-center justify-between bg-[#080808]">
          <div className="flex items-center gap-2.5">
            <Terminal weight="bold" className="h-3.5 w-3.5 text-[#FF6E00]" />
            <span className="text-[#FF6E00] text-[10px] font-bold tracking-[0.22em] uppercase">HIREFEED</span>
            <span className="text-[#222] text-xs mx-0.5">│</span>
            <span className="text-[#444] text-[9px] tracking-[0.18em] uppercase">System Initialization</span>
          </div>
          <button
            onClick={dismiss}
            className="text-[#444] hover:text-[#FF6E00] transition-colors p-0.5"
            aria-label="Skip onboarding"
          >
            <X weight="bold" className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Step tabs */}
        <div className="flex border-b border-[#1A1A1A]">
          {steps.map((label, i) => (
            <div
              key={i}
              className={`flex-1 px-3 py-2 text-center border-r border-[#1A1A1A] last:border-r-0 transition-colors ${
                i < step
                  ? "bg-[#080808] text-[#FF6E00]"
                  : i === step
                  ? "bg-[#0C0800] text-[#FF6E00] border-b-2 border-b-[#FF6E00]"
                  : "bg-[#030303] text-[#2A2A2A]"
              }`}
            >
              <span className="text-[9px] tracking-[0.18em] uppercase font-bold">
                {i < step ? "✓ " : i === step ? "► " : "  "}
                {label}
              </span>
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="p-6 min-h-[300px] flex flex-col">
          {step === 0 && <StepWelcome userEmail={userEmail} />}
          {step === 1 && <StepHowItWorks />}
          {step === 2 && <StepGetStarted onDone={dismiss} />}
        </div>

        {/* Navigation */}
        {step < 2 && (
          <div className="border-t border-[#141414] px-5 py-3 flex items-center justify-between bg-[#040404]">
            <button
              onClick={dismiss}
              className="text-[#333] text-[9px] tracking-[0.2em] uppercase hover:text-[#FF6E00] transition-colors"
            >
              SKIP SETUP
            </button>
            <button
              onClick={() => setStep((s) => s + 1)}
              className="bg-[#FF6E00] text-black px-5 py-2 text-[10px] font-bold tracking-[0.2em] uppercase hover:bg-[#FF8A00] active:bg-[#E05E00] transition-colors flex items-center gap-2"
            >
              CONTINUE
              <ArrowRight weight="bold" className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function StepWelcome({ userEmail }: { userEmail?: string }) {
  return (
    <div className="flex flex-col gap-5 flex-1">
      <div>
        <p className="text-[#FF6E00] text-[9px] tracking-[0.25em] uppercase mb-1.5">SYSTEM BOOT</p>
        <h2 className="text-lg font-bold uppercase tracking-tight text-white leading-tight mb-2">
          Welcome to HireFeed
        </h2>
        {userEmail && (
          <p className="text-[9px] text-[#3A3A3A] tracking-[0.2em] uppercase mb-3">
            USER: {userEmail}
          </p>
        )}
        <p className="text-[#666] text-sm leading-relaxed">
          Your personal job extraction engine. We scan job boards 24/7 and surface relevant openings in real-time — no manual searching required.
        </p>
      </div>

      <div className="border border-[#1A1A1A] bg-[#040404]">
        <div className="border-b border-[#1A1A1A] px-3 py-1.5 bg-[#080808]">
          <span className="text-[#FF6E00] text-[9px] tracking-[0.22em] uppercase">DATA SOURCES</span>
        </div>
        <div className="p-3 grid grid-cols-2 gap-1.5">
          {[
            { icon: LinkedinLogo, label: "LinkedIn", dot: "#0A66C2" },
            { icon: GithubLogo, label: "GitHub", dot: "#666" },
            { icon: Buildings, label: "MathWorks", dot: "#ED1C24" },
            { icon: Briefcase, label: "Jobright", dot: "#5465FF" },
          ].map(({ label, dot }) => (
            <div key={label} className="flex items-center gap-2 px-2.5 py-2 border border-[#161616]">
              <div className="w-1.5 h-1.5 shrink-0" style={{ backgroundColor: dot }} />
              <span className="text-[#666] text-[9px] uppercase tracking-[0.18em]">{label}</span>
            </div>
          ))}
          <div className="flex items-center gap-2 px-2.5 py-2 border border-[#161616] col-span-2">
            <Sparkle weight="fill" className="h-2.5 w-2.5 text-[#FF6E00] shrink-0" />
            <span className="text-[#666] text-[9px] uppercase tracking-[0.18em]">Custom Sources</span>
            <span className="ml-auto text-[#FF6E00] text-[8px] tracking-wider uppercase">Configurable</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function StepHowItWorks() {
  return (
    <div className="flex flex-col gap-5 flex-1">
      <div>
        <p className="text-[#FF6E00] text-[9px] tracking-[0.25em] uppercase mb-1.5">PROCESS FLOW</p>
        <h2 className="text-lg font-bold uppercase tracking-tight text-white leading-tight mb-2">
          How It Works
        </h2>
        <p className="text-[#666] text-sm leading-relaxed">
          The backend runs continuously and pushes jobs to your dashboard the moment they&apos;re discovered.
        </p>
      </div>

      <div className="border border-[#1A1A1A] divide-y divide-[#1A1A1A]">
        {[
          {
            num: "01",
            title: "SCAN SOURCES",
            desc: "LinkedIn, GitHub, MathWorks, Jobright & custom boards scanned continuously.",
          },
          {
            num: "02",
            title: "REAL-TIME PUSH",
            desc: "New jobs arrive on your dashboard instantly — no refresh needed.",
          },
          {
            num: "03",
            title: "FILTER & ACT",
            desc: "Dismiss, save, block companies, or apply directly from each card.",
          },
        ].map(({ num, title, desc }) => (
          <div key={num} className="px-4 py-3 flex gap-4 items-start">
            <span className="text-[#FF6E00] text-[11px] font-bold shrink-0 pt-0.5 tabular-nums">{num}</span>
            <div>
              <p className="text-white text-[10px] font-bold uppercase tracking-[0.15em] mb-0.5">{title}</p>
              <p className="text-[#555] text-[11px] leading-relaxed">{desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StepGetStarted({ onDone }: { onDone: () => void }) {
  return (
    <div className="flex flex-col gap-5 flex-1">
      <div>
        <div className="flex items-center gap-1.5 mb-1.5">
          <div className="w-1.5 h-1.5 bg-[#00B050] animate-pulse" />
          <p className="text-[#00B050] text-[9px] tracking-[0.25em] uppercase">SYSTEM READY</p>
        </div>
        <h2 className="text-lg font-bold uppercase tracking-tight text-white leading-tight mb-2">
          You&apos;re Live
        </h2>
        <p className="text-[#666] text-sm leading-relaxed">
          Jobs are already being discovered. For best results, configure your targets — it only takes 30 seconds.
        </p>
      </div>

      <div className="border border-[#1A1A1A] divide-y divide-[#1A1A1A]">
        <div className="px-4 py-3 flex gap-3 items-start">
          <Gear weight="bold" className="h-3.5 w-3.5 text-[#FF6E00] shrink-0 mt-0.5" />
          <div>
            <p className="text-white text-[10px] font-bold uppercase tracking-[0.15em] mb-0.5">Set Location</p>
            <p className="text-[#444] text-[11px]">Filter jobs to your target city or region</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2 mt-auto">
        <Link href="/settings" onClick={onDone} className="w-full">
          <button className="w-full bg-[#FF6E00] text-black px-4 py-3 text-[10px] font-bold tracking-[0.2em] uppercase hover:bg-[#FF8A00] active:bg-[#E05E00] transition-colors flex items-center justify-center gap-2">
            <Gear weight="bold" className="h-3.5 w-3.5" />
            CONFIGURE SETTINGS
            <ArrowRight weight="bold" className="h-3.5 w-3.5" />
          </button>
        </Link>
        <button
          onClick={onDone}
          className="w-full border border-[#1A1A1A] text-[#444] px-4 py-2.5 text-[9px] tracking-[0.18em] uppercase hover:border-[#333] hover:text-[#666] transition-colors"
        >
          EXPLORE ON MY OWN
        </button>
      </div>
    </div>
  );
}

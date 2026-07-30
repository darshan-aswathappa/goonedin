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
import { Kicker, DsButton } from "@/components/ds";

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(28,27,25,0.35)] p-4">
      <div className="relative w-full max-w-lg overflow-hidden rounded-[10px] border border-hairline bg-paper shadow-[0_24px_64px_rgba(28,27,25,0.22)]">
        {/* Masthead */}
        <div className="flex items-center justify-between border-b border-hairline bg-paper-card px-5 py-3">
          <div className="flex items-center gap-2.5">
            <Terminal weight="regular" className="size-4 text-ink-muted" />
            <span className="font-serif text-[17px] font-semibold leading-none text-ink">
              HireFeed
            </span>
            <span aria-hidden className="h-3 w-px bg-hairline-strong" />
            <Kicker>System Initialization</Kicker>
          </div>
          <button
            onClick={dismiss}
            className="rounded-[4px] p-1 text-ink-muted transition-colors hover:bg-paper-sunk hover:text-ink"
            aria-label="Skip onboarding"
          >
            <X weight="regular" className="size-4" />
          </button>
        </div>

        {/* Step tabs */}
        <div className="flex border-b border-hairline">
          {steps.map((label, i) => (
            <div
              key={i}
              className={`flex-1 border-r border-hairline px-3 py-2.5 text-center transition-colors last:border-r-0 ${
                i < step
                  ? "bg-paper-card text-ink-2"
                  : i === step
                  ? "-mb-px border-b-2 border-b-brick bg-paper-card text-ink"
                  : "bg-paper-sunk text-ink-faint"
              }`}
            >
              <span className="font-mono text-[11px] uppercase tracking-[0.09em]">
                {i < step ? "✓ " : ""}
                {label}
              </span>
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="flex min-h-[300px] flex-col p-6">
          {step === 0 && <StepWelcome userEmail={userEmail} />}
          {step === 1 && <StepHowItWorks />}
          {step === 2 && <StepGetStarted onDone={dismiss} />}
        </div>

        {/* Navigation */}
        {step < 2 && (
          <div className="flex items-center justify-between gap-3 border-t border-hairline bg-paper-card px-5 py-4">
            <DsButton variant="ghost" size="sm" onClick={dismiss}>
              Skip setup
            </DsButton>
            <DsButton variant="primary" size="sm" onClick={() => setStep((s) => s + 1)}>
              Continue
              <ArrowRight weight="regular" className="size-4" />
            </DsButton>
          </div>
        )}
      </div>
    </div>
  );
}

const DATA_SOURCES = [
  { icon: LinkedinLogo, label: "LinkedIn" },
  { icon: GithubLogo, label: "GitHub" },
  { icon: Buildings, label: "MathWorks" },
  { icon: Briefcase, label: "Jobright" },
];

function StepWelcome({ userEmail }: { userEmail?: string }) {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <div>
        <Kicker className="mb-2">System boot</Kicker>
        <h2 className="font-serif text-[28px] font-semibold leading-tight text-ink">
          Welcome to HireFeed
        </h2>
        {userEmail && (
          <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.09em] text-ink-faint">
            User: {userEmail}
          </p>
        )}
        <p className="mt-3 font-sans text-[15px] leading-relaxed text-ink-2">
          Your personal job extraction engine. We scan job boards 24/7 and surface relevant openings in real-time — no manual searching required.
        </p>
      </div>

      <div className="overflow-hidden rounded-[4px] border border-hairline bg-paper-card">
        <div className="border-b border-hairline bg-paper-sunk px-3 py-2">
          <Kicker>Data sources</Kicker>
        </div>
        <div className="grid grid-cols-2 gap-1.5 p-3">
          {DATA_SOURCES.map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="flex items-center gap-2 rounded-[4px] border border-hairline px-2.5 py-2"
            >
              <Icon weight="regular" className="size-4 shrink-0 text-ink-muted" />
              <span className="font-mono text-[11px] uppercase tracking-[0.09em] text-ink-2">
                {label}
              </span>
            </div>
          ))}
          <div className="col-span-2 flex items-center gap-2 rounded-[4px] border border-hairline px-2.5 py-2">
            <Sparkle weight="regular" className="size-4 shrink-0 text-ink-muted" />
            <span className="font-mono text-[11px] uppercase tracking-[0.09em] text-ink-2">
              Custom Sources
            </span>
            <Kicker className="ml-auto text-ink-faint">Configurable</Kicker>
          </div>
        </div>
      </div>
    </div>
  );
}

const PROCESS_STEPS = [
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
];

function StepHowItWorks() {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <div>
        <Kicker className="mb-2">Process flow</Kicker>
        <h2 className="font-serif text-[28px] font-semibold leading-tight text-ink">
          How It Works
        </h2>
        <p className="mt-3 font-sans text-[15px] leading-relaxed text-ink-2">
          The backend runs continuously and pushes jobs to your dashboard the moment they&apos;re discovered.
        </p>
      </div>

      <div className="divide-y divide-hairline rounded-[4px] border border-hairline bg-paper-card">
        {PROCESS_STEPS.map(({ num, title, desc }) => (
          <div key={num} className="flex items-start gap-4 px-4 py-3.5">
            <span className="shrink-0 font-serif text-[17px] font-semibold tabular-nums leading-snug text-ink-faint">
              {num}
            </span>
            <div>
              <p className="mb-1 font-mono text-[11px] uppercase tracking-[0.09em] text-ink">
                {title}
              </p>
              <p className="font-sans text-[13px] leading-relaxed text-ink-muted">{desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StepGetStarted({ onDone }: { onDone: () => void }) {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <div>
        <div className="mb-2 flex items-center gap-2">
          <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-forest animate-live-pulse" />
          <Kicker className="text-forest">System ready</Kicker>
        </div>
        <h2 className="font-serif text-[28px] font-semibold leading-tight text-ink">
          You&apos;re Live
        </h2>
        <p className="mt-3 font-sans text-[15px] leading-relaxed text-ink-2">
          Jobs are already being discovered. For best results, configure your targets — it only takes 30 seconds.
        </p>
      </div>

      <div className="divide-y divide-hairline rounded-[4px] border border-hairline bg-paper-card">
        <div className="flex items-start gap-3 px-4 py-3.5">
          <Gear weight="regular" className="mt-0.5 size-4 shrink-0 text-ink-muted" />
          <div>
            <p className="mb-1 font-mono text-[11px] uppercase tracking-[0.09em] text-ink">
              Set Location
            </p>
            <p className="font-sans text-[13px] leading-relaxed text-ink-muted">
              Filter jobs to your target city or region
            </p>
          </div>
        </div>
      </div>

      <div className="mt-auto flex flex-col gap-2">
        <Link href="/settings" onClick={onDone} className="w-full">
          <DsButton variant="primary" className="w-full">
            <Gear weight="regular" className="size-4" />
            Configure settings
            <ArrowRight weight="regular" className="size-4" />
          </DsButton>
        </Link>
        <DsButton variant="secondary" size="sm" onClick={onDone} className="w-full">
          Explore on my own
        </DsButton>
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
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
import { Kicker, DsButton, dsButtonVariants } from "@/components/ds";
import { cn } from "@/lib/utils";

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

  const steps = ["INIT", "PROCESS", "READY"];

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) dismiss();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[var(--scrim)] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed bottom-0 left-1/2 z-50 flex max-h-[min(92dvh,100%)] w-full max-w-lg -translate-x-1/2 flex-col overflow-y-auto rounded-t-[10px] border border-hairline bg-paper pb-[env(safe-area-inset-bottom)] shadow-[var(--shadow-modal)] outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2 sm:rounded-[10px]"
        >
          {/* Masthead */}
          <div className="flex items-center justify-between gap-2 border-b border-hairline bg-paper-card px-4 py-3 sm:px-5">
            <div className="flex min-w-0 items-center gap-2.5">
              <Terminal weight="regular" className="size-4 shrink-0 text-ink-muted" />
              <DialogPrimitive.Title className="font-serif text-[17px] font-semibold leading-none text-ink">
                HireFeed
              </DialogPrimitive.Title>
              <span aria-hidden className="hidden h-3 w-px bg-hairline-strong sm:block" />
              <Kicker className="hidden sm:block">System Initialization</Kicker>
            </div>
            <DialogPrimitive.Close
              className="flex size-10 shrink-0 items-center justify-center rounded-[4px] text-ink-muted transition-colors hover:bg-paper-sunk hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brick/40"
              aria-label="Skip onboarding"
            >
              <X weight="regular" className="size-4" />
            </DialogPrimitive.Close>
          </div>

          {/* Step indicators — completed steps are revisitable */}
          <div className="flex border-b border-hairline" role="tablist" aria-label="Onboarding steps">
            {steps.map((label, i) => (
              <button
                key={label}
                type="button"
                role="tab"
                aria-selected={i === step}
                aria-current={i === step ? "step" : undefined}
                disabled={i > step}
                onClick={() => {
                  if (i < step) setStep(i);
                }}
                className={cn(
                  "flex min-h-11 flex-1 items-center justify-center border-r border-hairline px-2 py-2.5 text-center transition-colors last:border-r-0 sm:px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brick/40 disabled:cursor-default",
                  i < step
                    ? "bg-paper-card text-ink-2 hover:bg-paper-sunk"
                    : i === step
                      ? "-mb-px border-b-2 border-b-brick bg-paper-card text-ink"
                      : "bg-paper-sunk text-ink-faint"
                )}
              >
                <span className="font-mono text-[11px] uppercase tracking-[0.09em]">
                  {i < step ? "✓ " : ""}
                  {label}
                </span>
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex min-h-[260px] flex-col p-5 sm:min-h-[300px] sm:p-6">
            {step === 0 && <StepWelcome userEmail={userEmail} />}
            {step === 1 && <StepHowItWorks />}
            {step === 2 && <StepGetStarted onDone={dismiss} />}
          </div>

          {/* Navigation */}
          {step < 2 && (
            <div className="flex items-center justify-between gap-3 border-t border-hairline bg-paper-card px-4 py-4 sm:px-5">
              <DsButton variant="ghost" size="sm" onClick={dismiss} className="min-h-11 sm:min-h-0">
                Skip setup
              </DsButton>
              <DsButton
                variant="primary"
                size="sm"
                onClick={() => setStep((s) => s + 1)}
                className="min-h-11 sm:min-h-0"
              >
                Continue
                <ArrowRight weight="regular" className="size-4" />
              </DsButton>
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
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
        <Link
          href="/settings"
          onClick={onDone}
          className={cn(dsButtonVariants({ variant: "primary" }), "w-full")}
        >
          <Gear weight="regular" className="size-4" />
          Configure settings
          <ArrowRight weight="regular" className="size-4" />
        </Link>
        <DsButton variant="secondary" size="sm" onClick={onDone} className="w-full">
          Explore on my own
        </DsButton>
      </div>
    </div>
  );
}

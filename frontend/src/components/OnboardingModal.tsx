"use client";

import { useState, useEffect } from "react";
import {
  Briefcase,
  MagnifyingGlass,
  Sparkle,
  ArrowRight,
  X,
  LinkedinLogo,
  GithubLogo,
  Buildings,
  Gear,
  CheckCircle,
  Broadcast,
} from "@phosphor-icons/react";
import Link from "next/link";

const ONBOARDING_KEY = "goonedin-onboarding-v1";

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
        // Small delay so the dashboard has time to mount
        const t = setTimeout(() => setOpen(true), 600);
        return () => clearTimeout(t);
      }
    } catch {
      // localStorage unavailable (private browsing, permissions) — skip onboarding
    }
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(ONBOARDING_KEY, "completed");
    } catch {
      // localStorage unavailable — dismiss in-memory only
    }
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg brutal-border bg-card shadow-[8px_8px_0px_0px_var(--border)] relative">
        {/* Close button */}
        <button
          onClick={dismiss}
          className="absolute top-3 right-3 brutal-border p-1.5 bg-muted hover:bg-muted/80 brutal-btn-hover"
          aria-label="Skip onboarding"
        >
          <X weight="bold" className="h-4 w-4" />
        </button>

        {/* Step indicators */}
        <div className="flex gap-1.5 px-6 pt-5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 brutal-border transition-all duration-300 ${
                i <= step ? "bg-primary" : "bg-muted"
              }`}
            />
          ))}
        </div>

        {/* Step content */}
        <div className="p-6 pt-4 min-h-[320px] flex flex-col">
          {step === 0 && <StepWelcome userEmail={userEmail} />}
          {step === 1 && <StepHowItWorks />}
          {step === 2 && <StepGetStarted onDone={dismiss} />}
        </div>

        {/* Navigation */}
        {step < 2 && (
          <div className="px-6 pb-6 flex items-center justify-between">
            <button
              onClick={dismiss}
              className="text-xs font-bold text-muted-foreground hover:text-foreground transition-colors uppercase tracking-wide"
            >
              Skip
            </button>
            <button
              onClick={() => setStep((s) => s + 1)}
              className="brutal-border bg-primary text-white px-5 py-2.5 font-black uppercase italic text-sm brutal-btn-hover flex items-center gap-2"
            >
              Next
              <ArrowRight weight="bold" className="h-4 w-4" />
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
      <div className="brutal-border bg-primary p-3 w-fit shadow-[3px_3px_0px_0px_var(--border)]">
        <Briefcase weight="fill" className="h-8 w-8 text-white" />
      </div>
      <div>
        <h2 className="text-3xl font-black uppercase italic tracking-tighter leading-tight mb-2">
          Welcome to GoonedIn.
        </h2>
        {userEmail && (
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">
            {userEmail}
          </p>
        )}
        <p className="font-bold text-muted-foreground leading-relaxed">
          Your personal job extraction engine. We scan job boards 24/7 and
          surface relevant openings in real-time — no manual searching required.
        </p>
      </div>
      <div className="brutal-border bg-muted/40 p-4 space-y-2">
        <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">
          What we scan
        </p>
        <div className="flex flex-wrap gap-2">
          {[
            { icon: LinkedinLogo, label: "LinkedIn", color: "#0A66C2" },
            { icon: GithubLogo, label: "GitHub", color: "#24292e" },
            { icon: Buildings, label: "MathWorks", color: "#ED1C24" },
            { icon: Briefcase, label: "Jobright", color: "#5465FF" },
          ].map(({ icon: Icon, label, color }) => (
            <div
              key={label}
              className="brutal-border px-2.5 py-1.5 flex items-center gap-1.5 bg-card shadow-[2px_2px_0px_0px_var(--border)]"
            >
              <Icon weight="bold" className="h-3.5 w-3.5" style={{ color }} />
              <span className="font-black text-xs uppercase">{label}</span>
            </div>
          ))}
          <div className="brutal-border px-2.5 py-1.5 flex items-center gap-1.5 bg-card shadow-[2px_2px_0px_0px_var(--border)]">
            <Sparkle weight="fill" className="h-3.5 w-3.5 text-primary" />
            <span className="font-black text-xs uppercase">Custom Sources</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function StepHowItWorks() {
  return (
    <div className="flex flex-col gap-5 flex-1">
      <div className="brutal-border bg-[var(--chart-3)] p-3 w-fit shadow-[3px_3px_0px_0px_var(--border)]">
        <Broadcast weight="fill" className="h-8 w-8 text-white" />
      </div>
      <div>
        <h2 className="text-3xl font-black uppercase italic tracking-tighter leading-tight mb-2">
          How It Works.
        </h2>
        <p className="font-bold text-muted-foreground leading-relaxed">
          The backend runs continuously and pushes jobs to your dashboard the
          moment they&apos;re discovered.
        </p>
      </div>
      <div className="space-y-3">
        {[
          {
            num: "01",
            title: "We scan sources",
            desc: "LinkedIn, GitHub, MathWorks, Jobright & any custom boards you add.",
          },
          {
            num: "02",
            title: "You get real-time alerts",
            desc: "New jobs push to your dashboard the moment they're found — no refresh needed.",
          },
          {
            num: "03",
            title: "You filter & act",
            desc: "Dismiss, save, block companies, or apply directly from each card.",
          },
        ].map(({ num, title, desc }) => (
          <div
            key={num}
            className="brutal-border bg-muted/30 px-4 py-3 flex gap-3 items-start shadow-[2px_2px_0px_0px_var(--border)]"
          >
            <span className="font-black text-primary text-sm shrink-0 mt-0.5">
              {num}
            </span>
            <div>
              <p className="font-black uppercase tracking-tight text-sm">
                {title}
              </p>
              <p className="font-bold text-xs text-muted-foreground">{desc}</p>
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
      <div className="brutal-border bg-[var(--chart-4)] p-3 w-fit shadow-[3px_3px_0px_0px_var(--border)]">
        <CheckCircle weight="fill" className="h-8 w-8 text-white" />
      </div>
      <div>
        <h2 className="text-3xl font-black uppercase italic tracking-tighter leading-tight mb-2">
          You&apos;re Live.
        </h2>
        <p className="font-bold text-muted-foreground leading-relaxed">
          Jobs are already being discovered. For best results, configure your
          targets — it only takes 30 seconds.
        </p>
      </div>
      <div className="space-y-2">
        <div className="brutal-border bg-muted/30 px-4 py-3 flex gap-3 items-start shadow-[2px_2px_0px_0px_var(--border)]">
          <MagnifyingGlass weight="bold" className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <div>
            <p className="font-black uppercase tracking-tight text-sm">Add keywords</p>
            <p className="font-bold text-xs text-muted-foreground">
              e.g. &quot;Software Engineer&quot;, &quot;Machine Learning&quot;, &quot;React&quot;
            </p>
          </div>
        </div>
        <div className="brutal-border bg-muted/30 px-4 py-3 flex gap-3 items-start shadow-[2px_2px_0px_0px_var(--border)]">
          <Gear weight="bold" className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <div>
            <p className="font-black uppercase tracking-tight text-sm">Set your location</p>
            <p className="font-bold text-xs text-muted-foreground">
              Filter jobs to your target city or state
            </p>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-2 mt-auto">
        <Link href="/settings" onClick={onDone} className="w-full">
          <button className="w-full brutal-border bg-primary text-white py-3 font-black uppercase italic text-base brutal-btn-hover flex items-center justify-center gap-2">
            <Gear weight="bold" className="h-5 w-5" />
            Configure Settings
          </button>
        </Link>
        <button
          onClick={onDone}
          className="w-full brutal-border bg-card py-2.5 font-black uppercase italic text-sm brutal-btn-hover text-muted-foreground hover:text-foreground"
        >
          Skip — I&apos;ll explore on my own
        </button>
      </div>
    </div>
  );
}

"use client";

import { 
  GithubLogo, 
  LinkedinLogo, 
  Buildings, 
  Bank,
  Calculator 
} from "@phosphor-icons/react";

const COMPANIES = [
  { icon: GithubLogo, name: "GitHub" },
  { icon: LinkedinLogo, name: "LinkedIn" },
  { icon: Bank, name: "Fidelity" },
  { icon: Buildings, name: "State Street" },
  { icon: Calculator, name: "MathWorks" },
];

export function CompanyTicker() {
  return (
    <div className="w-full flex flex-col items-center justify-center py-12 border-y-2 border-border bg-card">
      <p className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground mb-8">
        Trusted by people who work at
      </p>
      <div className="relative flex w-full max-w-5xl overflow-hidden">
        <div className="flex shrink-0 animate-marquee items-center justify-around gap-16 px-8">
          {COMPANIES.map((company, index) => (
            <div
              key={index}
              className="flex items-center gap-3 text-foreground transition-transform hover:scale-110 active:scale-95 duration-200"
            >
              <company.icon weight="bold" className="h-8 w-8 text-primary" />
              <span className="font-black italic uppercase tracking-tighter text-2xl">{company.name}</span>
            </div>
          ))}
        </div>
        <div
          className="flex shrink-0 animate-marquee items-center justify-around gap-16 px-8"
          aria-hidden="true"
        >
          {COMPANIES.map((company, index) => (
            <div
              key={index}
              className="flex items-center gap-3 text-foreground transition-transform hover:scale-110 active:scale-95 duration-200"
            >
              <company.icon weight="bold" className="h-8 w-8 text-primary" />
              <span className="font-black italic uppercase tracking-tighter text-2xl">{company.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

"use client";

import { Github, Linkedin, Building, Building2, Calculator } from "lucide-react";

const COMPANIES = [
  { icon: Github, name: "GitHub" },
  { icon: Linkedin, name: "LinkedIn" },
  { icon: Building, name: "Fidelity" },
  { icon: Building2, name: "State Street" },
  { icon: Calculator, name: "MathWorks" },
];

export function CompanyTicker() {
  return (
    <div className="w-full flex flex-col items-center justify-center py-8 border-b border-border/40 bg-muted/20">
      <p className="text-sm text-muted-foreground mb-6 font-medium">
        Trusted by people who work at
      </p>
      <div className="relative flex w-full max-w-4xl overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]">
        <div className="flex shrink-0 animate-marquee items-center justify-around gap-12 px-6">
          {COMPANIES.map((company, index) => (
            <div
              key={index}
              className="flex items-center gap-3 text-muted-foreground/80 grayscale hover:grayscale-0 transition duration-300"
            >
              <company.icon className="h-7 w-7" />
              <span className="font-semibold tracking-tight text-lg">{company.name}</span>
            </div>
          ))}
        </div>
        <div
          className="flex shrink-0 animate-marquee items-center justify-around gap-12 px-6"
          aria-hidden="true"
        >
          {COMPANIES.map((company, index) => (
            <div
              key={index}
              className="flex items-center gap-3 text-muted-foreground/80 grayscale hover:grayscale-0 transition duration-300"
            >
              <company.icon className="h-7 w-7" />
              <span className="font-semibold tracking-tight text-lg">{company.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

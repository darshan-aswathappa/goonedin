"use client";

import {
  GithubLogo,
  LinkedinLogo,
  Calculator
} from "@phosphor-icons/react";
import { Kicker } from "@/components/ds";

const COMPANIES = [
  { icon: GithubLogo, name: "GitHub" },
  { icon: LinkedinLogo, name: "LinkedIn" },
  { icon: Calculator, name: "MathWorks" },
];

export function CompanyTicker() {
  return (
    <div className="flex w-full flex-col items-center justify-center border-y border-hairline bg-paper-card py-12">
      <Kicker className="mb-8">Track jobs from</Kicker>
      <div className="relative flex w-full max-w-5xl overflow-hidden">
        <div className="flex shrink-0 animate-marquee items-center justify-around gap-6 px-8 sm:gap-16">
          {COMPANIES.map((company, index) => (
            <div key={index} className="flex items-center gap-3">
              <company.icon weight="regular" className="size-4 shrink-0 text-ink-muted" />
              <span className="font-serif text-lg font-semibold text-ink sm:text-2xl">
                {company.name}
              </span>
            </div>
          ))}
        </div>
        <div
          className="flex shrink-0 animate-marquee items-center justify-around gap-6 px-8 sm:gap-16"
          aria-hidden="true"
        >
          {COMPANIES.map((company, index) => (
            <div key={index} className="flex items-center gap-3">
              <company.icon weight="regular" className="size-4 shrink-0 text-ink-muted" />
              <span className="font-serif text-lg font-semibold text-ink sm:text-2xl">
                {company.name}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

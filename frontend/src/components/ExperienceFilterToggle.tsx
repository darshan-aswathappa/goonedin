"use client";

import { Briefcase } from "@phosphor-icons/react";
import { useSettingsStore } from "@/store/settings";
import { Checkbox, Slider } from "@/components/ds";

const MAX_YEARS = 15;

export function ExperienceFilterToggle() {
  const hideHighExperienceJobs = useSettingsStore(
    (state) => state.hideHighExperienceJobs
  );
  const setHideHighExperienceJobs = useSettingsStore(
    (state) => state.setHideHighExperienceJobs
  );
  const maxExperienceYears = useSettingsStore(
    (state) => state.maxExperienceYears
  );
  const setMaxExperienceYears = useSettingsStore(
    (state) => state.setMaxExperienceYears
  );

  return (
    <section className="rounded-[4px] border border-hairline bg-paper-card">
      <header className="flex items-start gap-3 border-b border-hairline px-4 py-3">
        <span className="mt-px shrink-0">
          <Briefcase weight="regular" className="size-4 text-ink-muted" />
        </span>
        <div className="min-w-0">
          <h2 className="font-serif text-[17px] font-semibold leading-tight text-ink">
            Experience
          </h2>
          <p className="mt-1 break-words font-sans text-[13px] leading-snug text-ink-muted">
            Hide roles that require more than a set number of years. Postings
            that don&apos;t state an experience requirement are always shown.
          </p>
        </div>
      </header>
      <div className="flex flex-col gap-4 p-4">
        <Checkbox
          label="Hide jobs above a maximum experience level"
          checked={hideHighExperienceJobs}
          onChange={(e) => setHideHighExperienceJobs(e.target.checked)}
        />
        <Slider
          label="Max years of experience"
          value={maxExperienceYears}
          min={0}
          max={MAX_YEARS}
          disabled={!hideHighExperienceJobs}
          onChange={(e) => setMaxExperienceYears(Number(e.target.value))}
          className={hideHighExperienceJobs ? undefined : "opacity-50"}
        />
      </div>
    </section>
  );
}

"use client";

import { Globe } from "@phosphor-icons/react";
import { useSettingsStore } from "@/store/settings";
import { Checkbox } from "@/components/ds";

export function SponsorshipFilterToggle() {
  const hideNotEligibleForSponsorship = useSettingsStore(
    (state) => state.hideNotEligibleForSponsorship
  );
  const setHideNotEligibleForSponsorship = useSettingsStore(
    (state) => state.setHideNotEligibleForSponsorship
  );

  return (
    <section className="rounded-[4px] border border-hairline bg-paper-card">
      <header className="flex items-start gap-3 border-b border-hairline px-4 py-3">
        <span className="mt-px shrink-0">
          <Globe weight="regular" className="size-4 text-ink-muted" />
        </span>
        <div className="min-w-0">
          <h2 className="font-serif text-[17px] font-semibold leading-tight text-ink">
            Sponsorship
          </h2>
          <p className="mt-1 break-words font-sans text-[13px] leading-snug text-ink-muted">
            Hide roles whose listing explicitly says they don&apos;t sponsor work visas.
          </p>
        </div>
      </header>
      <div className="p-4">
        <Checkbox
          label="Hide jobs not eligible for sponsorship"
          checked={hideNotEligibleForSponsorship}
          onChange={(e) => setHideNotEligibleForSponsorship(e.target.checked)}
        />
      </div>
    </section>
  );
}

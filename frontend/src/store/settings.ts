import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SettingsState {
  hideNotEligibleForSponsorship: boolean;
  setHideNotEligibleForSponsorship: (value: boolean) => void;
  /** When true, hide jobs whose minimum required experience exceeds maxExperienceYears. */
  hideHighExperienceJobs: boolean;
  setHideHighExperienceJobs: (value: boolean) => void;
  /** Inclusive upper bound: jobs requiring <= this many years are kept. */
  maxExperienceYears: number;
  setMaxExperienceYears: (value: number) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      hideNotEligibleForSponsorship: false,
      setHideNotEligibleForSponsorship: (value) =>
        set({ hideNotEligibleForSponsorship: value }),
      hideHighExperienceJobs: false,
      setHideHighExperienceJobs: (value) => set({ hideHighExperienceJobs: value }),
      maxExperienceYears: 3,
      setMaxExperienceYears: (value) => set({ maxExperienceYears: value }),
    }),
    { name: "hirefeed-settings" }
  )
);

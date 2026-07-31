import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SettingsState {
  hideNotEligibleForSponsorship: boolean;
  setHideNotEligibleForSponsorship: (value: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      hideNotEligibleForSponsorship: false,
      setHideNotEligibleForSponsorship: (value) =>
        set({ hideNotEligibleForSponsorship: value }),
    }),
    { name: "hirefeed-settings" }
  )
);

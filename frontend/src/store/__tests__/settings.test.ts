import "@testing-library/jest-dom";

describe("useSettingsStore", () => {
  beforeEach(() => {
    window.localStorage.clear();
    jest.resetModules();
  });

  it("defaults hideNotEligibleForSponsorship to false", async () => {
    const { useSettingsStore } = await import("@/store/settings");
    expect(useSettingsStore.getState().hideNotEligibleForSponsorship).toBe(false);
  });

  it("updates state when setHideNotEligibleForSponsorship is called", async () => {
    const { useSettingsStore } = await import("@/store/settings");
    useSettingsStore.getState().setHideNotEligibleForSponsorship(true);
    expect(useSettingsStore.getState().hideNotEligibleForSponsorship).toBe(true);
  });

  it("persists the setting to localStorage", async () => {
    const { useSettingsStore } = await import("@/store/settings");
    useSettingsStore.getState().setHideNotEligibleForSponsorship(true);

    const raw = window.localStorage.getItem("hirefeed-settings");
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw as string);
    expect(parsed.state.hideNotEligibleForSponsorship).toBe(true);
  });

  it("rehydrates a previously persisted value on fresh load", async () => {
    window.localStorage.setItem(
      "hirefeed-settings",
      JSON.stringify({ state: { hideNotEligibleForSponsorship: true }, version: 0 })
    );
    const { useSettingsStore } = await import("@/store/settings");
    expect(useSettingsStore.getState().hideNotEligibleForSponsorship).toBe(true);
  });
});

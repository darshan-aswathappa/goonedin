import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SponsorshipFilterToggle } from "@/components/SponsorshipFilterToggle";
import { useSettingsStore } from "@/store/settings";

describe("SponsorshipFilterToggle", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useSettingsStore.setState({ hideNotEligibleForSponsorship: false });
  });

  it("renders unchecked by default", () => {
    render(<SponsorshipFilterToggle />);
    const checkbox = screen.getByRole("checkbox", {
      name: /hide jobs not eligible for sponsorship/i,
    });
    expect(checkbox).not.toBeChecked();
  });

  it("toggles the store state when clicked", async () => {
    const user = userEvent.setup();
    render(<SponsorshipFilterToggle />);
    const checkbox = screen.getByRole("checkbox", {
      name: /hide jobs not eligible for sponsorship/i,
    });

    await user.click(checkbox);

    expect(checkbox).toBeChecked();
    expect(useSettingsStore.getState().hideNotEligibleForSponsorship).toBe(true);
  });

  it("unchecks when clicked again", async () => {
    const user = userEvent.setup();
    render(<SponsorshipFilterToggle />);
    const checkbox = screen.getByRole("checkbox", {
      name: /hide jobs not eligible for sponsorship/i,
    });

    await user.click(checkbox);
    await user.click(checkbox);

    expect(checkbox).not.toBeChecked();
    expect(useSettingsStore.getState().hideNotEligibleForSponsorship).toBe(false);
  });

  it("reflects a pre-existing store value on render", () => {
    useSettingsStore.setState({ hideNotEligibleForSponsorship: true });
    render(<SponsorshipFilterToggle />);
    const checkbox = screen.getByRole("checkbox", {
      name: /hide jobs not eligible for sponsorship/i,
    });
    expect(checkbox).toBeChecked();
  });
});

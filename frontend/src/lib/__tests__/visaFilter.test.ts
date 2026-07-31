import "@testing-library/jest-dom";
import { isSponsorshipIneligible, filterSponsorshipEligible } from "@/lib/visaFilter";

describe("isSponsorshipIneligible", () => {
  it("returns false for undefined/null/empty visa", () => {
    expect(isSponsorshipIneligible(undefined)).toBe(false);
    expect(isSponsorshipIneligible(null)).toBe(false);
    expect(isSponsorshipIneligible("")).toBe(false);
  });

  it("matches 'Not eligible for sponsorship' case-insensitively", () => {
    expect(isSponsorshipIneligible("Not eligible for sponsorship")).toBe(true);
    expect(isSponsorshipIneligible("NOT ELIGIBLE FOR SPONSORSHIP")).toBe(true);
    expect(isSponsorshipIneligible("not eligible for sponsorship")).toBe(true);
  });

  it("matches 'without sponsorship' phrasing", () => {
    expect(isSponsorshipIneligible("Must be eligible to work without sponsorship")).toBe(true);
    expect(isSponsorshipIneligible("No visa sponsorship, work without sponsorship required")).toBe(true);
  });

  it("matches 'does not sponsor'", () => {
    expect(isSponsorshipIneligible("This company does not sponsor visas")).toBe(true);
  });

  it("matches 'no sponsorship'", () => {
    expect(isSponsorshipIneligible("No sponsorship available")).toBe(true);
  });

  it("does not match positive sponsorship language", () => {
    expect(isSponsorshipIneligible("Visa sponsorship available")).toBe(false);
    expect(isSponsorshipIneligible("H1B sponsorship available")).toBe(false);
    expect(isSponsorshipIneligible("We sponsor visas")).toBe(false);
  });

  it("does not match unrelated visa text", () => {
    expect(isSponsorshipIneligible("Remote OK")).toBe(false);
    expect(isSponsorshipIneligible("US work authorization required")).toBe(false);
  });
});

describe("filterSponsorshipEligible", () => {
  const jobs = [
    { external_id: "1", visa: "Not eligible for sponsorship" },
    { external_id: "2", visa: "Sponsorship available" },
    { external_id: "3", visa: undefined },
    { external_id: "4", visa: "Does not sponsor visas" },
  ];

  it("returns all jobs unchanged when hideIneligible is false", () => {
    expect(filterSponsorshipEligible(jobs, false)).toEqual(jobs);
  });

  it("filters out ineligible jobs when hideIneligible is true", () => {
    const result = filterSponsorshipEligible(jobs, true);
    expect(result.map((j) => j.external_id)).toEqual(["2", "3"]);
  });

  it("keeps jobs with no visa field when filtering is enabled", () => {
    const result = filterSponsorshipEligible(jobs, true);
    expect(result.some((j) => j.external_id === "3")).toBe(true);
  });
});

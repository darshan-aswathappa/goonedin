import "@testing-library/jest-dom";
import { isBlocked } from "@/lib/blocked-companies";

describe("isBlocked", () => {
  it("returns false for empty blocked list", () => {
    expect(isBlocked("Acme Corp", [])).toBe(false);
  });

  it("returns false when company is not in blocked list", () => {
    expect(isBlocked("Acme Corp", ["evil corp", "bad company"])).toBe(false);
  });

  it("returns true for exact match", () => {
    expect(isBlocked("Acme Corp", ["acme corp"])).toBe(true);
  });

  it("is case insensitive for the company name (blocked list is expected lowercase)", () => {
    // The function lowercases 'company' before comparison
    // Blocked list items are expected to already be lowercase (from getBlockedCompanies)
    expect(isBlocked("ACME CORP", ["acme corp"])).toBe(true);
    expect(isBlocked("Acme Corp Ltd", ["acme corp"])).toBe(true);
  });

  it("returns true when company includes blocked substring", () => {
    // company "acme corp inc" includes blocked "acme corp"
    expect(isBlocked("Acme Corp Inc", ["acme corp"])).toBe(true);
  });

  it("returns true when blocked includes company (reverse substring)", () => {
    // blocked "acme corp international" includes company "acme corp"
    expect(isBlocked("Acme Corp", ["acme corp international"])).toBe(true);
  });

  it("returns true on first match in list", () => {
    expect(isBlocked("Evil Corp", ["good company", "evil corp", "also blocked"])).toBe(true);
  });

  it("handles empty string company name", () => {
    // empty string is a substring of everything — every blocked entry includes ""
    expect(isBlocked("", ["something"])).toBe(true);
  });

  it("handles multiple blocked entries and matches correct one", () => {
    const blocked = ["bad actor", "sketchy firm", "acme corp"];
    expect(isBlocked("Acme Corp", blocked)).toBe(true);
    expect(isBlocked("Good Company", blocked)).toBe(false);
  });
});

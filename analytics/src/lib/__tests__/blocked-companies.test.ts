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

describe("getBlockedCompanies", () => {
  it("fetches company names from supabase and returns them lowercased", async () => {
    const mockSelect = jest.fn().mockResolvedValue({
      data: [{ company_name: "Acme Corp" }, { company_name: "Evil Inc" }],
      error: null,
    });

    let fn: () => Promise<string[]>;
    jest.isolateModules(() => {
      jest.doMock("@/lib/supabase-server", () => ({
        createServerClient: () => ({ from: () => ({ select: mockSelect }) }),
      }));
      fn = require("@/lib/blocked-companies").getBlockedCompanies;
    });

    const result = await fn!();
    expect(result).toEqual(["acme corp", "evil inc"]);
    expect(mockSelect).toHaveBeenCalledWith("company_name");
  });

  it("returns the cached result without re-fetching on subsequent calls within TTL", async () => {
    const mockSelect = jest.fn().mockResolvedValue({
      data: [{ company_name: "Cached Co" }],
      error: null,
    });

    let fn: () => Promise<string[]>;
    jest.isolateModules(() => {
      jest.doMock("@/lib/supabase-server", () => ({
        createServerClient: () => ({ from: () => ({ select: mockSelect }) }),
      }));
      fn = require("@/lib/blocked-companies").getBlockedCompanies;
    });

    await fn!(); // first call — populates cache
    await fn!(); // second call — should use cache
    expect(mockSelect).toHaveBeenCalledTimes(1);
  });

  it("returns empty array when fetch fails and cache is empty", async () => {
    const mockSelect = jest.fn().mockResolvedValue({
      data: null,
      error: new Error("DB unavailable"),
    });

    let fn: () => Promise<string[]>;
    jest.isolateModules(() => {
      jest.doMock("@/lib/supabase-server", () => ({
        createServerClient: () => ({ from: () => ({ select: mockSelect }) }),
      }));
      fn = require("@/lib/blocked-companies").getBlockedCompanies;
    });

    const result = await fn!();
    expect(result).toEqual([]);
  });

  it("returns stale cache when fetch fails after a successful prior fetch", async () => {
    const mockSelect = jest
      .fn()
      .mockResolvedValueOnce({ data: [{ company_name: "Stale Co" }], error: null })
      .mockResolvedValueOnce({ data: null, error: new Error("DB error") });

    let fn: () => Promise<string[]>;
    jest.isolateModules(() => {
      jest.doMock("@/lib/supabase-server", () => ({
        createServerClient: () => ({ from: () => ({ select: mockSelect }) }),
      }));
      fn = require("@/lib/blocked-companies").getBlockedCompanies;
    });

    await fn!(); // populate cache

    // Expire the cache by advancing system time past the 2-minute TTL
    jest.useFakeTimers();
    jest.setSystemTime(Date.now() + 200_000);

    const result = await fn!(); // fetch fails — should return stale cache
    expect(result).toEqual(["stale co"]);

    jest.useRealTimers();
  });
});

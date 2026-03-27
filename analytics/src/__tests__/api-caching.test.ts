/**
 * API Caching Tests
 *
 * Verifies that all analytics API routes export `revalidate = 60` (ISR) and
 * do NOT export `dynamic = "force-dynamic"`.
 *
 * Route handlers import next/server (NextResponse) and @supabase/supabase-js,
 * both of which need to be mocked in the Jest/Node environment to avoid
 * runtime errors unrelated to the caching configuration under test.
 *
 * TDD: routes still on `force-dynamic` will be RED until the refactor lands.
 */

// ---------------------------------------------------------------------------
// Mocks — must be declared before any imports that trigger module evaluation
// ---------------------------------------------------------------------------

// next/server relies on Web API globals (Request, Response, Headers) that are
// not available in the Jest node/jsdom environment.
jest.mock("next/server", () => {
  const json = jest.fn((body: unknown, init?: { status?: number }) => ({
    body,
    status: init?.status ?? 200,
  }));
  return { NextResponse: { json } };
});

// Prevent supabase-js from making real connections.
jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn().mockReturnValue({ from: jest.fn(), rpc: jest.fn() }),
}));

// Stub every analytics lib helper so route modules load without side-effects.
jest.mock("@/lib/analytics", () => ({
  aggregateSalary: jest.fn(),
  aggregateVisa: jest.fn().mockReturnValue([]),
  aggregateSoftSkills: jest.fn(),
  parseAnalysis: jest.fn(),
  fillDateRange: jest.fn().mockReturnValue([]),
  normalizeLocation: jest.fn().mockReturnValue(""),
}));

// Stub the blocked-companies helper used by companies / hiring-velocity routes.
jest.mock("@/lib/blocked-companies", () => ({
  getBlockedCompanies: jest.fn().mockResolvedValue([]),
  isBlocked: jest.fn().mockReturnValue(false),
}));

// Provide environment variables expected by supabase-server.
beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.SUPABASE_SERVICE_KEY = "service-key-test";
});

afterAll(() => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_KEY;
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type RouteModule = {
  revalidate?: unknown;
  dynamic?: unknown;
  GET?: unknown;
};

async function loadRoute(path: string): Promise<RouteModule> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(path) as RouteModule;
}

// ---------------------------------------------------------------------------
// Routes that MUST export `revalidate = 60` after the refactor.
// "timeline" accepts search params and therefore intentionally stays dynamic.
// ---------------------------------------------------------------------------

const ROUTES_REQUIRING_REVALIDATE = [
  ["overview", "@/app/api/analytics/overview/route"],
  ["companies", "@/app/api/analytics/companies/route"],
  ["cooccurrence", "@/app/api/analytics/cooccurrence/route"],
  ["experience", "@/app/api/analytics/experience/route"],
  ["hiring-velocity", "@/app/api/analytics/hiring-velocity/route"],
  ["hourly-by-day", "@/app/api/analytics/hourly-by-day/route"],
  ["locations", "@/app/api/analytics/locations/route"],
  ["queue", "@/app/api/analytics/queue/route"],
  ["salary", "@/app/api/analytics/salary/route"],
  ["salary-by-location", "@/app/api/analytics/salary-by-location/route"],
  ["seniority", "@/app/api/analytics/seniority/route"],
  ["skill-momentum", "@/app/api/analytics/skill-momentum/route"],
  ["skills", "@/app/api/analytics/skills/route"],
  ["sources", "@/app/api/analytics/sources/route"],
  ["visa", "@/app/api/analytics/visa/route"],
  ["weekday", "@/app/api/analytics/weekday/route"],
] as const;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("API route caching — revalidate export", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it.each(ROUTES_REQUIRING_REVALIDATE)(
    "%s: exports revalidate = 60",
    async (_name, modulePath) => {
      const mod = await loadRoute(modulePath);
      expect(mod.revalidate).toBe(60);
    }
  );

  it.each(ROUTES_REQUIRING_REVALIDATE)(
    "%s: does not export dynamic = 'force-dynamic'",
    async (_name, modulePath) => {
      const mod = await loadRoute(modulePath);
      expect(mod.dynamic).toBeUndefined();
    }
  );

  it.each(ROUTES_REQUIRING_REVALIDATE)(
    "%s: exports a GET handler",
    async (_name, modulePath) => {
      const mod = await loadRoute(modulePath);
      expect(typeof mod.GET).toBe("function");
    }
  );
});

// ---------------------------------------------------------------------------
// page.tsx — module-level caching export
// ---------------------------------------------------------------------------

describe("page.tsx — module-level caching export", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it("exports revalidate = 60", async () => {
    // Stub heavy component imports used by the page so we only test the export.
    jest.mock("@/components/TerminalHeader", () => () => null);
    jest.mock("@/components/ScanlineOverlay", () => () => null);
    jest.mock("@/components/BootSequence", () => () => null);
    jest.mock("@/components/AutoRefresh", () => () => null);
    jest.mock("@/components/DashboardTabs", () => () => null);

    const mod = await loadRoute("@/app/page");
    expect(mod.revalidate).toBe(60);
  });

  it("does not export dynamic = 'force-dynamic'", async () => {
    jest.mock("@/components/TerminalHeader", () => () => null);
    jest.mock("@/components/ScanlineOverlay", () => () => null);
    jest.mock("@/components/BootSequence", () => () => null);
    jest.mock("@/components/AutoRefresh", () => () => null);
    jest.mock("@/components/DashboardTabs", () => () => null);

    const mod = await loadRoute("@/app/page");
    expect(mod.dynamic).toBeUndefined();
  });
});

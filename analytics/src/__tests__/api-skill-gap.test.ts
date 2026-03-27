/**
 * TDD — API Route: GET /api/analytics/skill-gap
 * RED phase: tests written before the route implementation exists.
 *
 * The route at src/app/api/analytics/skill-gap/route.ts does NOT exist yet.
 * All tests in this file are expected to FAIL until implementation lands.
 *
 * Mocking strategy mirrors api-caching.test.ts:
 *   - next/server → lightweight stub returning { body, status }
 *   - @supabase/supabase-js → stub so no real connection is attempted
 *   - @/lib/supabase-server → controlled mock so GET handler uses our fake client
 */

// ---------------------------------------------------------------------------
// Mocks — declared before any imports that trigger module evaluation
// ---------------------------------------------------------------------------

jest.mock("next/server", () => {
  const json = jest.fn((body: unknown, init?: { status?: number }) => ({
    body,
    status: init?.status ?? 200,
  }));
  return { NextResponse: { json } };
});

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn().mockReturnValue({ from: jest.fn(), rpc: jest.fn() }),
}));

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SkillGapItem {
  skill: string;
  must_have: number;
  good_to_have: number;
  total: number;
  recent: number;
  prior: number;
  growth: number;
}

// ---------------------------------------------------------------------------
// Shared mock RPC factory
// ---------------------------------------------------------------------------

const makeRpc = (
  data: unknown,
  error: Error | null = null
): jest.Mock =>
  jest.fn().mockResolvedValue({ data, error });

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/analytics/skill-gap", () => {
  let GET: () => Promise<{ body: unknown; status: number }>;

  const validSkills: SkillGapItem[] = [
    {
      skill: "python",
      must_have: 145,
      good_to_have: 45,
      total: 190,
      recent: 89,
      prior: 78,
      growth: 14.1,
    },
    {
      skill: "typescript",
      must_have: 98,
      good_to_have: 30,
      total: 128,
      recent: 60,
      prior: 70,
      growth: -14.3,
    },
  ];

  beforeEach(() => {
    jest.resetModules();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_KEY = "service-key-test";
  });

  afterAll(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_KEY;
  });

  // Helper that re-requires the route with a fresh supabase-server mock so
  // each test controls exactly what the RPC returns.
  async function loadRouteWithRpc(rpcMock: jest.Mock) {
    jest.mock("@/lib/supabase-server", () => ({
      createServerClient: jest.fn().mockReturnValue({ rpc: rpcMock }),
    }));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("@/app/api/analytics/skill-gap/route") as {
      GET: () => Promise<{ body: unknown; status: number }>;
    };
    return mod.GET;
  }

  it("returns 200 with a skills array on success", async () => {
    const rpc = makeRpc({ skills: validSkills, dateRange: { start: "2025-01-01", end: "2025-01-28" } });
    GET = await loadRouteWithRpc(rpc);

    const response = await GET();

    expect(response.status).toBe(200);
    const body = response.body as { skills: SkillGapItem[] };
    expect(Array.isArray(body.skills)).toBe(true);
  });

  it("returns skills with the correct shape", async () => {
    const rpc = makeRpc({ skills: validSkills, dateRange: { start: "2025-01-01", end: "2025-01-28" } });
    GET = await loadRouteWithRpc(rpc);

    const response = await GET();
    const body = response.body as { skills: SkillGapItem[] };

    expect(body.skills.length).toBeGreaterThan(0);
    const first = body.skills[0];
    expect(first).toHaveProperty("skill");
    expect(first).toHaveProperty("must_have");
    expect(first).toHaveProperty("good_to_have");
    expect(first).toHaveProperty("total");
    expect(first).toHaveProperty("recent");
    expect(first).toHaveProperty("prior");
    expect(first).toHaveProperty("growth");
  });

  it("returns numeric values for all numeric skill fields", async () => {
    const rpc = makeRpc({ skills: validSkills, dateRange: { start: "2025-01-01", end: "2025-01-28" } });
    GET = await loadRouteWithRpc(rpc);

    const response = await GET();
    const body = response.body as { skills: SkillGapItem[] };
    const first = body.skills[0];

    expect(typeof first.must_have).toBe("number");
    expect(typeof first.good_to_have).toBe("number");
    expect(typeof first.total).toBe("number");
    expect(typeof first.recent).toBe("number");
    expect(typeof first.prior).toBe("number");
    expect(typeof first.growth).toBe("number");
  });

  it("returns empty skills array when RPC returns null data", async () => {
    const rpc = makeRpc(null);
    GET = await loadRouteWithRpc(rpc);

    const response = await GET();

    expect(response.status).toBe(200);
    const body = response.body as { skills: SkillGapItem[] };
    expect(body.skills).toEqual([]);
  });

  it("returns empty skills array when RPC returns empty skills list", async () => {
    const rpc = makeRpc({ skills: [], dateRange: null });
    GET = await loadRouteWithRpc(rpc);

    const response = await GET();

    expect(response.status).toBe(200);
    const body = response.body as { skills: SkillGapItem[] };
    expect(body.skills).toEqual([]);
  });

  it("returns 500 when the RPC call throws an error", async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: null,
      error: new Error("RPC failure"),
    });
    GET = await loadRouteWithRpc(rpc);

    const response = await GET();

    expect(response.status).toBe(500);
  });

  it("returns an error message in the body on RPC failure", async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: null,
      error: new Error("database unavailable"),
    });
    GET = await loadRouteWithRpc(rpc);

    const response = await GET();
    const body = response.body as { error: string };

    expect(typeof body.error).toBe("string");
    expect(body.error.length).toBeGreaterThan(0);
  });

  it("calls the analytics_skill_gap RPC function by name", async () => {
    const rpc = makeRpc({ skills: validSkills, dateRange: { start: "2025-01-01", end: "2025-01-28" } });
    GET = await loadRouteWithRpc(rpc);

    await GET();

    expect(rpc).toHaveBeenCalledWith("analytics_skill_gap");
  });

  it("exports revalidate = 60 for ISR caching", async () => {
    jest.mock("@/lib/supabase-server", () => ({
      createServerClient: jest.fn().mockReturnValue({
        rpc: makeRpc({ skills: validSkills, dateRange: null }),
      }),
    }));

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("@/app/api/analytics/skill-gap/route") as { revalidate?: unknown };
    expect(mod.revalidate).toBe(60);
  });

  it("does not export dynamic = 'force-dynamic'", async () => {
    jest.mock("@/lib/supabase-server", () => ({
      createServerClient: jest.fn().mockReturnValue({
        rpc: makeRpc({ skills: validSkills, dateRange: null }),
      }),
    }));

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("@/app/api/analytics/skill-gap/route") as { dynamic?: unknown };
    expect(mod.dynamic).toBeUndefined();
  });

  it("exports a GET function handler", async () => {
    jest.mock("@/lib/supabase-server", () => ({
      createServerClient: jest.fn().mockReturnValue({
        rpc: makeRpc({ skills: validSkills, dateRange: null }),
      }),
    }));

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("@/app/api/analytics/skill-gap/route") as { GET?: unknown };
    expect(typeof mod.GET).toBe("function");
  });
});

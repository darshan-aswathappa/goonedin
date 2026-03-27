/**
 * Supabase Singleton Tests
 *
 * Verifies that `createServerClient` from `@/lib/supabase-server` implements
 * the module-level singleton pattern: multiple calls within the same Node.js
 * process must return the exact same client instance, avoiding redundant
 * connection pools per route handler.
 */

// Mock the supabase-js module so tests have no real network dependency.
jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn().mockReturnValue({ from: jest.fn(), rpc: jest.fn() }),
}));

// Provide required environment variables before the module is imported.
const FAKE_URL = "https://test.supabase.co";
const FAKE_KEY = "service-key-test";

describe("createServerClient — singleton behaviour", () => {
  let createClient: jest.Mock;
  let createServerClient: () => unknown;

  beforeAll(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = FAKE_URL;
    process.env.SUPABASE_SERVICE_KEY = FAKE_KEY;
  });

  beforeEach(() => {
    // Reset module registry so each describe block gets a fresh singleton state.
    jest.resetModules();

    // Re-import after resetModules to get a fresh module with _client = null.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const supabaseJs = require("@supabase/supabase-js");
    createClient = supabaseJs.createClient;
    createClient.mockClear();

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    ({ createServerClient } = require("@/lib/supabase-server"));
  });

  afterAll(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_KEY;
  });

  it("returns a client on first call", () => {
    const client = createServerClient();
    expect(client).toBeDefined();
    expect(client).not.toBeNull();
  });

  it("calls createClient exactly once on first invocation", () => {
    createServerClient();
    expect(createClient).toHaveBeenCalledTimes(1);
  });

  it("returns the same instance on a second call (singleton)", () => {
    const first = createServerClient();
    const second = createServerClient();
    expect(second).toBe(first);
  });

  it("does not call createClient again on subsequent calls", () => {
    createServerClient();
    createServerClient();
    createServerClient();
    expect(createClient).toHaveBeenCalledTimes(1);
  });

  it("passes the correct URL and service key to createClient", () => {
    createServerClient();
    expect(createClient).toHaveBeenCalledWith(
      FAKE_URL,
      FAKE_KEY,
      expect.objectContaining({ auth: { persistSession: false } })
    );
  });

  it("throws when NEXT_PUBLIC_SUPABASE_URL is missing", () => {
    jest.resetModules();
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createServerClient: freshCreate } = require("@/lib/supabase-server");
    expect(() => freshCreate()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);

    // Restore for subsequent tests.
    process.env.NEXT_PUBLIC_SUPABASE_URL = FAKE_URL;
  });

  it("throws when SUPABASE_SERVICE_KEY is missing", () => {
    jest.resetModules();
    delete process.env.SUPABASE_SERVICE_KEY;

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createServerClient: freshCreate } = require("@/lib/supabase-server");
    expect(() => freshCreate()).toThrow(/SUPABASE_SERVICE_KEY/);

    // Restore for subsequent tests.
    process.env.SUPABASE_SERVICE_KEY = FAKE_KEY;
  });
});

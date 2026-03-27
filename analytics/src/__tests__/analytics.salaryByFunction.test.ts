/**
 * TDD — aggregateSalaryByFunction unit tests
 * RED: write first, then implement in lib/analytics.ts
 */

import { aggregateSalaryByFunction } from "@/lib/analytics";

describe("aggregateSalaryByFunction", () => {
  it("returns empty array when given no rows", () => {
    expect(aggregateSalaryByFunction([])).toEqual([]);
  });

  it("skips rows with null salary", () => {
    const rows = [{ external_id: "1", title: "Backend Engineer", salary: null }];
    expect(aggregateSalaryByFunction(rows)).toEqual([]);
  });

  it("skips rows with null title", () => {
    const rows = [{ external_id: "1", title: null, salary: "$120,000" }];
    expect(aggregateSalaryByFunction(rows)).toEqual([]);
  });

  it("classifies a full-stack engineer correctly", () => {
    const rows = [
      { external_id: "1", title: "Full Stack Engineer", salary: "$130,000" },
    ];
    const result = aggregateSalaryByFunction(rows);
    expect(result).toHaveLength(1);
    expect(result[0].function).toBe("Full Stack");
    expect(result[0].median).toBeCloseTo(130000, -2);
    expect(result[0].count).toBe(1);
  });

  it("classifies backend, frontend, and ml/ai engineers", () => {
    const rows = [
      { external_id: "1", title: "Backend Engineer", salary: "$140,000" },
      { external_id: "2", title: "Frontend Developer (React)", salary: "$120,000" },
      { external_id: "3", title: "Machine Learning Engineer", salary: "$160,000" },
    ];
    const result = aggregateSalaryByFunction(rows);
    const fns = result.map((r) => r.function);
    expect(fns).toContain("Backend");
    expect(fns).toContain("Frontend");
    expect(fns).toContain("ML/AI");
  });

  it("computes correct median for odd-count group", () => {
    // Three backend engineers: 100K, 120K, 140K → median = 120K
    const rows = [
      { external_id: "1", title: "Backend Engineer", salary: "$100,000" },
      { external_id: "2", title: "Backend Developer", salary: "$120,000" },
      { external_id: "3", title: "Backend Software Engineer", salary: "$140,000" },
    ];
    const result = aggregateSalaryByFunction(rows);
    const backend = result.find((r) => r.function === "Backend")!;
    expect(backend.median).toBeCloseTo(120000, -2);
    expect(backend.count).toBe(3);
  });

  it("computes correct median for even-count group", () => {
    // Two backend engineers: 100K, 140K → median = 120K
    const rows = [
      { external_id: "1", title: "Backend Engineer", salary: "$100,000" },
      { external_id: "2", title: "Backend Engineer II", salary: "$140,000" },
    ];
    const result = aggregateSalaryByFunction(rows);
    const backend = result.find((r) => r.function === "Backend")!;
    expect(backend.median).toBeCloseTo(120000, -2);
  });

  it("handles K-suffix salary strings", () => {
    const rows = [
      { external_id: "1", title: "Frontend Developer", salary: "$120K - $150K" },
    ];
    const result = aggregateSalaryByFunction(rows);
    const frontend = result.find((r) => r.function === "Frontend")!;
    // midpoint of 120K and 150K = 135K
    expect(frontend.median).toBeCloseTo(135000, -2);
  });

  it("groups unmatched titles into General SW", () => {
    const rows = [
      { external_id: "1", title: "Software Engineer", salary: "$130,000" },
      { external_id: "2", title: "Software Developer", salary: "$110,000" },
    ];
    const result = aggregateSalaryByFunction(rows);
    const general = result.find((r) => r.function === "General SW")!;
    expect(general).toBeDefined();
    expect(general.count).toBe(2);
  });

  it("sorts results by median descending", () => {
    const rows = [
      { external_id: "1", title: "Frontend Developer", salary: "$100,000" },
      { external_id: "2", title: "Machine Learning Engineer", salary: "$180,000" },
      { external_id: "3", title: "Backend Engineer", salary: "$140,000" },
    ];
    const result = aggregateSalaryByFunction(rows);
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].median).toBeGreaterThanOrEqual(result[i].median);
    }
  });

  it("filters functions with fewer than 2 salary data points", () => {
    // A single job for DevOps should still appear (no minimum threshold requirement)
    const rows = [
      { external_id: "1", title: "DevOps Engineer", salary: "$130,000" },
    ];
    const result = aggregateSalaryByFunction(rows);
    expect(result).toHaveLength(1);
    expect(result[0].function).toBe("DevOps/SRE");
  });

  it("returns color for each function entry", () => {
    const rows = [
      { external_id: "1", title: "Backend Engineer", salary: "$130,000" },
    ];
    const result = aggregateSalaryByFunction(rows);
    expect(result[0].color).toBeTruthy();
    expect(result[0].color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("skips unparseable salary strings", () => {
    const rows = [
      { external_id: "1", title: "Backend Engineer", salary: "Not listed" },
      { external_id: "2", title: "Backend Engineer II", salary: "$140,000" },
    ];
    const result = aggregateSalaryByFunction(rows);
    const backend = result.find((r) => r.function === "Backend")!;
    expect(backend.count).toBe(1);
  });
});

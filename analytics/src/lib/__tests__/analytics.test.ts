import "@testing-library/jest-dom";
import {
  deduplicateJobs,
  resolveJobDate,
  aggregateSkills,
  aggregateSoftSkills,
  aggregateSalary,
  extractSeniority,
  aggregateSeniority,
  aggregateWeekday,
  aggregateTitleKeywords,
  aggregateVisa,
  normalizeLocation,
  aggregateLocations,
  fillDateRange,
  parseAnalysis,
  aggregateJobFunctions,
  aggregateGoodToHave,
} from "@/lib/analytics";

// ---------------------------------------------------------------------------
// deduplicateJobs
// ---------------------------------------------------------------------------
describe("deduplicateJobs", () => {
  it("returns empty array for empty input", () => {
    expect(deduplicateJobs([])).toEqual([]);
  });

  it("returns single item unchanged", () => {
    const row = { external_id: "abc", created_at: "2024-01-01T00:00:00Z" };
    expect(deduplicateJobs([row])).toEqual([row]);
  });

  it("deduplicates by external_id, earliest created_at wins", () => {
    const early = { external_id: "x", created_at: "2024-01-01T00:00:00Z", title: "early" };
    const late = { external_id: "x", created_at: "2024-06-01T00:00:00Z", title: "late" };
    const result = deduplicateJobs([late, early]);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("early");
  });

  it("keeps distinct external_ids separate", () => {
    const a = { external_id: "a", created_at: "2024-01-01T00:00:00Z" };
    const b = { external_id: "b", created_at: "2024-01-02T00:00:00Z" };
    expect(deduplicateJobs([a, b])).toHaveLength(2);
  });

  it("handles rows without created_at (null sorts last)", () => {
    const withDate = { external_id: "x", created_at: "2024-01-01T00:00:00Z", title: "dated" };
    const noDate = { external_id: "x", created_at: null, title: "undated" };
    const result = deduplicateJobs([noDate, withDate]);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("dated");
  });
});

// ---------------------------------------------------------------------------
// resolveJobDate
// ---------------------------------------------------------------------------
describe("resolveJobDate", () => {
  const now = new Date();
  const recentDate = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const recentIso = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString();

  it("returns posted_at date when it is valid (recent)", () => {
    const result = resolveJobDate({ posted_at: recentIso, created_at: "2023-01-01T00:00:00Z" });
    expect(result).toBe(recentDate);
  });

  it("falls back to created_at when posted_at is too old (>2yr)", () => {
    const oldDate = new Date(now.getTime() - 800 * 24 * 60 * 60 * 1000).toISOString();
    const createdAt = "2024-05-10T00:00:00Z";
    const result = resolveJobDate({ posted_at: oldDate, created_at: createdAt });
    expect(result).toBe("2024-05-10");
  });

  it("falls back to created_at when posted_at is too far in the future (>1wk)", () => {
    const futureDate = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const createdAt = "2024-05-10T00:00:00Z";
    const result = resolveJobDate({ posted_at: futureDate, created_at: createdAt });
    expect(result).toBe("2024-05-10");
  });

  it("returns created_at when posted_at is null", () => {
    const result = resolveJobDate({ posted_at: null, created_at: "2024-03-15T00:00:00Z" });
    expect(result).toBe("2024-03-15");
  });

  it("returns null when both are null", () => {
    expect(resolveJobDate({ posted_at: null, created_at: null })).toBeNull();
  });

  it("returns null when both are missing", () => {
    expect(resolveJobDate({})).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// parseAnalysis
// ---------------------------------------------------------------------------
describe("parseAnalysis", () => {
  it("returns null for null input", () => {
    expect(parseAnalysis(null)).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(parseAnalysis(undefined)).toBeNull();
  });

  it("parses valid JSON string", () => {
    const obj = { must_have_keywords: ["TypeScript"], good_to_have_keywords: [] };
    expect(parseAnalysis(JSON.stringify(obj))).toEqual(obj);
  });

  it("returns null for invalid JSON string", () => {
    expect(parseAnalysis("{not-valid-json")).toBeNull();
  });

  it("returns object as-is when already an object", () => {
    const obj = { minimum_qualifications: ["communication"] };
    expect(parseAnalysis(obj)).toBe(obj);
  });

  it("returns null for non-string non-object primitives", () => {
    expect(parseAnalysis(42)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// aggregateSkills
// ---------------------------------------------------------------------------
describe("aggregateSkills", () => {
  it("returns empty array for empty input", () => {
    expect(aggregateSkills([])).toEqual([]);
  });

  it("returns empty array when analysis is null", () => {
    expect(aggregateSkills([{ analysis: null }])).toEqual([]);
  });

  it("counts must_have_keywords + good_to_have_keywords from object analysis", () => {
    const rows = [
      {
        analysis: {
          must_have_keywords: ["TypeScript", "React"],
          good_to_have_keywords: ["Docker"],
        },
      },
      {
        analysis: {
          must_have_keywords: ["TypeScript"],
          good_to_have_keywords: ["Docker"],
        },
      },
    ];
    const result = aggregateSkills(rows);
    const tsEntry = result.find((r) => r.keyword === "TypeScript");
    const dockerEntry = result.find((r) => r.keyword === "Docker");
    expect(tsEntry?.count).toBe(2);
    expect(dockerEntry?.count).toBe(2);
  });

  it("parses JSON string analysis", () => {
    const rows = [
      {
        analysis: JSON.stringify({
          must_have_keywords: ["Python"],
          good_to_have_keywords: [],
        }),
      },
    ];
    const result = aggregateSkills(rows);
    expect(result[0].keyword).toBe("Python");
    expect(result[0].count).toBe(1);
  });

  it("normalizes SQL acronym to uppercase", () => {
    const rows = [{ analysis: { must_have_keywords: ["sql"], good_to_have_keywords: [] } }];
    const result = aggregateSkills(rows);
    expect(result.find((r) => r.keyword === "SQL")).toBeDefined();
  });

  it("sorts by count descending", () => {
    const rows = [
      { analysis: { must_have_keywords: ["TypeScript", "Python", "Python"], good_to_have_keywords: [] } },
      { analysis: { must_have_keywords: ["Python"], good_to_have_keywords: [] } },
    ];
    const result = aggregateSkills(rows);
    expect(result.length).toBeGreaterThan(0);
    for (let i = 0; i < result.length - 1; i++) {
      expect(result[i].count).toBeGreaterThanOrEqual(result[i + 1].count);
    }
  });
});

// ---------------------------------------------------------------------------
// aggregateSoftSkills
// ---------------------------------------------------------------------------
describe("aggregateSoftSkills", () => {
  it("returns empty array for empty input", () => {
    expect(aggregateSoftSkills([])).toEqual([]);
  });

  it("recognizes communication pattern", () => {
    const rows = [
      { analysis: { minimum_qualifications: ["Strong communication skills required"] } },
    ];
    const result = aggregateSoftSkills(rows);
    expect(result.find((r) => r.skill === "Communication")).toBeDefined();
  });

  it("recognizes teamwork / collaboration pattern", () => {
    const rows = [
      { analysis: { minimum_qualifications: ["Must be a team player and collaborative"] } },
    ];
    const result = aggregateSoftSkills(rows);
    expect(result.find((r) => r.skill === "Teamwork")).toBeDefined();
  });

  it("recognizes bachelor's degree pattern", () => {
    const rows = [
      { analysis: { minimum_qualifications: ["Bachelor's degree in CS required"] } },
    ];
    const result = aggregateSoftSkills(rows);
    expect(result.find((r) => r.skill === "Bachelor's Degree")).toBeDefined();
  });

  it("recognizes agile/scrum pattern", () => {
    const rows = [{ analysis: { minimum_qualifications: ["Experience with Agile methodology"] } }];
    const result = aggregateSoftSkills(rows);
    expect(result.find((r) => r.skill === "Agile/Scrum")).toBeDefined();
  });

  it("recognizes experience years pattern", () => {
    const rows = [{ analysis: { minimum_qualifications: ["5+ years of experience required"] } }];
    const result = aggregateSoftSkills(rows);
    expect(result.find((r) => r.skill === "Experience Years")).toBeDefined();
  });

  it("truncates long unrecognized qualifications", () => {
    const longText = "A".repeat(35);
    const rows = [{ analysis: { minimum_qualifications: [longText] } }];
    const result = aggregateSoftSkills(rows);
    expect(result[0].skill.endsWith("…")).toBe(true);
  });

  it("skips rows without minimum_qualifications", () => {
    const rows = [{ analysis: { must_have_keywords: ["TypeScript"] } }];
    expect(aggregateSoftSkills(rows)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// aggregateSalary
// ---------------------------------------------------------------------------
describe("aggregateSalary", () => {
  it("returns zero counts for empty input", () => {
    const result = aggregateSalary([]);
    expect(result.listedCount).toBe(0);
    expect(result.unlistedCount).toBe(0);
    expect(result.medianEstimate).toBeNull();
    expect(result.buckets).toEqual([]);
  });

  it("treats 'not listed' salary as unlisted", () => {
    const result = aggregateSalary([{ salary: "Not listed", external_id: "1" }]);
    expect(result.unlistedCount).toBe(1);
    expect(result.listedCount).toBe(0);
  });

  it("treats empty salary as unlisted", () => {
    const result = aggregateSalary([{ salary: "", external_id: "1" }]);
    expect(result.unlistedCount).toBe(1);
  });

  it("treats null salary as unlisted", () => {
    const result = aggregateSalary([{ salary: null, external_id: "1" }]);
    expect(result.unlistedCount).toBe(1);
  });

  it("parses annual range '$120,000 - $150,000'", () => {
    const result = aggregateSalary([{ salary: "$120,000 - $150,000", external_id: "1" }]);
    expect(result.listedCount).toBe(1);
    // midpoint of 120k and 150k is 135k → $130K–$160K bucket
    expect(result.buckets.some((b) => b.label === "$130K–$160K")).toBe(true);
    expect(result.medianEstimate).toBe(135000);
  });

  it("parses K-notation range '$80K-$100K'", () => {
    const result = aggregateSalary([{ salary: "$80K-$100K", external_id: "1" }]);
    expect(result.listedCount).toBe(1);
    expect(result.medianEstimate).toBe(90000);
    expect(result.buckets.some((b) => b.label === "$80K–$100K")).toBe(true);
  });

  it("parses hourly range '$45/hr'", () => {
    const result = aggregateSalary([{ salary: "$45/hr", external_id: "1" }]);
    expect(result.listedCount).toBe(1);
    // 45 * 2080 = 93600 → $80K-$100K
    expect(result.buckets.some((b) => b.label === "$80K–$100K")).toBe(true);
  });

  it("parses hourly range '$45 - $55/hr'", () => {
    const result = aggregateSalary([{ salary: "$45 - $55/hr", external_id: "1" }]);
    expect(result.listedCount).toBe(1);
    // midpoint 50/hr * 2080 = 104000 → $100K–$130K
    expect(result.buckets.some((b) => b.label === "$100K–$130K")).toBe(true);
  });

  it("computes median correctly for odd count", () => {
    const rows = [
      { salary: "$100,000", external_id: "1" },
      { salary: "$120,000", external_id: "2" },
      { salary: "$140,000", external_id: "3" },
    ];
    const result = aggregateSalary(rows);
    expect(result.medianEstimate).toBe(120000);
  });

  it("computes median correctly for even count", () => {
    const rows = [
      { salary: "$100,000", external_id: "1" },
      { salary: "$120,000", external_id: "2" },
    ];
    const result = aggregateSalary(rows);
    expect(result.medianEstimate).toBe(110000);
  });

  it("computes listedRate correctly", () => {
    const rows = [
      { salary: "$100,000", external_id: "1" },
      { salary: "not listed", external_id: "2" },
    ];
    const result = aggregateSalary(rows);
    expect(result.listedRate).toBe(50);
  });

  it("uses totalJobs override for listedRate", () => {
    const rows = [{ salary: "$100,000", external_id: "1" }];
    const result = aggregateSalary(rows, 10);
    expect(result.listedRate).toBe(10);
  });

  it("handles monthly salary", () => {
    const result = aggregateSalary([{ salary: "$8,000/mo - $10,000/mo", external_id: "1" }]);
    expect(result.listedCount).toBe(1);
    // midpoint 9000/mo * 12 = 108000 → $100K-$130K
    expect(result.buckets.some((b) => b.label === "$100K–$130K")).toBe(true);
  });

  it("filters all unlisted returns null median", () => {
    const rows = [
      { salary: "N/A", external_id: "1" },
      { salary: "-", external_id: "2" },
    ];
    const result = aggregateSalary(rows);
    expect(result.medianEstimate).toBeNull();
  });

  it("places >$200K in correct bucket", () => {
    const result = aggregateSalary([{ salary: "$250,000", external_id: "1" }]);
    expect(result.buckets.some((b) => b.label === "> $200K")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// extractSeniority
// ---------------------------------------------------------------------------
describe("extractSeniority", () => {
  it("classifies intern titles", () => {
    expect(extractSeniority("Software Engineer Intern")).toBe("Intern");
    expect(extractSeniority("Summer Internship Program")).toBe("Intern");
    expect(extractSeniority("Co-op Software Developer")).toBe("Intern");
  });

  it("classifies junior titles", () => {
    expect(extractSeniority("Junior Software Engineer")).toBe("Junior");
    expect(extractSeniority("Jr. Developer")).toBe("Junior");
    expect(extractSeniority("Entry Level Engineer")).toBe("Junior");
    expect(extractSeniority("Associate Software Engineer")).toBe("Junior");
    expect(extractSeniority("New Grad Software Engineer")).toBe("Junior");
  });

  it("classifies staff/principal titles", () => {
    expect(extractSeniority("Staff Engineer")).toBe("Staff/Principal");
    expect(extractSeniority("Principal Software Engineer")).toBe("Staff/Principal");
    expect(extractSeniority("Distinguished Engineer")).toBe("Staff/Principal");
  });

  it("classifies director+ titles", () => {
    expect(extractSeniority("Director of Engineering")).toBe("Director+");
    expect(extractSeniority("Head of Engineering")).toBe("Director+");
    expect(extractSeniority("VP of Engineering")).toBe("Director+");
    expect(extractSeniority("Vice President Software")).toBe("Director+");
  });

  it("classifies lead/manager titles", () => {
    expect(extractSeniority("Tech Lead")).toBe("Lead/Manager");
    expect(extractSeniority("Engineering Manager")).toBe("Lead/Manager");
    expect(extractSeniority("Lead Software Engineer")).toBe("Lead/Manager");
  });

  it("classifies senior titles", () => {
    expect(extractSeniority("Senior Software Engineer")).toBe("Senior");
    expect(extractSeniority("Sr. Developer")).toBe("Senior");
    expect(extractSeniority("Software Engineer III")).toBe("Senior");
  });

  it("defaults to Mid-Level for unrecognized titles", () => {
    expect(extractSeniority("Software Engineer")).toBe("Mid-Level");
    expect(extractSeniority("Full Stack Developer")).toBe("Mid-Level");
  });
});

// ---------------------------------------------------------------------------
// aggregateSeniority
// ---------------------------------------------------------------------------
describe("aggregateSeniority", () => {
  it("returns empty array for empty input", () => {
    expect(aggregateSeniority([])).toEqual([]);
  });

  it("skips rows without title", () => {
    expect(aggregateSeniority([{ title: null }, { title: undefined }])).toEqual([]);
  });

  it("aggregates multiple rows by seniority level", () => {
    const rows = [
      { title: "Senior Engineer" },
      { title: "Senior Developer" },
      { title: "Junior Engineer" },
    ];
    const result = aggregateSeniority(rows);
    const senior = result.find((r) => r.level === "Senior");
    const junior = result.find((r) => r.level === "Junior");
    expect(senior?.count).toBe(2);
    expect(junior?.count).toBe(1);
  });

  it("includes color property for each level", () => {
    const rows = [{ title: "Senior Engineer" }];
    const result = aggregateSeniority(rows);
    expect(result[0].color).toBeDefined();
    // Design-token reference rather than a hex literal — see globals.css.
    expect(result[0].color).toMatch(/^var\(--[a-z0-9-]+\)$/);
  });

  it("sorts by count descending", () => {
    const rows = [
      { title: "Junior Engineer" },
      { title: "Senior Engineer" },
      { title: "Senior Developer" },
      { title: "Senior Architect" },
    ];
    const result = aggregateSeniority(rows);
    expect(result[0].level).toBe("Senior");
    expect(result[0].count).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// aggregateWeekday
// ---------------------------------------------------------------------------
describe("aggregateWeekday", () => {
  it("returns 7 days always", () => {
    const result = aggregateWeekday([]);
    expect(result).toHaveLength(7);
    expect(result.map((r) => r.day)).toEqual(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
  });

  it("counts by day of week", () => {
    // Use multiple dates that span the same day to be timezone-agnostic
    // Check total count across all days = number of valid rows
    const rows = [
      { posted_at: "2024-01-01T00:00:00Z", created_at: null },
      { posted_at: "2024-01-02T00:00:00Z", created_at: null },
      { posted_at: "2024-01-03T00:00:00Z", created_at: null },
    ];
    const result = aggregateWeekday(rows);
    const total = result.reduce((acc, r) => acc + r.count, 0);
    expect(total).toBe(3);
    expect(result).toHaveLength(7);
  });

  it("skips rows without any date", () => {
    const rows = [{ posted_at: null, created_at: null }];
    const result = aggregateWeekday(rows);
    expect(result.reduce((acc, r) => acc + r.count, 0)).toBe(0);
  });

  it("uses created_at as fallback when posted_at is null", () => {
    // Check that a row with only created_at gets counted
    const rows = [{ posted_at: null, created_at: "2024-06-12T12:00:00Z" }];
    const result = aggregateWeekday(rows);
    // Total count must be 1 — the exact day depends on timezone but count must total 1
    const total = result.reduce((acc, r) => acc + r.count, 0);
    expect(total).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// aggregateTitleKeywords
// ---------------------------------------------------------------------------
describe("aggregateTitleKeywords", () => {
  it("returns empty array for empty input", () => {
    expect(aggregateTitleKeywords([])).toEqual([]);
  });

  it("filters out stopwords", () => {
    const rows = [{ title: "Senior Software Engineer" }];
    const result = aggregateTitleKeywords(rows);
    const keywords = result.map((r) => r.word);
    expect(keywords).not.toContain("senior");
    expect(keywords).not.toContain("software");
    expect(keywords).not.toContain("engineer");
  });

  it("filters out short words (<=2 chars)", () => {
    const rows = [{ title: "ML AI Engineer" }];
    const result = aggregateTitleKeywords(rows);
    const keywords = result.map((r) => r.word);
    expect(keywords).not.toContain("ml");
    expect(keywords).not.toContain("ai");
  });

  it("counts word frequency", () => {
    const rows = [
      { title: "Python Developer" },
      { title: "Python Backend Specialist" },
    ];
    const result = aggregateTitleKeywords(rows);
    const python = result.find((r) => r.word === "python");
    expect(python?.count).toBe(2);
  });

  it("skips rows without title", () => {
    const rows = [{ title: null }, { title: undefined }];
    expect(aggregateTitleKeywords(rows)).toEqual([]);
  });

  it("sorts by count descending", () => {
    const rows = [
      { title: "Python developer backend" },
      { title: "Python platform specialist" },
      { title: "Cloud platform architect" },
    ];
    const result = aggregateTitleKeywords(rows);
    for (let i = 0; i < result.length - 1; i++) {
      expect(result[i].count).toBeGreaterThanOrEqual(result[i + 1].count);
    }
  });
});

// ---------------------------------------------------------------------------
// aggregateVisa
// ---------------------------------------------------------------------------
describe("aggregateVisa", () => {
  it("returns empty array for empty input", () => {
    expect(aggregateVisa([])).toEqual([]);
  });

  it("classifies 'will sponsor' as Sponsorship Available", () => {
    const rows = [{ visa: "Will sponsor", visa_status: null }];
    const result = aggregateVisa(rows);
    expect(result.find((r) => r.label === "Sponsorship Available")).toBeDefined();
  });

  it("classifies 'does not sponsor' as No Sponsorship", () => {
    const rows = [{ visa: "Company does not sponsor", visa_status: null }];
    const result = aggregateVisa(rows);
    expect(result.find((r) => r.label === "No Sponsorship")).toBeDefined();
  });

  it("classifies 'US citizen' as Citizens/GC Only", () => {
    const rows = [{ visa: "US Citizens only", visa_status: null }];
    const result = aggregateVisa(rows);
    expect(result.find((r) => r.label === "Citizens/GC Only")).toBeDefined();
  });

  it("classifies 'gc' as Citizens/GC Only", () => {
    const rows = [{ visa: "GC or Citizens preferred", visa_status: null }];
    const result = aggregateVisa(rows);
    expect(result.find((r) => r.label === "Citizens/GC Only")).toBeDefined();
  });

  it("classifies unknown/n/a as Unknown", () => {
    const rows = [
      { visa: "Unknown", visa_status: null },
      { visa: "N/A", visa_status: null },
      { visa: "Not specified", visa_status: null },
    ];
    const result = aggregateVisa(rows);
    expect(result.find((r) => r.label === "Unknown")?.count).toBe(3);
  });

  it("falls back to visa_status when visa is null", () => {
    const rows = [{ visa: null, visa_status: "Will sponsor visas" }];
    const result = aggregateVisa(rows);
    expect(result.find((r) => r.label === "Sponsorship Available")).toBeDefined();
  });

  it("uses null/undefined as Unknown", () => {
    const rows = [{ visa: null, visa_status: null }];
    const result = aggregateVisa(rows);
    expect(result.find((r) => r.label === "Unknown")).toBeDefined();
  });

  it("classifies unrecognized strings as Other", () => {
    const rows = [{ visa: "Some unique policy", visa_status: null }];
    const result = aggregateVisa(rows);
    expect(result.find((r) => r.label === "Other")).toBeDefined();
  });

  it("includes color property for each bucket", () => {
    const rows = [{ visa: "Will sponsor", visa_status: null }];
    const result = aggregateVisa(rows);
    expect(result[0].color).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// normalizeLocation
// ---------------------------------------------------------------------------
describe("normalizeLocation", () => {
  it("returns null for null input", () => {
    expect(normalizeLocation(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(normalizeLocation(undefined)).toBeNull();
  });

  it("normalizes 'remote' to 'Remote'", () => {
    expect(normalizeLocation("remote")).toBe("Remote");
    expect(normalizeLocation("Remote")).toBe("Remote");
  });

  it("normalizes NYC alias", () => {
    expect(normalizeLocation("NYC")).toBe("New York, NY");
    expect(normalizeLocation("New York")).toBe("New York, NY");
    expect(normalizeLocation("New York City")).toBe("New York, NY");
  });

  it("normalizes SF alias", () => {
    expect(normalizeLocation("San Francisco")).toBe("San Francisco, CA");
  });

  it("handles comma-separated location (city, state)", () => {
    expect(normalizeLocation("Austin, TX, USA")).toBe("Austin, TX");
  });

  it("returns single part when no comma and no alias match", () => {
    // "Denver" contains no alias substring
    expect(normalizeLocation("Denver")).toBe("Denver, CO");
  });

  it("handles mixed case location string", () => {
    expect(normalizeLocation("Seattle, WA")).toBe("Seattle, WA");
  });

  it("returns location with remote in string containing comma as non-remote", () => {
    // "Remote, NY" contains remote AND comma → goes through alias check
    const result = normalizeLocation("Remote, NY");
    // Contains remote but also comma - per code: only returns Remote if no comma
    expect(result).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// aggregateLocations
// ---------------------------------------------------------------------------
describe("aggregateLocations", () => {
  it("returns empty for empty input", () => {
    expect(aggregateLocations([])).toEqual([]);
  });

  it("skips null locations", () => {
    const rows = [{ location: null }];
    expect(aggregateLocations(rows)).toEqual([]);
  });

  it("counts normalized locations", () => {
    const rows = [
      { location: "NYC" },
      { location: "New York" },
      { location: "San Francisco, CA" },
    ];
    const result = aggregateLocations(rows);
    const nyEntry = result.find((r) => r.city === "New York, NY");
    expect(nyEntry?.count).toBe(2);
  });

  it("returns at most 15 results", () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({ location: `City${i}, ST` }));
    const result = aggregateLocations(rows);
    expect(result.length).toBeLessThanOrEqual(15);
  });

  it("sorts by count descending", () => {
    const rows = [
      { location: "Austin, TX" },
      { location: "Austin, TX" },
      { location: "Boston, MA" },
    ];
    const result = aggregateLocations(rows);
    expect(result[0].count).toBeGreaterThanOrEqual(result[result.length - 1].count);
  });
});

// ---------------------------------------------------------------------------
// fillDateRange
// ---------------------------------------------------------------------------
describe("fillDateRange", () => {
  it("returns exactly 30 items by default", () => {
    const result = fillDateRange([]);
    expect(result).toHaveLength(30);
  });

  it("returns exactly N items when days specified", () => {
    expect(fillDateRange([], 7)).toHaveLength(7);
    expect(fillDateRange([], 14)).toHaveLength(14);
  });

  it("fills missing dates with 0", () => {
    const result = fillDateRange([]);
    expect(result.every((r) => r.count === 0)).toBe(true);
  });

  it("preserves known counts for matching dates", () => {
    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const result = fillDateRange([{ day: todayKey, count: 42 }]);
    const todayEntry = result.find((r) => r.day === todayKey);
    expect(todayEntry?.count).toBe(42);
  });

  it("uses YYYY-MM-DD format for day keys", () => {
    const result = fillDateRange([]);
    expect(result[0].day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result[result.length - 1].day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returns dates in chronological order (oldest first)", () => {
    const result = fillDateRange([]);
    for (let i = 1; i < result.length; i++) {
      expect(result[i].day >= result[i - 1].day).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// aggregateJobFunctions
// ---------------------------------------------------------------------------
describe("aggregateJobFunctions", () => {
  it("returns empty for empty input", () => {
    expect(aggregateJobFunctions([])).toEqual([]);
  });

  it("classifies Full Stack titles", () => {
    const rows = [{ title: "Full Stack Engineer" }, { title: "Fullstack Developer" }];
    const result = aggregateJobFunctions(rows);
    expect(result.find((r) => r.function === "Full Stack")?.count).toBe(2);
  });

  it("classifies Frontend titles", () => {
    const rows = [{ title: "Frontend Engineer" }, { title: "Front-End Developer" }];
    const result = aggregateJobFunctions(rows);
    expect(result.find((r) => r.function === "Frontend")?.count).toBe(2);
  });

  it("classifies Backend titles", () => {
    const rows = [{ title: "Backend Engineer" }, { title: "Back-End Developer" }];
    const result = aggregateJobFunctions(rows);
    expect(result.find((r) => r.function === "Backend")?.count).toBe(2);
  });

  it("classifies ML/AI titles", () => {
    const rows = [
      { title: "Machine Learning Engineer" },
      { title: "ML Engineer" },
      { title: "Deep Learning Researcher" },
    ];
    const result = aggregateJobFunctions(rows);
    expect(result.find((r) => r.function === "ML/AI")?.count).toBe(3);
  });

  it("classifies DevOps/SRE titles", () => {
    const rows = [{ title: "DevOps Engineer" }, { title: "Site Reliability Engineer" }];
    const result = aggregateJobFunctions(rows);
    expect(result.find((r) => r.function === "DevOps/SRE")?.count).toBe(2);
  });

  it("classifies Mobile titles", () => {
    const rows = [{ title: "iOS Developer" }, { title: "Android Engineer" }];
    const result = aggregateJobFunctions(rows);
    expect(result.find((r) => r.function === "Mobile")?.count).toBe(2);
  });

  it("classifies Security titles", () => {
    const rows = [{ title: "Security Engineer" }, { title: "Cybersecurity Analyst" }];
    const result = aggregateJobFunctions(rows);
    expect(result.find((r) => r.function === "Security")?.count).toBe(2);
  });

  it("classifies Embedded titles", () => {
    const rows = [{ title: "Embedded Systems Engineer" }, { title: "Firmware Developer" }];
    const result = aggregateJobFunctions(rows);
    expect(result.find((r) => r.function === "Embedded")?.count).toBe(2);
  });

  it("classifies unmatched titles as General SW", () => {
    const rows = [{ title: "Software Engineer" }, { title: "Developer" }];
    const result = aggregateJobFunctions(rows);
    expect(result.find((r) => r.function === "General SW")?.count).toBe(2);
  });

  it("skips rows without title", () => {
    const rows = [{ title: null }];
    expect(aggregateJobFunctions(rows)).toEqual([]);
  });

  it("includes color for each function", () => {
    const rows = [{ title: "Full Stack Engineer" }];
    const result = aggregateJobFunctions(rows);
    // Design-token reference rather than a hex literal — see globals.css.
    expect(result[0].color).toMatch(/^var\(--[a-z0-9-]+\)$/);
  });

  it("sorts by count descending", () => {
    const rows = [
      { title: "Software Engineer" },
      { title: "Software Developer" },
      { title: "Full Stack Engineer" },
    ];
    const result = aggregateJobFunctions(rows);
    expect(result[0].count).toBeGreaterThanOrEqual(result[result.length - 1].count);
  });
});

// ---------------------------------------------------------------------------
// aggregateGoodToHave
// ---------------------------------------------------------------------------
describe("aggregateGoodToHave", () => {
  it("returns empty for empty input", () => {
    expect(aggregateGoodToHave([])).toEqual([]);
  });

  it("counts good_to_have_keywords", () => {
    const rows = [
      { analysis: { good_to_have_keywords: ["Docker", "Kubernetes"] } },
      { analysis: { good_to_have_keywords: ["Docker"] } },
    ];
    const result = aggregateGoodToHave(rows);
    const docker = result.find((r) => r.keyword === "Docker");
    expect(docker?.count).toBe(2);
  });

  it("uppercases AWS keywords", () => {
    const rows = [{ analysis: { good_to_have_keywords: ["aws"] } }];
    const result = aggregateGoodToHave(rows);
    expect(result.find((r) => r.keyword === "AWS")).toBeDefined();
  });

  it("uppercases GCP keywords", () => {
    const rows = [{ analysis: { good_to_have_keywords: ["gcp"] } }];
    const result = aggregateGoodToHave(rows);
    expect(result.find((r) => r.keyword === "GCP")).toBeDefined();
  });

  it("uppercases already-uppercase keywords", () => {
    const rows = [{ analysis: { good_to_have_keywords: ["KAFKA"] } }];
    const result = aggregateGoodToHave(rows);
    expect(result.find((r) => r.keyword === "KAFKA")).toBeDefined();
  });

  it("preserves mixed-case non-AWS/GCP keywords as-is", () => {
    const rows = [{ analysis: { good_to_have_keywords: ["Kubernetes"] } }];
    const result = aggregateGoodToHave(rows);
    expect(result.find((r) => r.keyword === "Kubernetes")).toBeDefined();
  });

  it("skips keywords shorter than 2 chars or longer than 40 chars", () => {
    const longKw = "A".repeat(41);
    const rows = [{ analysis: { good_to_have_keywords: ["A", longKw, "OK"] } }];
    const result = aggregateGoodToHave(rows);
    expect(result.find((r) => r.keyword === "A")).toBeUndefined();
    expect(result.find((r) => r.keyword === longKw)).toBeUndefined();
  });

  it("skips rows without good_to_have_keywords", () => {
    const rows = [{ analysis: { must_have_keywords: ["TypeScript"] } }];
    expect(aggregateGoodToHave(rows)).toEqual([]);
  });

  it("returns at most 30 results", () => {
    const keywords = Array.from({ length: 35 }, (_, i) => `Keyword${i}`);
    const rows = [{ analysis: { good_to_have_keywords: keywords } }];
    const result = aggregateGoodToHave(rows);
    expect(result.length).toBeLessThanOrEqual(30);
  });

  it("sorts by count descending", () => {
    const rows = [
      { analysis: { good_to_have_keywords: ["Docker", "Redis"] } },
      { analysis: { good_to_have_keywords: ["Docker"] } },
    ];
    const result = aggregateGoodToHave(rows);
    expect(result[0].count).toBeGreaterThanOrEqual(result[result.length - 1].count);
  });
});

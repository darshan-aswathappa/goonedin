import "@testing-library/jest-dom";
import { tierColor, TIER_COLORS } from "@/lib/tokens";

describe("tierColor", () => {
  it("index 0-3 returns TIER_COLORS[0]", () => {
    expect(tierColor(0)).toBe(TIER_COLORS[0]);
    expect(tierColor(1)).toBe(TIER_COLORS[0]);
    expect(tierColor(2)).toBe(TIER_COLORS[0]);
    expect(tierColor(3)).toBe(TIER_COLORS[0]);
  });

  it("index 4-7 returns TIER_COLORS[1]", () => {
    expect(tierColor(4)).toBe(TIER_COLORS[1]);
    expect(tierColor(5)).toBe(TIER_COLORS[1]);
    expect(tierColor(6)).toBe(TIER_COLORS[1]);
    expect(tierColor(7)).toBe(TIER_COLORS[1]);
  });

  it("index 8-11 returns TIER_COLORS[2]", () => {
    expect(tierColor(8)).toBe(TIER_COLORS[2]);
    expect(tierColor(11)).toBe(TIER_COLORS[2]);
  });

  it("index 12-15 returns TIER_COLORS[3]", () => {
    expect(tierColor(12)).toBe(TIER_COLORS[3]);
    expect(tierColor(15)).toBe(TIER_COLORS[3]);
  });

  it("index 16-19 returns TIER_COLORS[4]", () => {
    expect(tierColor(16)).toBe(TIER_COLORS[4]);
    expect(tierColor(19)).toBe(TIER_COLORS[4]);
  });

  it("index >= TIER_COLORS.length * 4 falls back to last color", () => {
    // TIER_COLORS has 5 entries; index 20+ would be Math.floor(20/4)=5 which is out of bounds
    const lastColor = TIER_COLORS[TIER_COLORS.length - 1];
    expect(tierColor(20)).toBe(lastColor);
    expect(tierColor(100)).toBe(lastColor);
  });

  it("each tier color is a CSS var string", () => {
    for (let i = 0; i < 20; i++) {
      expect(tierColor(i)).toMatch(/^var\(--/);
    }
  });
});

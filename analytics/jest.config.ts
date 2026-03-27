import type { Config } from "jest";
import nextJest from "next/jest.js";

const createJestConfig = nextJest({ dir: "./" });

const config: Config = {
  coverageProvider: "v8",
  testEnvironment: "jsdom",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  collectCoverageFrom: [
    // Core lib utilities — fully tested
    "src/lib/analytics.ts",
    "src/lib/tokens.ts",
    "src/lib/blocked-companies.ts",
    // Components with tests
    "src/components/EmptyPanel.tsx",
    "src/components/MetricCard.tsx",
    "src/components/ChartErrorBoundary.tsx",
    "src/components/SafePanel.tsx",
    "src/components/ScanlineOverlay.tsx",
    "src/components/CommandPalette.tsx",
    "src/components/DashboardTabs.tsx",
    "src/components/TabNav.tsx",
  ],
  coverageThreshold: {
    global: {
      lines: 85,
      functions: 85,
      branches: 75,
      statements: 85,
    },
  },
};

export default createJestConfig(config);

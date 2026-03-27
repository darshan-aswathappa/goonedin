import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname, "../../"),
  experimental: {
    optimizePackageImports: ["@phosphor-icons/react", "recharts", "date-fns"],
  },
};

export default nextConfig;

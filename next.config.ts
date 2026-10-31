import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Runtime reads committed snapshots from data/ with fs. Include exactly those, never raw downloads.
  outputFileTracingIncludes: {
    "/research/[sym]": [
      "./data/universe.json",
      "./data/manifest.json",
      "./data/fundamentals/**",
      "./data/filings/**",
      "./data/research/*/dossier.json",
    ],
  },
  outputFileTracingExcludes: {
    "/*": ["./data/raw/**", "./data/cache/pdf/**", "./data/spike-samples/**"],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

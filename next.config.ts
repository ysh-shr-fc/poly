import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Glossaries are discovered with readdirSync at runtime, which file tracing can't follow.
  outputFileTracingIncludes: { "/**": ["./data/*.glossary.csv"] },
};

export default nextConfig;

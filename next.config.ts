import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ship the Decision-Forge prompt with the serverless function.
  outputFileTracingIncludes: { "/api/forge": ["./prompts/**/*"] },
};

export default nextConfig;

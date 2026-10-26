import { resolve } from "node:path";
import type { NextConfig } from "next";

const repoRoot = resolve(import.meta.dirname, "..");

const nextConfig: NextConfig = {
  // The API routes import shared code from ../local.
  turbopack: { root: repoRoot },
  outputFileTracingRoot: repoRoot,
};

export default nextConfig;

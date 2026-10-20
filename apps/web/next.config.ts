import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { NextConfig } from 'next';

// Host-side dev: reuse the repo-root .env (real environment variables always win).
const rootEnv = resolve(process.cwd(), '../../.env');
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const nextConfig: NextConfig = {
  // Self-contained server bundle for the Docker image (Phase 10).
  output: 'standalone',
  // Trace workspace dependencies (@um/shared) from the monorepo root.
  outputFileTracingRoot: resolve(process.cwd(), '../..'),
  poweredByHeader: false,
  reactStrictMode: true,
  // Linting runs from the repo root (`pnpm lint`), not during `next build`.
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    optimizePackageImports: ['@mui/material', '@mui/icons-material'],
  },
};

export default nextConfig;

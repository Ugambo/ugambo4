import path from 'node:path';
import type { NextConfig } from 'next';

const monorepoRoot = path.join(__dirname, '../..');

const config: NextConfig = {
  // Self-contained server bundle for the Docker image.
  output: 'standalone',
  outputFileTracingRoot: monorepoRoot,
  turbopack: { root: monorepoRoot },
  poweredByHeader: false,
  reactStrictMode: true,
};

export default config;

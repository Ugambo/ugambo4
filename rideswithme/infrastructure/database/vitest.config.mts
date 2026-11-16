import { defineConfig } from 'vitest/config';

// Backup round-trip tests need PostgreSQL (pg_dump 16+) and S3-compatible storage.
export default defineConfig({ test: { include: ['src/**/*.test.ts'], testTimeout: 60_000 } });

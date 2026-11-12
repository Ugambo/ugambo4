import { defineConfig } from 'vitest/config';

// Unit tests for the app's plain TypeScript logic (no React Native imports).
export default defineConfig({ test: { include: ['src/**/*.test.ts'] } });

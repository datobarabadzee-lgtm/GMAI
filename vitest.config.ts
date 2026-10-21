import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // `server-only` is a build-time guard for Next.js; in tests it is a no-op.
      'server-only': path.resolve(__dirname, './src/tests/stubs/server-only.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/tests/**/*.test.ts'],
    globals: true,
    // Unit tests must not depend on third-party APIs being up. Live sources are
    // exercised by the deployment smoke test instead.
    // Tests run as the internal tier unless a test sets APP_TIER=public itself;
    // the application's own default (no APP_TIER) is the public tier.
    env: { DISABLE_LIVE_SOURCES: '1', APP_TIER: 'internal' },
  },
});

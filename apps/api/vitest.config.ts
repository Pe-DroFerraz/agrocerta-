import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    env: { LOCAL_DEMO_ACCESS: '0' },
    include: ['test/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 180000,
  },
});

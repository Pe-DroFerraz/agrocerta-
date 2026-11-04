import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
    trace: 'retain-on-failure',
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH || undefined,
      args: process.env.CHROMIUM_PATH ? ['--no-sandbox'] : [],
    },
  },
  webServer: [
    {
      command: 'npm run dev -w @agrocerta/api',
      url: 'http://127.0.0.1:3333/api/health',
      reuseExistingServer: !process.env.CI,
      timeout: 60000,
      env: {
        ...process.env,
        NODE_ENV: 'development',
        LOCAL_DEMO_ACCESS: '1',
        API_HOST: '127.0.0.1',
      },
    },
    {
      command: 'npm run dev -w @agrocerta/web',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 60000,
      env: { ...process.env, NODE_ENV: 'development' },
    },
  ],
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
    { name: 'tablet', use: { viewport: { width: 768, height: 1024 } } },
    { name: 'mobile', use: { viewport: { width: 360, height: 800 } } },
  ],
});

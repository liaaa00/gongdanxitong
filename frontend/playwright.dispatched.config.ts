import { defineConfig } from '@playwright/test';

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;

export default defineConfig({
  testDir: './e2e',
  testMatch: /dispatched-orders-500-regression\.spec\.ts/,
  timeout: 90_000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:5174',
    headless: true,
    screenshot: 'only-on-failure',
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  webServer: {
    command: 'npx vite --host 0.0.0.0 --port 5174',
    url: 'http://localhost:5174',
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      VITE_API_BASE_URL: 'http://localhost:3100',
    },
  },
});

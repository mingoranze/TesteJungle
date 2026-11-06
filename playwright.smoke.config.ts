import { defineConfig, devices } from '@playwright/test';

/** Smoke test contra uma URL publicada (sem servidor local). Uso: PUBLIC_URL=https://... npm run test:smoke */
const baseURL = process.env.PUBLIC_URL;

if (!baseURL) {
  throw new Error('Defina PUBLIC_URL com a URL publicada, por exemplo PUBLIC_URL=https://exemplo.vercel.app');
}

export default defineConfig({
  testDir: './smoke',
  fullyParallel: true,
  retries: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report-smoke', open: 'never' }],
  ],
  outputDir: 'test-results-smoke',
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    {
      name: 'chromium-mobile',
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    },
  ],
});

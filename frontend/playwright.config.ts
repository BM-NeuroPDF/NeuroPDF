import { defineConfig, devices } from '@playwright/test';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// require('dotenv').config();

/**
 * See https://playwright.dev/docs/test-configuration.
 */
/** Docker compose / `next start` (CI) = HTTP on 127.0.0.1. Host-only `npm run dev` with mkcert → set PLAYWRIGHT_BASE_URL=https://localhost:3000 */
const playwrightBaseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000';

export default defineConfig({
  testDir: './e2e/tests',

  globalTeardown: './e2e/global-teardown.ts',

  /* Global setup: Seed test user before running tests */
  // Manual user is used now, so global setup is disabled
  // globalSetup: './e2e/support/global-setup.mjs',

  /* Only match test files in e2e directory */
  testMatch: /.*\.spec\.(ts|tsx|js|jsx)$/,

  /* Run tests in files in parallel */
  fullyParallel: true,

  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,

  /* Local: 2 retries (Fedora flake). CI: 1 retry — fewer total attempts keeps the suite inside job timeout. */
  retries: process.env.CI ? 1 : 2,

  /* Global test timeout - Fedora'da LLM işlemleri için yeterli süre */
  timeout: 90000,

  workers: 2,

  /* Terminal: line = her test satırı (list bazen uzun koşularda “boş” hissi verir). HTML asla otomatik tarayıcı açmaz; teardown’da show-report hatırlatılır. */
  reporter: process.env.CI
    ? [['github'], ['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : [['line'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],

  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: playwrightBaseURL,
    /* Self-signed / mkcert only when base URL is https:// */
    ignoreHTTPSErrors: playwrightBaseURL.startsWith('https'),

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'Mobile (375p)',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 375, height: 812 },
      },
    },

    {
      name: 'Tablet (600p)',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 600, height: 900 },
      },
    },

    {
      name: 'Laptop (1366p)',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1366, height: 768 },
      },
    },

    {
      name: 'Desktop HD (720p)',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
      },
    },

    {
      name: 'Desktop FHD (1080p)',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 },
      },
    },

    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    {
      name: 'webkit',
      use: {
        ...devices['Desktop Safari'],
        // Fedora kütüphane hatası nedeniyle Chromium üzerinden emüle ediyoruz
        browserName: 'chromium',
      },
    },

    /* Test against mobile viewports. */
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
    // {
    //   name: 'Mobile Safari',
    //   use: { ...devices['iPhone 12'] },
    // },

    /* Test against branded browsers. */
    // {
    //   name: 'Microsoft Edge',
    //   use: { ...devices['Desktop Edge'], channel: 'msedge' },
    // },
    // {
    //   name: 'Google Chrome',
    //   use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    // },
  ],

  /* GitHub Actions: production server after build. Local: start dev manually or uncomment dev webServer. */
  webServer: process.env.CI
    ? {
        command: 'npx next start',
        url: 'http://127.0.0.1:3000',
        reuseExistingServer: false,
        timeout: 120_000,
      }
    : undefined,
});

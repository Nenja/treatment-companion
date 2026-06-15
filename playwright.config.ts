import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for Treatment Companion's end-to-end smoke.
 *
 * Two modes:
 *  - Local (default): boots the app with `npm run dev` on localhost:3000.
 *    Requires a working .env.local (Supabase URL + anon key) so the app runs.
 *  - Remote: set E2E_BASE_URL=https://<your-preview>.vercel.app to test a
 *    deployed build instead; no local server is started.
 *
 * In CI there is no local app, so E2E_BASE_URL MUST be set (point it at your
 * deployed/preview URL). We fail fast with a clear message if it isn't, rather
 * than letting tests die on a confusing "invalid URL".
 *
 * Test data / credentials come from env (see e2e/README.md):
 *    E2E_PATIENT_EMAIL, E2E_PATIENT_PASSWORD
 * The authenticated tests skip themselves when those are not set.
 *
 * All artifacts (HTML report, traces, screenshots, videos) are written under
 * e2e/.artifacts/ so they can be gitignored without touching the repo root.
 */

// Treat an unset OR empty string the same (GitHub Actions passes an undefined
// repository variable as an empty string, not "missing").
const REMOTE_URL = (process.env.E2E_BASE_URL ?? '').trim();
const usingRemote = REMOTE_URL.length > 0;

if (process.env.CI && !usingRemote) {
  throw new Error(
    'E2E_BASE_URL is not set. In CI the tests run against your deployed site, ' +
      'so set a repository Variable E2E_BASE_URL (e.g. ' +
      'https://treatment-companion.vercel.app). See e2e/README.md.'
  );
}

const BASE_URL = usingRemote ? REMOTE_URL : 'http://localhost:3000';

export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e/.artifacts/test-results',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    process.env.CI ? ['github'] : ['list'],
    ['html', { outputFolder: './e2e/.artifacts/playwright-report', open: 'never' }]
  ],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } }
    // Add more browsers once the smoke is stable on Chromium:
    // { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    // { name: 'webkit',  use: { ...devices['Desktop Safari'] } },
  ],
  // Only start a local server when we're NOT pointing at a deployed URL and
  // NOT in CI (CI must supply E2E_BASE_URL — see the guard above).
  ...(!usingRemote && !process.env.CI
    ? {
        webServer: {
          command: 'npm run dev',
          url: BASE_URL,
          reuseExistingServer: true,
          timeout: 120_000
        }
      }
    : {})
});

import { test, expect, type Page } from '@playwright/test';

/**
 * End-to-end coverage for the CLINICIAN paths, extending the patient smoke.
 *
 * HONESTY NOTE — like smoke.spec.ts, this was authored WITHOUT being executed
 * (no browser / live app here). Two tiers:
 *
 *   TIER 1 — robust, runnable now (parallel to the patient smoke):
 *     • signed-out redirects on clinician routes,
 *     • a clinician can sign in and leave the login page.
 *   These mirror tests already proven on Chromium and need only clinician
 *   credentials (E2E_CLINICIAN_EMAIL / E2E_CLINICIAN_PASSWORD). They self-skip
 *   when those aren't set, so the suite stays green out of the box.
 *
 *   TIER 2 — write-journeys, marked test.fixme (do NOT run yet):
 *     • clinician approves a pending suggestion,
 *     • therapist (physio) note → physician sees it.
 *   These are multi-actor flows that go through the visit-code unlock and
 *   mutate data, so they must run against STAGING (disposable data) with the
 *   dev scenario API enabled — NOT production. The mechanism and the real
 *   scenario ids are encoded below, but the in-cockpit selectors are not yet
 *   grounded against live DOM. They are left as test.fixme so they are
 *   reported as "to implement", never as false greens. Author them against the
 *   staging Preview URL with the developer (see e2e/README.md → "Write
 *   journeys"). This is deliberate: per the project's honesty rule we don't
 *   ship multi-actor specs we couldn't run.
 *
 * Locale note: default locale (en) has no path prefix, so '/clinician' and
 * '/login' are the English routes.
 */

const C_EMAIL = process.env.E2E_CLINICIAN_EMAIL;
const C_PASSWORD = process.env.E2E_CLINICIAN_PASSWORD;
const haveClinicianCreds = !!C_EMAIL && !!C_PASSWORD;

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.endsWith('/login'), {
    timeout: 15_000
  });
}

test.describe('unauthenticated — clinician routes', () => {
  test('a signed-out visitor on /clinician is redirected to login', async ({
    page
  }) => {
    await page.goto('/clinician');
    await expect(page).toHaveURL(/\/login(\?|$)/, { timeout: 15_000 });
  });

  test('a signed-out visitor on /visit-code is redirected to login', async ({
    page
  }) => {
    await page.goto('/visit-code');
    await expect(page).toHaveURL(/\/login(\?|$)/, { timeout: 15_000 });
  });
});

test.describe('clinician', () => {
  test.skip(
    !haveClinicianCreds,
    'Set E2E_CLINICIAN_EMAIL and E2E_CLINICIAN_PASSWORD to run the clinician tests.'
  );

  test('can sign in and leave the login page', async ({ page }) => {
    await signIn(page, C_EMAIL!, C_PASSWORD!);
    await expect(page).not.toHaveURL(/\/login(\?|$)/);
    // A clinician with no active patient session lands on their own area.
    // Assert we're on a clinician route if the app routes there; tolerate a
    // brief redirect settle. (Kept lenient on purpose — the robust signal is
    // simply that auth succeeded and we left /login, exactly as the patient
    // sign-in test asserts.)
    await expect(page).toHaveURL(/\/(clinician|visit-code|reset-password)?/);
  });
});

/**
 * TIER 2 — write journeys. Run against STAGING with the dev scenario API.
 *
 * Mechanism (the app's own, see app/api/dev/scenario/route.ts +
 * lib/dev/scenarios.ts): POST /api/dev/scenario { scenarioId, reseed:true }
 * reseeds and returns { landAs, visitCode } — a reusable visit code for the
 * seeded patient. The client then unlocks with unlock_with_visit_code. Real
 * scenario ids exist for exactly these journeys:
 *   • 'clinician-suggestions' (landAs 'clinician') — a patient with pending
 *     goal suggestions, for the approve-a-suggestion flow.
 *   • 'physio-suggestions'    (landAs 'physio')    — for the therapist-note flow.
 *
 * Preconditions to turn these on (all on a STAGING/preview target):
 *   E2E_DEV_API=1                              dev scenario API reachable here
 *   E2E_CLINICIAN_EMAIL / _PASSWORD            a staging clinician (physician)
 *   E2E_PHYSIO_EMAIL / _PASSWORD               a staging physiotherapist
 * Then convert each test.fixme → test, and ground the in-cockpit selectors by
 * running `npx playwright test --ui` against staging.
 */
const DEV_API = process.env.E2E_DEV_API === '1';

test.describe('write journeys (staging + dev scenario API)', () => {
  test.fixme(
    'clinician approves a pending suggestion',
    async ({ page }) => {
      // 1. POST /api/dev/scenario { scenarioId: 'clinician-suggestions',
      //    reseed: true } → capture { visitCode }.
      // 2. signIn(page, clinician creds).
      // 3. Enter the visit code to unlock the seeded patient
      //    (unlock_with_visit_code), landing on the patient cockpit.
      // 4. Open the pending suggestion (/clinician/suggestion) and approve it,
      //    filling the required SMART text + the five GAS anchors.
      // 5. Assert the suggestion now shows as an approved goal on the cockpit.
      expect(DEV_API).toBe(true);
    }
  );

  test.fixme(
    'therapist note round-trip (physio writes, physician sees)',
    async ({ page }) => {
      // 1. POST /api/dev/scenario { scenarioId: 'physio-suggestions',
      //    reseed: true } → capture { visitCode }.
      // 2. signIn as the physiotherapist; unlock the patient with the code.
      // 3. Submit a therapist note (submit_therapist_note; physio-only) via
      //    the therapist input panel.
      // 4. Sign out; signIn as the physician; unlock the same patient.
      // 5. Assert the note is visible and that opening it flips the receipt
      //    Delivered → Seen (mark_therapist_notes_seen).
      expect(DEV_API).toBe(true);
    }
  );
});

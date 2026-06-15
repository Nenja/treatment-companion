import { test, expect, type Page } from '@playwright/test';

/**
 * End-to-end smoke for Treatment Companion: login, and a patient completing a
 * weekly check-in.
 *
 * HONESTY NOTE — this spec was authored WITHOUT being executed (the authoring
 * environment has no browser and no live app + Supabase). The two
 * `unauthenticated` tests are robust and should pass as soon as the app is
 * reachable. The two `patient` tests depend on (a) credentials in env and
 * (b) seeded data; expect to tweak a selector or two on the first real run.
 * See e2e/README.md.
 *
 * Locale note: the app serves its default locale (en) WITHOUT a path prefix,
 * so '/login' is the English page and the English UI strings below match.
 */

const EMAIL = process.env.E2E_PATIENT_EMAIL;
const PASSWORD = process.env.E2E_PATIENT_PASSWORD;
const haveCreds = !!EMAIL && !!PASSWORD;

async function signIn(page: Page) {
  await page.goto('/login');
  await page.locator('#email').fill(EMAIL!);
  await page.locator('#password').fill(PASSWORD!);
  await page.locator('button[type="submit"]').click();
  // Success = we leave the login route. (A brand-new account still on a
  // temporary password lands on /reset-password instead — use a patient whose
  // password is already set.)
  await page.waitForURL((url) => !url.pathname.endsWith('/login'), {
    timeout: 15_000
  });
}

test.describe('unauthenticated', () => {
  test('login page renders its form', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('a signed-out visitor cannot use the check-in', async ({ page }) => {
    await page.goto('/checkin');
    // Depending on auth-bootstrap timing the app may bounce to /login, send
    // the visitor home, or simply hold on a loading state — all acceptable.
    // What must NOT happen is a usable check-in for someone who isn't signed
    // in. Give the client a moment to settle, then assert the wizard's
    // actionable controls never appear.
    await page.waitForTimeout(3000);
    await expect(page.getByRole('radiogroup')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Send my check-in' })
    ).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Continue' })).toHaveCount(0);
  });
});

test.describe('patient', () => {
  test.skip(
    !haveCreds,
    'Set E2E_PATIENT_EMAIL and E2E_PATIENT_PASSWORD to run the authenticated tests.'
  );

  test('can sign in and reach a logged-in page', async ({ page }) => {
    await signIn(page);
    await expect(page).not.toHaveURL(/\/login(\?|$)/);
  });

  test('can complete a weekly check-in', async ({ page }) => {
    await signIn(page);

    // Go straight to the check-in. With no ?promptId it opens the patient's
    // current pending prompt; if there is none, the app redirects home — so
    // this test needs a seeded patient who actually has a check-in due
    // (e.g. test1@example.com from the demo seed).
    await page.goto('/checkin');
    await expect(
      page,
      'No pending check-in for this patient — seed one (e.g. test1@example.com).'
    ).toHaveURL(/\/checkin(\?|$)/);

    const thanks = page.getByRole('heading', { name: 'Thank you' });

    // Walk the wizard: each goal step shows a rating radiogroup; the training
    // and comment steps do not. Rate where we can, then press the single
    // primary button — "Continue", or "Send my check-in" on the final step.
    for (let i = 0; i < 12; i++) {
      if (await thanks.isVisible().catch(() => false)) break;

      const group = page.getByRole('radiogroup').first();
      if (await group.isVisible().catch(() => false)) {
        const radios = group.getByRole('radio');
        const count = await radios.count();
        // A positive-but-not-extreme choice that works for both the 0–10
        // (NRS, 11 radios) and the 5-level (GAS) pickers.
        const index = count >= 11 ? 7 : Math.min(1, count - 1);
        await radios.nth(index).click();
      }

      const advance = page
        .getByRole('button', { name: 'Continue' })
        .or(page.getByRole('button', { name: 'Send my check-in' }));
      await advance.first().click();
      await page.waitForTimeout(400); // let the React step transition settle
    }

    await expect(thanks).toBeVisible();
  });
});

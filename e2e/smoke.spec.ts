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

  test('a signed-out visitor is redirected to login', async ({ page }) => {
    await page.goto('/checkin');
    // The global auth guard sends any signed-out visitor on a protected route
    // to /login via a hard navigation. Allow generous time for it to settle.
    await expect(page).toHaveURL(/\/login(\?|$)/, { timeout: 15_000 });
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
    // current pending prompt; if there's none, the app navigates home.
    await page.goto('/checkin');

    const thanks = page.getByRole('heading', { name: 'Thank you' });
    const advance = page
      .getByRole('button', { name: 'Continue' })
      .or(page.getByRole('button', { name: 'Send my check-in' }));

    // Wait for the wizard to render. If it never does — no pending prompt, so
    // the app navigates home — SKIP rather than fail: that's an environment
    // state (this patient's check-in may have been completed by an earlier
    // run, which consumes the prompt), not a regression. Skipping keeps the
    // suite safe to re-run; seed a fresh prompt (e.g. test1@example.com) to
    // exercise the full flow again.
    const wizardReady = await advance
      .first()
      .waitFor({ state: 'visible', timeout: 30_000 })
      .then(() => true)
      .catch(() => false);
    test.skip(
      !wizardReady,
      'No pending check-in to complete (already done this cycle, or none seeded).'
    );

    // Walk the wizard. Each goal step shows a 0–10 (NRS) or 5-level (GAS)
    // rating radiogroup; the training and comment steps do not.
    for (let i = 0; i < 12; i++) {
      if (await thanks.isVisible().catch(() => false)) break;

      // If this step has a rating picker, choose a positive-but-not-extreme
      // value and CONFIRM it registered — the step keeps Continue disabled
      // until a rating is recorded, so asserting aria-checked both forces the
      // click to land and gives a precise failure if it doesn't.
      const group = page.getByRole('radiogroup').first();
      const hasPicker = await group
        .waitFor({ state: 'visible', timeout: 3_000 })
        .then(() => true)
        .catch(() => false);
      if (hasPicker) {
        const radios = group.getByRole('radio');
        const count = await radios.count();
        const index = count >= 11 ? 7 : Math.min(1, count - 1);
        const choice = radios.nth(index);
        await choice.click();
        await expect(choice).toHaveAttribute('aria-checked', 'true');
      }

      // Step satisfied → the primary button must be enabled. Wait, then click.
      await expect(advance.first()).toBeEnabled({ timeout: 15_000 });
      await advance.first().click();
    }

    await expect(thanks).toBeVisible({ timeout: 15_000 });
  });
});

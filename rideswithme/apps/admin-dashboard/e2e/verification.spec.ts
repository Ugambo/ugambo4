import { expect, type Page, test } from '@playwright/test';
import path from 'node:path';
import { ADMIN_PHONE, OUT } from './env';
import { latestOtp, logLineCount, totp } from './support';

const shot = (page: Page, name: string) =>
  page.screenshot({ path: path.join(OUT, 'screenshots', `${name}.png`), fullPage: true });

test.describe.configure({ mode: 'serial' });

const STATE = path.join(OUT, 'admin-state.json');

async function signIn(page: Page) {
  await page.goto('/drivers');
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('Phone number').fill('0803 000 0001');
  const before = logLineCount();
  await page.getByRole('button', { name: 'Send code' }).click();
  await page.getByLabel('6-digit code').fill(await latestOtp(ADMIN_PHONE, before));
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test.describe('signing in', () => {
  test('admin signs in with SMS code and sets up two-factor authentication', async ({ page }) => {
    await page.goto('/login');
    await shot(page, '01-sign-in');
    await signIn(page);

    await expect(
      page.getByRole('heading', { name: 'Set up two-factor authentication' }),
    ).toBeVisible();
    await expect(page.getByAltText('QR code for your authenticator app')).toBeVisible();
    const secret = (await page.getByTestId('totp-secret').textContent()) ?? '';
    await shot(page, '02-two-factor-setup');

    await page
      .getByLabel('Code from your authenticator app')
      .fill('000000' === totp(secret) ? '111111' : '000000');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByText('That authenticator code is not correct.')).toBeVisible();

    await page.getByLabel('Code from your authenticator app').fill(totp(secret));
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('heading', { name: 'Driver verification' })).toBeVisible();
    // Later tests reuse this signed-in, two-factor-verified session.
    await page.context().storageState({ path: STATE });
  });
});

test.describe('signed in', () => {
  test.use({ storageState: STATE });

  test('review queue lists waiting applications oldest first', async ({ page }) => {
    await page.goto('/drivers');
    const rows = page.locator('tbody tr');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText('Musa Abdullahi');
    await expect(rows.nth(0)).toContainText('Waiting for review');
    await expect(rows.nth(1)).toContainText('Hauwa Garba');
    await expect(rows.nth(1)).toContainText('Keke Napep');
    await shot(page, '03-review-queue');

    await page.getByPlaceholder('Search by name, phone or plate').fill('KTN 777 AB');
    await expect(rows).toHaveCount(1);
    await expect(rows.nth(0)).toContainText('Hauwa Garba');
  });

  test('views documents, approves each one, then approves the driver', async ({ page }) => {
    await page.goto('/drivers');
    await page.locator('tbody tr', { hasText: 'Musa Abdullahi' }).click();
    await expect(page.getByRole('heading', { name: 'Musa Abdullahi' })).toBeVisible();
    await expect(page.getByText('Cannot go online')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Approve driver' })).toBeDisabled();
    await shot(page, '04-driver-review');

    await page.getByTestId('doc-profile_photo').getByRole('button', { name: 'View' }).click();
    const viewer = page.getByRole('dialog');
    await expect(viewer.getByRole('img', { name: 'Profile photo' })).toBeVisible();
    await expect(viewer).toContainText('Your view has been recorded');
    await viewer.getByRole('button', { name: 'Close' }).click();

    const docs = page.locator('[data-testid^="doc-"]');
    const count = await docs.count();
    for (let i = 0; i < count; i++) {
      const row = docs.nth(i);
      await row.getByRole('button', { name: 'Approve' }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('button', { name: 'Approve' }).click();
      await expect(dialog).toBeHidden();
      await expect(row).toContainText('Approved');
    }

    await expect(page.getByText('Every required document is approved')).toBeVisible();
    await page.getByRole('button', { name: 'Approve driver' }).click();
    await expect(page.getByText('Can go online')).toBeVisible();
    await expect(page.locator('.page-header .pill')).toHaveText('Approved');
    await shot(page, '05-driver-approved');
  });

  test('sends an application back with a reason', async ({ page }) => {
    await page.goto('/drivers');
    await page.locator('tbody tr', { hasText: 'Hauwa Garba' }).click();
    await page
      .getByTestId('doc-insurance_certificate')
      .getByRole('button', { name: 'Reject' })
      .click();
    await page
      .getByLabel('Reason (the driver will see this)')
      .fill('The certificate is for a different vehicle.');
    await page.getByRole('dialog').getByRole('button', { name: 'Reject' }).click();
    await expect(page.getByTestId('doc-insurance_certificate')).toContainText('Rejected');

    await page.getByRole('button', { name: 'Send back to driver' }).click();
    await page
      .getByLabel('Reason (the driver will see this)')
      .fill('Please upload the insurance for KTN 777 AB.');
    await page.getByRole('dialog').getByRole('button', { name: 'Reject' }).click();
    await expect(page.locator('.page-header .pill')).toHaveText('Sent back');
    await shot(page, '06-application-sent-back');
  });

  test('switches to Hausa and signs out', async ({ page }) => {
    await page.goto('/drivers');
    await expect(page.getByRole('heading', { name: 'Driver verification' })).toBeVisible();
    await page.getByLabel('Language').selectOption('ha');
    await expect(page.getByRole('heading', { name: 'Tantance direbobi' })).toBeVisible();
    await page.getByRole('tab', { name: 'Duk direbobi' }).click();
    await expect(page.locator('tbody tr')).toHaveCount(2);
    await shot(page, '07-hausa');

    await page.getByRole('button', { name: 'Fita' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto('/drivers');
    await expect(page).toHaveURL(/\/login$/);
  });
});

test('refuses cross-site and non-allow-listed proxy calls', async ({ request }) => {
  const noHeader = await request.post('/api/auth/otp/request', { data: { phone: '08030000001' } });
  expect(noHeader.status()).toBe(403);
  const blocked = await request.get('/api/proxy/v1/auth/refresh');
  expect(blocked.status()).toBe(404);
  const signedOut = await request.get('/api/proxy/v1/admin/drivers');
  expect(signedOut.status()).toBe(401);
});

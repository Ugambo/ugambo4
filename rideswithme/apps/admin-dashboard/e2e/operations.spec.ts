import { expect, type Page, test } from '@playwright/test';
import path from 'node:path';
import { OUT, SUPER_ADMIN_PHONE } from './env';
import { prepareOperations } from './ops-data';
import { latestOtp, logLineCount, totp } from './support';

const shot = (page: Page, name: string) =>
  page.screenshot({ path: path.join(OUT, 'screenshots', `${name}.png`), fullPage: true });

test.describe.configure({ mode: 'serial' });
const STATE = path.join(OUT, 'super-admin-state.json');
let data: Awaited<ReturnType<typeof prepareOperations>>;

test('a super admin signs in and sees the overview', async ({ page }) => {
  data = await prepareOperations();
  await page.goto('/login');
  await page.getByLabel('Phone number').fill('0803 000 0003');
  const before = logLineCount();
  await page.getByRole('button', { name: 'Send code' }).click();
  await page.getByLabel('6-digit code').fill(await latestOtp(SUPER_ADMIN_PHONE, before));
  await page.getByRole('button', { name: 'Sign in' }).click();
  const secret = (await page.getByTestId('totp-secret').textContent()) ?? '';
  await page.getByLabel('Code from your authenticator app').fill(totp(secret));
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  const trips = page.locator('.kpi').filter({ hasText: 'Trips today' });
  await expect(trips).toContainText('1');
  await expect(trips).toContainText('1 in progress');
  await expect(page.locator('.kpi').filter({ hasText: 'Approved drivers' })).toContainText(
    '1 online now',
  );
  await expect(page.getByRole('img', { name: 'Completed trips per day' })).toBeVisible();
  await page.getByText('Show as a table').first().click();
  await expect(page.locator('.chart-table table').first().locator('tbody tr')).toHaveCount(14);
  await shot(page, '08-overview');
  await page.context().storageState({ path: STATE });
});

test.describe('operations', () => {
  test.use({ storageState: STATE });

  test('the live map shows the online driver and connects for updates', async ({ page }) => {
    await page.goto('/live');
    await expect(page.getByText('1 drivers online · 1 active rides')).toBeVisible();
    await expect(page.getByTestId('live-drivers')).toContainText('Ibrahim Sani');
    await expect(page.getByTestId('live-drivers')).toContainText('On a ride');
    await expect(page.getByTestId('live-status')).toHaveText('Live');
    await shot(page, '09-live-map');
  });

  test('stops a stuck ride from its page, with the timeline showing why', async ({ page }) => {
    await page.goto('/rides');
    await expect(page.getByTestId('rides-table').locator('tbody tr')).toHaveCount(2);
    await page.goto(`/rides/${data.active}`);
    await page.getByRole('button', { name: 'Stop ride' }).click();
    await page.getByLabel('Reason').fill('Driver reported a breakdown');
    await page.getByRole('dialog').getByRole('button', { name: 'Stop ride' }).click();
    await expect(page.locator('.page-header .pill')).toHaveText('Stopped by staff');
    await expect(page.getByTestId('timeline')).toContainText('cancelled_by_admin');
    await shot(page, '10-ride-stopped');
  });

  test('refunds part of a cash fare to the passenger wallet', async ({ page }) => {
    await page.goto(`/rides/${data.completed}`);
    await page.getByTestId('ride-payments').getByRole('button', { name: 'Refund' }).click();
    await page.getByLabel('Amount (₦)').fill('100');
    await page.getByLabel('Reason').fill('Waited too long at pickup');
    await page.getByTestId('refund-form').getByRole('button', { name: 'Refund' }).click();
    await expect(page.getByTestId('ride-payments')).toContainText('₦100');
    await page.goto('/payments');
    await page.getByRole('tab', { name: 'Ledger' }).click();
    await expect(page.getByTestId('ledger-check')).toHaveText(
      'Every wallet matches its ledger lines.',
    );
  });

  test("shows a driver's wallet, owing fees on the cash trip", async ({ page }) => {
    await page.goto('/users');
    await page.getByLabel('Search by name, phone or email').fill('Ibrahim');
    await page.getByRole('link', { name: 'Ibrahim Sani' }).click();
    await expect(page.getByTestId('user-roles')).toContainText('Driver');
    await expect(page.getByTestId('driver-wallet')).toContainText('−₦');
  });

  test('changes a price and keeps it in naira', async ({ page }) => {
    await page.goto('/pricing');
    const base = page.getByLabel('Base fare (₦)');
    await expect(base).toHaveValue('500');
    await base.fill('600');
    await page.getByRole('button', { name: 'Save prices' }).click();
    await expect(page.getByText('Saved. New bookings use these prices')).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('Base fare (₦)')).toHaveValue('600');
    await shot(page, '11-pricing');
  });

  test('draws a new service area on the map', async ({ page }) => {
    await page.goto('/areas');
    await page.getByRole('button', { name: 'New area' }).click();
    await page.getByLabel('Key (lower case, no spaces)').fill('kano_north');
    await page.getByLabel('Name', { exact: true }).fill('Kano North');
    const map = page.getByRole('application', { name: 'Service areas' });
    const box = (await map.boundingBox())!;
    for (const [x, y] of [
      [0.3, 0.3],
      [0.7, 0.3],
      [0.7, 0.6],
      [0.3, 0.6],
    ] as const) {
      await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
    }
    await expect(page.getByTestId('corner-count')).toHaveText('4 corners');
    await shot(page, '12-drawing-area');
    await page.getByRole('button', { name: 'Save area' }).click();
    await expect(page.getByText('Area saved.')).toBeVisible();
    await expect(page.getByText('Kano North')).toBeVisible();
  });

  test('creates a fleet and finds every action in the audit log', async ({ page }) => {
    await page.goto('/fleets');
    await page.getByRole('button', { name: 'New fleet' }).click();
    await page.getByLabel('Fleet name').fill('Sabon Gari Taxis');
    await page.getByLabel("Manager's phone number").fill('0803 777 0001');
    await page.getByRole('dialog').getByRole('button', { name: 'New fleet' }).click();
    await expect(page.getByTestId('fleets-table')).toContainText('Sabon Gari Taxis');

    await page.goto('/audit');
    const log = page.getByTestId('audit-table');
    for (const action of ['fleets.created', 'rides.cancelled_by_admin', 'payments.refund_issued']) {
      await expect(log).toContainText(action);
    }
    await page.getByLabel('Action (e.g. payments.)').fill('fleets.');
    await expect(log).not.toContainText('rides.cancelled_by_admin');
    await shot(page, '13-audit-log');
  });

  test('lists roles with their permissions', async ({ page }) => {
    await page.goto('/roles');
    await expect(page.getByTestId('role-super_admin')).toContainText('wallets.adjust');
    await expect(page.getByTestId('role-fleet_manager')).toContainText('fleet.portal');
  });
});

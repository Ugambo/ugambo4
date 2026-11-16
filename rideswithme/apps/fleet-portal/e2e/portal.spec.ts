import { expect, type Page, test } from '@playwright/test';
import path from 'node:path';
import { MANAGER_PHONE, OUT } from './env';
import { api, rides, scenario, totp } from './support';

const shot = (page: Page, name: string) =>
  page.screenshot({ path: path.join(OUT, 'screenshots', `${name}.png`), fullPage: true });

test.describe.configure({ mode: 'serial' });
const STATE = path.join(OUT, 'manager-state.json');

test('a fleet manager signs in with an SMS code and an authenticator', async ({ page }) => {
  await page.goto('/drivers');
  await expect(page).toHaveURL(/\/login$/);
  await shot(page, '01-sign-in');
  await page.getByLabel('Phone number').fill('0803 000 0102');
  const before = api.logLineCount();
  await page.getByRole('button', { name: 'Send code' }).click();
  await page.getByLabel('6-digit code').fill(await api.latestOtp(MANAGER_PHONE, before));
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(
    page.getByRole('heading', { name: 'Set up two-factor authentication' }),
  ).toBeVisible();
  const secret = (await page.getByTestId('totp-secret').textContent()) ?? '';
  await page.getByLabel('Code from your authenticator app').fill(totp(secret));
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Kano Express' })).toBeVisible();
  await expect(page.getByTestId('kpi-drivers')).toContainText('0');
  await page.context().storageState({ path: STATE });
});

test.describe('managing the fleet', () => {
  test.use({ storageState: STATE });

  test('invites a driver, who appears only after accepting in the driver app', async ({ page }) => {
    await page.goto('/drivers');
    await page.getByLabel("Driver's phone number").fill('0803 000 0999');
    await page.getByRole('button', { name: 'Invite a driver' }).click();
    await expect(page.getByTestId('invite-form')).toContainText('No driver with this phone number');

    await page.getByLabel("Driver's phone number").fill('0803 111 0101');
    await page.getByRole('button', { name: 'Invite a driver' }).click();
    await expect(page.getByText('Invitation sent.')).toBeVisible();
    const row = page.getByTestId('drivers-table').locator('tbody tr');
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('Waiting for the driver to accept');
    await expect(row).not.toContainText('Aminu Bello');

    // The driver accepts in the driver app.
    const { driver } = scenario();
    const inv = await api.call<{ invitations: { id: string }[] }>('/v1/driver/fleet', {
      token: driver.token,
    });
    await api.call(`/v1/driver/fleet-invitations/${inv.invitations[0]!.id}/accept`, {
      method: 'POST',
      token: driver.token,
    });
    await rides.goOnline(driver.token);
    await page.reload();
    await expect(row).toContainText('Aminu Bello');
    await expect(row).toContainText('Online');
    await expect(row).toContainText('KAN100FL');
    await shot(page, '02-drivers');
  });

  test("sees the fleet's trips and totals, but never another fleet's", async ({ page }) => {
    const { driver, otherDriver } = scenario();
    const passenger = await api.signIn('+2348035550301');
    const ride = await rides.bookAndAccept(passenger.token, driver.token);
    await rides.finish(ride, driver.token);
    // A trip in the other fleet at the same time.
    await rides.goOnline(otherDriver.token);
    await api.call('/v1/driver/availability', {
      method: 'POST',
      token: driver.token,
      body: { online: false },
    });
    const other = await api.signIn('+2348035550302');
    const otherRide = await rides.bookAndAccept(other.token, otherDriver.token);
    await rides.finish(otherRide, otherDriver.token);

    await page.goto('/trips');
    const trips = page.getByTestId('trips-table').locator('tbody tr');
    await expect(trips).toHaveCount(1);
    await expect(trips).toContainText('Aminu Bello');
    await expect(trips).not.toContainText('Sani Musa');
    await expect(trips).toContainText('Completed');
    await shot(page, '03-trips');

    await page.goto('/overview');
    await expect(page.getByTestId('kpi-today')).toContainText('1 trips');

    await page.goto('/vehicles');
    await expect(page.getByTestId('vehicles-table')).toContainText('KAN100FL');
    await expect(page.getByTestId('vehicles-table')).not.toContainText('KAN200FL');

    await page.goto(`/drivers/${driver.userId}`);
    await expect(page.getByRole('heading', { name: 'Aminu Bello' })).toBeVisible();
    await expect(page.getByTestId('trips-table').locator('tbody tr')).toHaveCount(1);
    await page.goto(`/drivers/${otherDriver.userId}`);
    await expect(page.getByText('We could not find what you were looking for.')).toBeVisible();
  });

  test('cannot reach staff or other APIs through the portal', async ({ page }) => {
    await page.goto('/overview');
    const statuses = await page.evaluate(async () => {
      const admin = await fetch('/api/proxy/v1/admin/fleets');
      const wallet = await fetch('/api/proxy/v1/wallet');
      const noCsrf = await fetch('/api/proxy/v1/fleet/drivers', { method: 'POST', body: '{}' });
      return [admin.status, wallet.status, noCsrf.status];
    });
    expect(statuses).toEqual([404, 404, 403]);
  });

  test('removes a driver; past trips stay, in Hausa too', async ({ page }) => {
    page.on('dialog', (d) => void d.accept());
    await page.goto('/drivers');
    await page.getByRole('button', { name: 'Remove' }).click();
    await expect(page.getByText('No drivers yet.')).toBeVisible();
    await page.goto('/trips');
    await expect(page.getByTestId('trips-table').locator('tbody tr')).toHaveCount(1);
    await page.getByLabel('Language').selectOption('ha');
    await expect(page.getByRole('heading', { name: 'Tafiye-tafiye' })).toBeVisible();
    await shot(page, '04-hausa');
    await page.getByRole('button', { name: 'Fita' }).click();
    await expect(page).toHaveURL(/\/login$/);
  });
});

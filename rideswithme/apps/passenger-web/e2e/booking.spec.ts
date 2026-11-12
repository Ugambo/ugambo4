import { expect, type Page, test } from '@playwright/test';
import path from 'node:path';
import { OUT, PASSENGER_PHONE } from './env';
import { KURMI, api, driver } from './support';

const shot = (page: Page, name: string) =>
  page.screenshot({ path: path.join(OUT, 'screenshots', `${name}.png`), fullPage: true });

test.describe.configure({ mode: 'serial' });

const STATE = path.join(OUT, 'passenger-state.json');

test('passenger signs in with an SMS code', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/sign-in$/);
  await shot(page, '01-sign-in');
  await page.getByLabel('Phone number').fill('0803 555 0001');
  const before = api.logLineCount();
  await page.getByRole('button', { name: 'Send code' }).click();
  await page.getByLabel('6-digit code').fill(await api.latestOtp(PASSENGER_PHONE, before));
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Where are you going?' })).toBeVisible();
  await page.context().storageState({ path: STATE });
});

test.describe('signed in', () => {
  test.use({ storageState: STATE });

  test('books a ride and follows it live to the receipt', async ({ page }) => {
    const d = driver();
    // A driver waiting about 400 m from the pickup.
    await d.goOnline(KURMI.lat + 0.0036, KURMI.lng);

    await page.goto('/');
    await page.getByRole('button', { name: /Use my location/ }).click();
    await expect(page.getByTestId('pickup')).toContainText('Kurmi Market');
    await page.getByRole('combobox', { name: 'Destination' }).fill('airport');
    await page
      .getByRole('option')
      .filter({ hasText: 'Mallam Aminu Kano International Airport' })
      .click();

    const options = page.getByTestId('ride-options');
    await expect(options).toBeVisible();
    await expect(page.getByTestId('option-car')).toContainText('₦');
    await expect(page.getByTestId('option-car')).toContainText('min away');
    await shot(page, '02-choose-ride');

    await page.getByRole('button', { name: /^Request Car · ₦/ }).click();
    const live = page.getByTestId('live-ride');
    await expect(live).toBeVisible();
    await expect(page.getByTestId('ride-headline')).toHaveText(
      /Finding you a driver|Ibrahim is on the way/,
    );

    // Everything below arrives over the live connection: the page's fallback
    // poll is every 30 s, and each expectation waits at most 10 s.
    const rideId = await d.acceptNextOffer();
    await expect(page.getByTestId('ride-headline')).toHaveText('Ibrahim is on the way');
    await expect(page.getByTestId('driver-card')).toContainText('KAN123AA');
    await d.sendLocation(KURMI.lat + 0.002, KURMI.lng);
    await expect(page.getByTestId('sketch-driver')).toBeVisible();
    await shot(page, '03-driver-on-the-way');

    await d.sendLocation(KURMI.lat + 0.0002, KURMI.lng);
    await d.arrived(rideId);
    await expect(page.getByTestId('ride-headline')).toHaveText('Ibrahim has arrived');
    await expect(page.getByText('Please meet your driver at the pickup point.')).toBeVisible();

    await d.start(rideId);
    await expect(page.getByTestId('ride-headline')).toHaveText('On the way to your destination');
    await expect(page.getByRole('button', { name: 'Cancel ride' })).toHaveCount(0);

    await d.complete(rideId);
    await expect(page.getByTestId('ride-headline')).toHaveText('You have arrived');
    await expect(page.getByTestId('pay-cash')).toContainText('Pay ₦');
    await expect(page.getByTestId('fare-lines')).toContainText('Booking fee');
    await shot(page, '04-receipt');

    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByRole('heading', { name: 'Where are you going?' })).toBeVisible();
  });

  test('shows the driver as "last updated" when their position is old', async ({ page }) => {
    test.setTimeout(120_000);
    const d = driver();
    await d.goOnline(KURMI.lat + 0.0036, KURMI.lng);
    await page.goto('/');
    await page.getByRole('button', { name: /Use my location/ }).click();
    await expect(page.getByTestId('pickup')).toContainText('Kurmi Market');
    await page.getByRole('combobox', { name: 'Destination' }).fill('zoo');
    await page.getByRole('listbox').getByRole('option').filter({ hasText: 'Zoo' }).click();
    await page.getByRole('button', { name: /^Request Car · ₦/ }).click();
    await d.acceptNextOffer();
    await expect(page.getByTestId('ride-headline')).toHaveText('Ibrahim is on the way');
    // No new position for over 30 seconds: the page must not present it as live.
    await expect(page.getByTestId('position-age')).toContainText('Driver location last updated', {
      timeout: 45_000,
    });

    // Cancelling after the driver is assigned (within the grace period) is free.
    await page.getByRole('button', { name: 'Cancel ride' }).click();
    await expect(page.getByRole('alertdialog')).toContainText('Cancel this ride?');
    await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel ride' }).click();
    await expect(page.getByTestId('ride-headline')).toHaveText('This ride was cancelled');
    await page.getByRole('button', { name: 'Done' }).click();
  });

  test('lists past rides and opens a receipt', async ({ page }) => {
    await page.goto('/rides');
    const rows = page.getByTestId('ride-list').getByRole('listitem');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText('Cancelled');
    await expect(rows.nth(1)).toContainText('Completed');
    await shot(page, '05-history');
    await rows.nth(1).getByRole('link').click();
    await expect(page.getByTestId('receipt')).toContainText(
      'Mallam Aminu Kano International Airport',
    );
    await expect(page.getByTestId('receipt')).toContainText('Distance driven');
    await expect(page.getByTestId('fare-lines')).toContainText('Total');
  });

  test('works on a phone-sized screen and in Hausa', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.getByLabel('Language').selectOption('ha');
    await expect(page.getByRole('heading', { name: 'Ina za ku?' })).toBeVisible();
    await shot(page, '06-hausa-phone');
    await page.getByLabel('Harshe').selectOption('en');
    await expect(page.getByRole('heading', { name: 'Where are you going?' })).toBeVisible();
  });

  test('refuses cross-site and non-allow-listed calls', async ({ page }) => {
    await page.goto('/');
    const res = await page.evaluate(async () => {
      const admin = await fetch('/api/proxy/v1/admin/users');
      const noCsrf = await fetch('/api/proxy/v1/fares/estimate', { method: 'POST', body: '{}' });
      const ticketNoCsrf = await fetch('/api/realtime', { method: 'POST' });
      return [admin.status, noCsrf.status, ticketNoCsrf.status];
    });
    expect(res).toEqual([404, 403, 403]);
  });

  test('signs out', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
    await page.goto('/rides');
    await expect(page).toHaveURL(/\/sign-in$/);
  });
});

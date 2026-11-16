import { expect, type Page, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { OUT, SAFETY_PASSENGER_PHONE, STAFF_FILE } from './env';
import { KURMI, api, driver } from './support';

const shot = (page: Page, name: string) =>
  page.screenshot({ path: path.join(OUT, 'screenshots', `${name}.png`), fullPage: true });
const staff = () => (JSON.parse(readFileSync(STAFF_FILE, 'utf8')) as { token: string }).token;

test.describe.configure({ mode: 'serial' });
const STATE = path.join(OUT, 'safety-passenger-state.json');

test('a passenger signs in', async ({ page }) => {
  await page.goto('/sign-in');
  await page.getByLabel('Phone number').fill('0803 555 0007');
  const before = api.logLineCount();
  await page.getByRole('button', { name: 'Send code' }).click();
  await page.getByLabel('6-digit code').fill(await api.latestOtp(SAFETY_PASSENGER_PHONE, before));
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Where are you going?' })).toBeVisible();
  await page.context().storageState({ path: STATE });
});

test.describe('safety and support', () => {
  test.use({ storageState: STATE });

  test('books with a promotion code, shares the trip, messages the driver and presses SOS', async ({
    page,
    browser,
  }) => {
    const d = driver();
    await d.goOnline(KURMI.lat + 0.0036, KURMI.lng);
    await page.goto('/');
    await page.getByRole('button', { name: /Use my location/ }).click();
    await expect(page.getByTestId('pickup')).toContainText('Kurmi Market');
    await page.getByRole('combobox', { name: 'Destination' }).fill('airport');
    await page
      .getByRole('option')
      .filter({ hasText: 'Mallam Aminu Kano International Airport' })
      .click();
    await expect(page.getByTestId('option-car')).toContainText('₦');
    await page.getByLabel('Promotion code').fill('web20');
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(page.getByTestId('promo-result')).toContainText('20% off your ride');
    await expect(page.getByTestId('promo-result')).toContainText('You save');
    await page.getByRole('button', { name: /^Request Car · ₦/ }).click();
    const rideId = await d.acceptNextOffer();
    await expect(page.getByTestId('live-ride')).toHaveAttribute('data-status', 'driver_assigned');
    await expect(page.getByTestId('promotion-line')).toContainText('Promotion (WEB20)');

    // Share: a stranger with the link sees the driver and plate, but no phone numbers.
    await page.getByRole('button', { name: 'Share my trip' }).click();
    const url = await page.getByTestId('share-url').inputValue();
    const token = url.split('/').pop()!;
    const stranger = await (await browser.newContext()).newPage();
    await stranger.goto(`/track/${token}`);
    await expect(
      stranger.getByRole('heading', { name: 'Following a RideswithMe trip' }),
    ).toBeVisible();
    await expect(stranger.getByText(/Ibrahim · .* · KAN123AA/)).toBeVisible();
    expect(await stranger.content()).not.toContain('+234');
    await shot(stranger, '20-shared-trip');

    // Messages, live from the driver.
    await page.getByRole('button', { name: "I'm at the pickup point" }).click();
    await expect(page.getByTestId('ride-chat').locator('li.mine')).toContainText(
      "I'm at the pickup point",
    );
    const seen = await api.call<{ body: string }[]>(`/v1/rides/${rideId}/messages`, {
      token: JSON.parse(readFileSync(path.join(OUT, 'driver.json'), 'utf8')).token,
    });
    expect(seen.map((m) => m.body)).toEqual(["I'm at the pickup point"]);
    await api.call(`/v1/rides/${rideId}/messages`, {
      method: 'POST',
      token: JSON.parse(readFileSync(path.join(OUT, 'driver.json'), 'utf8')).token,
      body: { body: 'I can see you, coming' },
    });
    await expect(page.getByTestId('ride-chat')).toContainText('I can see you, coming');

    // SOS: two taps.
    await page.getByRole('button', { name: 'SOS' }).click();
    await page.getByRole('button', { name: 'Send SOS' }).click();
    await expect(page.getByTestId('sos-status')).toContainText('Help is on the way');
    const alerts = await api.call<{ rideId: string; status: string }[]>(
      '/v1/admin/sos?status=open',
      {
        token: staff(),
      },
    );
    expect(alerts.find((a) => a.rideId === rideId)).toMatchObject({ status: 'open' });
    await shot(page, '21-sos-sent');

    await d.arrived(rideId);
    await d.start(rideId);
    await d.complete(rideId);
    await expect(page.getByTestId('live-ride')).toHaveAttribute('data-status', 'completed');
    await page.getByRole('radio', { name: '5 stars' }).click();
    await page.getByRole('button', { name: 'Clean vehicle' }).click();
    await page.getByRole('button', { name: 'Send rating' }).click();
    await expect(page.getByTestId('rated')).toHaveText('You rated this trip 5 stars.');
    await d.goOffline();
  });

  test('contacts support and sees the reply; asks for and cancels account deletion', async ({
    page,
  }) => {
    await page.goto('/help');
    await page.getByLabel('About').selectOption('payment');
    await page.getByLabel('Subject').fill('Wallet top-up missing');
    await page.getByLabel('How can we help?').fill('I topped up ₦1,000 but do not see it.');
    await page.getByRole('button', { name: 'Send' }).click();
    const row = page.getByTestId('tickets').locator('li').first();
    await expect(row).toContainText('Wallet top-up missing');
    const tickets = await api.call<{ id: string; subject: string }[]>('/v1/admin/support/tickets', {
      token: staff(),
    });
    const ticket = tickets.find((t) => t.subject === 'Wallet top-up missing')!;
    await api.call(`/v1/admin/support/tickets/${ticket.id}/messages`, {
      method: 'POST',
      token: staff(),
      body: { body: 'It is in your wallet now.' },
    });
    await row.getByRole('link').click();
    await expect(page.getByTestId('ticket-status')).toHaveText('We replied');
    await expect(page.getByTestId('ticket-messages')).toContainText('It is in your wallet now.');

    page.on('dialog', (d) => void d.accept());
    await page.goto('/account');
    await expect(page.getByTestId('notifications')).toContainText('We replied to your request');
    await page.getByTestId('deletion').getByRole('button', { name: 'Delete my account' }).click();
    await expect(page.getByTestId('deletion')).toContainText('Your account will be deleted on');
    await shot(page, '22-account');
    await page.getByRole('button', { name: 'Keep my account' }).click();
    await expect(
      page.getByTestId('deletion').getByRole('button', { name: 'Delete my account' }),
    ).toBeVisible();
  });
});

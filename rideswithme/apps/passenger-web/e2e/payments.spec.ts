import { expect, type Page, test } from '@playwright/test';
import path from 'node:path';
import { OUT, PAYING_PASSENGER_PHONE } from './env';
import { KURMI, api, driver } from './support';

const shot = (page: Page, name: string) =>
  page.screenshot({ path: path.join(OUT, 'screenshots', `${name}.png`), fullPage: true });

test.describe.configure({ mode: 'serial' });

const STATE = path.join(OUT, 'paying-passenger-state.json');

test('a new passenger signs in', async ({ page }) => {
  await page.goto('/sign-in');
  await page.getByLabel('Phone number').fill('0803 555 0003');
  const before = api.logLineCount();
  await page.getByRole('button', { name: 'Send code' }).click();
  await page.getByLabel('6-digit code').fill(await api.latestOtp(PAYING_PASSENGER_PHONE, before));
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Where are you going?' })).toBeVisible();
  await page.context().storageState({ path: STATE });
});

test.describe('paying', () => {
  test.use({ storageState: STATE });

  test('tops up the wallet through the payment page', async ({ page }) => {
    await page.goto('/wallet');
    await expect(page.getByTestId('wallet-balance')).toHaveText('₦0');
    await page.getByRole('button', { name: '₦1,000' }).click();
    await page.getByRole('button', { name: 'Top up' }).last().click();
    // The provider's (fake) payment page, on the API's address.
    await expect(page.getByRole('heading', { name: 'Test checkout' })).toBeVisible();
    await expect(page.getByText('₦1,000.00')).toBeVisible();
    await shot(page, '07-checkout');
    await page.getByRole('button', { name: /Pay with test card 4081/ }).click();
    // Back on the website, which asks the server how the payment went.
    await expect(page).toHaveURL(/\/wallet/);
    await expect(page.getByTestId('payment-result')).toHaveText('Payment received: ₦1,000.');
    await expect(page.getByTestId('wallet-balance')).toHaveText('₦1,000');
    await expect(page.getByTestId('wallet-activity')).toContainText('Top-up');
  });

  test('saves a card, with the check charge going into the wallet', async ({ page }) => {
    await page.goto('/wallet');
    await page.getByRole('button', { name: 'Add a card' }).click();
    await page.getByRole('button', { name: /Pay with test card 4081/ }).click();
    await expect(page.getByTestId('payment-result')).toContainText('Payment received');
    await expect(page.getByTestId('cards')).toContainText('VISA •••• 4081');
    await expect(page.getByTestId('wallet-balance')).toHaveText('₦1,050');
    await shot(page, '08-wallet');
  });

  test('pays for a ride with the saved card, then reports a problem with the fare', async ({
    page,
  }) => {
    const d = driver();
    await d.goOnline(KURMI.lat + 0.0036, KURMI.lng);
    await page.goto('/');
    await page.getByRole('button', { name: /Use my location/ }).click();
    await expect(page.getByTestId('pickup')).toContainText('Kurmi Market');
    await page.getByRole('combobox', { name: 'Destination' }).fill('airport');
    await page
      .getByRole('listbox')
      .getByRole('option')
      .filter({ hasText: 'Mallam Aminu Kano International Airport' })
      .click();
    await expect(page.getByTestId('ride-options')).toBeVisible();

    await page.getByLabel('Pay with').selectOption({ label: 'Wallet (₦1,050)' });
    await expect(page.getByText('Not enough in your wallet for this ride.')).toBeVisible();
    await page.getByLabel('Pay with').selectOption({ label: 'VISA •••• 4081' });
    await page.getByRole('button', { name: /^Request Car · ₦/ }).click();

    const rideId = await d.acceptNextOffer();
    await expect(page.getByTestId('ride-headline')).toHaveText('Ibrahim is on the way');
    await d.sendLocation(KURMI.lat + 0.0002, KURMI.lng);
    await d.arrived(rideId);
    await d.start(rideId);
    await d.complete(rideId);
    await expect(page.getByTestId('ride-headline')).toHaveText('You have arrived');
    await expect(page.getByTestId('payment-line')).toHaveText('Paid by card (VISA •••• 4081)');
    await shot(page, '09-paid-by-card');
    await page.getByRole('button', { name: 'Done' }).click();

    await page.goto(`/rides/${rideId}`);
    await expect(page.getByTestId('payment-line')).toHaveText('Paid by card (VISA •••• 4081)');
    await page.getByRole('button', { name: 'Report a problem with the fare' }).click();
    await page.getByLabel('The driver took a longer route').check();
    await page
      .getByLabel('Tell us more (optional)')
      .fill('We went round the ring road for no reason.');
    await page.getByRole('button', { name: 'Send report' }).click();
    await expect(page.getByTestId('dispute-status')).toHaveText('We are looking into your report.');
    await shot(page, '10-dispute');
  });
});

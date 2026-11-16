import { expect, type Page, test } from '@playwright/test';
import path from 'node:path';
import { lagosDate } from '@rideswithme/e2e-support';
import { BUS_PASSENGER_PHONE, OUT } from './env';
import { api } from './support';

const shot = (page: Page, name: string) =>
  page.screenshot({ path: path.join(OUT, 'screenshots', `${name}.png`), fullPage: true });

test.describe.configure({ mode: 'serial' });
const STATE = path.join(OUT, 'bus-passenger-state.json');

test('a passenger signs in to buy bus tickets', async ({ page }) => {
  await page.goto('/sign-in');
  await page.getByLabel('Phone number').fill('0803 555 0004');
  const before = api.logLineCount();
  await page.getByRole('button', { name: 'Send code' }).click();
  await page.getByLabel('6-digit code').fill(await api.latestOtp(BUS_PASSENGER_PHONE, before));
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Where are you going?' })).toBeVisible();
  await page.context().storageState({ path: STATE });
});

test.describe('bus tickets', () => {
  test.use({ storageState: STATE });

  test('finds a bus, chooses two seats and pays on the payment page', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Buses' }).click();
    await expect(page.getByRole('heading', { name: 'Bus tickets' })).toBeVisible();
    await expect(page.getByLabel('From')).toHaveValue('Kano');
    await expect(page.getByLabel('To')).toHaveValue('Abuja');
    await page.getByLabel('Travel date').fill(lagosDate(2));
    await page.getByRole('button', { name: 'Find buses' }).click();
    const results = page.getByTestId('bus-results').locator('li');
    await expect(results).toHaveCount(1);
    await expect(results).toContainText('Kano Line');
    await expect(results).toContainText('From ₦12,000');
    await expect(results).toContainText('8 seats left');
    await shot(page, '10-bus-search');

    await results.getByRole('link', { name: 'Choose seats' }).click();
    await expect(page.getByRole('heading', { name: 'Choose your seats' })).toBeVisible();
    await page.locator('[data-seat="E1"]').click();
    await page.locator('[data-seat="S1"]').click();
    await expect(page.locator('[data-seat="E1"]')).toHaveAttribute('aria-pressed', 'true');
    await page.getByLabel('Name on the ticket for seat E1').fill('Amina Bello');
    await page.getByLabel('Name on the ticket for seat S1').fill('Musa Bello');
    await expect(page.getByTestId('seat-total')).toHaveText('Total ₦30,000');
    await shot(page, '11-bus-seats');
    await page.getByRole('button', { name: 'Hold seats and pay' }).click();

    await expect(page.getByRole('heading', { name: /^Booking [A-Z0-9]{8}$/ })).toBeVisible();
    await expect(page.getByTestId('booking-status')).toHaveText('Waiting for payment');
    await page.getByLabel('Another card or bank transfer').check();
    await page.getByRole('button', { name: 'Pay ₦30,000' }).click();
    await expect(page.getByRole('heading', { name: 'Test checkout' })).toBeVisible();
    await expect(page.getByText('₦30,000.00')).toBeVisible();
    await page.getByRole('button', { name: /Pay with test card 4081/ }).click();

    // Back from the payment page (via the wallet page) on the booking, now paid.
    await expect(page).toHaveURL(/\/buses\/bookings\/[0-9a-f-]{36}$/);
    await expect(page.getByTestId('booking-status')).toHaveText('Paid');
    const tickets = page.getByTestId('tickets').locator('li');
    await expect(tickets).toHaveCount(2);
    await expect(tickets.first()).toContainText('Seat E1 · Amina Bello');
    await expect(tickets.first().getByTestId('ticket-code')).toHaveText(
      /^Ticket code [A-Z0-9]{10}$/,
    );
    await expect(page.getByRole('img', { name: 'QR code for seat E1' })).toBeVisible();
    await shot(page, '12-bus-tickets');

    await page.goto('/buses/bookings');
    await expect(page.getByTestId('bus-bookings')).toContainText('Kano → Abuja');
    await expect(page.getByTestId('bus-bookings')).toContainText('E1, S1');
  });

  test('shows bought seats as yours on the seat map', async ({ page }) => {
    await page.goto(`/buses?from=Kano&to=Abuja&date=${lagosDate(2)}`);
    await expect(page.getByTestId('bus-results')).toContainText('6 seats left');
    await page.getByRole('link', { name: 'Choose seats' }).click();
    const e1 = page.locator('[data-seat="E1"]');
    await expect(e1).toBeDisabled();
    await expect(e1).toHaveAttribute('aria-label', /already yours/);
    await expect(page.locator('[data-seat="E2"]')).toBeEnabled();
  });

  test('cancels the booking for a full refund to the wallet', async ({ page }) => {
    page.on('dialog', (d) => void d.accept());
    await page.goto('/buses/bookings');
    await page.getByTestId('bus-bookings').getByRole('link').first().click();
    await expect(page.getByText(/^Free cancellation until/)).toBeVisible();
    await page.getByRole('button', { name: 'Cancel booking' }).click();
    await expect(page.getByTestId('booking-status')).toHaveText('Cancelled');
    await expect(page.getByTestId('refund-note')).toHaveText('₦30,000 is back in your wallet.');
    await page.goto('/wallet');
    await expect(page.getByTestId('wallet-balance')).toHaveText('₦30,000');
    await expect(page.getByTestId('wallet-activity')).toContainText('Bus ticket refund');
  });
});

import { expect, type Page, test } from '@playwright/test';
import path from 'node:path';
import { lagosDate, testBuses } from '@rideswithme/e2e-support';
import { BUS_MANAGER_PHONE, BUS_PASSENGER_PHONE, E2E_DATABASE_URL, OUT } from './env';
import { api, totp } from './support';

const shot = (page: Page, name: string) =>
  page.screenshot({ path: path.join(OUT, 'screenshots', `${name}.png`), fullPage: true });
const buses = testBuses(api, E2E_DATABASE_URL);

test.describe.configure({ mode: 'serial' });
const STATE = path.join(OUT, 'bus-manager-state.json');

test("a bus operator's manager signs in and lands on the bus overview", async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Phone number').fill('0803 000 0104');
  const before = api.logLineCount();
  await page.getByRole('button', { name: 'Send code' }).click();
  await page.getByLabel('6-digit code').fill(await api.latestOtp(BUS_MANAGER_PHONE, before));
  await page.getByRole('button', { name: 'Sign in' }).click();
  const secret = (await page.getByTestId('totp-secret').textContent()) ?? '';
  await page.getByLabel('Code from your authenticator app').fill(totp(secret));
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/buses$/);
  await expect(page.getByRole('heading', { name: 'Kano Line' })).toBeVisible();
  await expect(page.getByText('RideswithMe service fee: 10% of each fare')).toBeVisible();
  // Not a fleet manager: no fleet pages.
  await expect(page.getByRole('link', { name: 'Drivers' })).toHaveCount(0);
  await page.context().storageState({ path: STATE });
});

test.describe('running buses', () => {
  test.use({ storageState: STATE });

  test('adds a route and draws a seat layout', async ({ page }) => {
    await page.goto('/buses/routes');
    await expect(page.getByText('No routes yet.')).toBeVisible();
    await page.getByLabel('From (city)').fill('Kano');
    await page.getByLabel('Departure park or terminal').fill('Naibawa Motor Park');
    await page.getByLabel('To (city)').fill('Abuja');
    await page.getByLabel('Arrival park or terminal').fill('Jabi Motor Park');
    await page.getByLabel('Journey time (minutes)').fill('420');
    await page.getByRole('button', { name: 'Add route' }).click();
    await expect(page.getByTestId('routes-table')).toContainText('Kano → Abuja');
    await expect(page.getByTestId('routes-table')).toContainText('7 h 0 min');

    await page.goto('/buses/layouts');
    await page.getByLabel('Name (e.g. "Toyota Hiace 14 seats")').fill('Hiace 6');
    await page.getByLabel('Rows').fill('3');
    await page.getByLabel('Columns').fill('3');
    const cell = (r: number, c: number) => page.locator(`[data-cell="${r}:${c}"]`);
    // Two clicks: executive; one click: standard.
    for (const [r, c, clicks] of [
      [1, 1, 2],
      [1, 3, 2],
      [2, 1, 1],
      [2, 3, 1],
      [3, 1, 1],
      [3, 3, 1],
    ] as const)
      for (let i = 0; i < clicks; i++) await cell(r, c).click();
    await expect(cell(1, 1)).toHaveAttribute('aria-label', 'Row 1, column 1: Executive');
    await expect(cell(1, 2)).toHaveAttribute('aria-label', 'Row 1, column 2: no seat');
    await expect(page.getByTestId('layout-form')).toContainText('6 seats');
    await shot(page, '10-layout-editor');
    await page.getByRole('button', { name: 'Save layout' }).click();
    const card = page.getByTestId('layout-card');
    await expect(card).toContainText('Hiace 6');
    await expect(card).toContainText('Standard 4 · Executive 2');
  });

  test('adds departures for three days with fares per seat class', async ({ page }) => {
    await page.goto('/buses/departures');
    await page.getByLabel('Departure time').fill('08:00');
    await page.getByLabel('First day').fill(lagosDate(2));
    await page.getByLabel('Last day').fill(lagosDate(4));
    await page.getByLabel('Fare: Standard (₦)').fill('12,000');
    await page.getByLabel('Fare: Executive (₦)').fill('18000');
    await page.getByRole('button', { name: 'Create 3 departures' }).click();
    await expect(page.getByText('3 departures added.')).toBeVisible();
    const rows = page.getByTestId('departures-table').locator('tbody tr');
    await expect(rows).toHaveCount(3);
    await expect(rows.first()).toContainText('Hiace 6');
    await expect(rows.first()).toContainText('Standard ₦12,000 · Executive ₦18,000');
    await shot(page, '11-departures');
  });

  test('sees a passenger on the list and checks them in at boarding', async ({ page }) => {
    // The passenger books seat 1 (executive) on the first departure and pays on the payment page.
    await page.goto('/buses/departures');
    const first = page.getByTestId('departures-table').locator('tbody tr').first();
    const href = (await first.getByRole('link').getAttribute('href'))!;
    const departureId = href.split('/').pop()!;
    const passenger = await api.signIn(BUS_PASSENGER_PHONE);
    const map = await api.call<{ layout: { seats: { id: string; label: string }[] } }>(
      `/v1/bus/departures/${departureId}`,
      { token: passenger.token },
    );
    const booking = await buses.hold(passenger.token, departureId, [
      { seatId: map.layout.seats.find((s) => s.label === '1')!.id, passengerName: 'Amina Bello' },
    ]);
    await buses.payByCheckout(passenger.token, booking.id);
    const paid = await api.call<{ tickets: { ticketCode: string }[] }>(
      `/v1/bus/bookings/${booking.id}`,
      {
        token: passenger.token,
      },
    );
    await buses.departIn(departureId, 2);

    await page.goto(href);
    await expect(page.getByTestId('departure-summary')).toContainText('1 sold');
    const manifest = page.getByTestId('manifest-table').locator('tbody tr');
    await expect(manifest).toHaveCount(1);
    await expect(manifest).toContainText('Amina Bello');
    await expect(manifest).toContainText(booking.reference);
    await expect(manifest).toContainText('Not yet');

    await page.goto('/buses/check-in');
    await page.getByLabel('Ticket code').fill(paid.tickets[0]!.ticketCode);
    await page.getByRole('button', { name: 'Check in' }).click();
    await expect(page.getByTestId('check-in-result')).toContainText(
      'Checked in: seat 1, Amina Bello',
    );
    await page.getByLabel('Ticket code').fill(`RWMBUS:${paid.tickets[0]!.ticketCode}`);
    await page.getByRole('button', { name: 'Check in' }).click();
    await expect(page.getByTestId('check-in-result')).toContainText('Already checked in');
    await page.getByLabel('Ticket code').fill('AAAAAAAAAA');
    await page.getByRole('button', { name: 'Check in' }).click();
    await expect(page.getByTestId('check-in-result')).toContainText('not valid for your buses');
    await shot(page, '12-check-in');

    await page.goto(href);
    await expect(manifest).toContainText('Boarded');
    await page.goto('/buses/statement');
    await expect(page.getByTestId('statement-balance')).toHaveText('RideswithMe owes you ₦16,200');
    await expect(page.getByTestId('statement-table')).toContainText('Seats sold');
  });

  test('cancels a departure; everyone on it is refunded', async ({ page }) => {
    page.on('dialog', (d) => void d.accept());
    await page.goto('/buses/departures');
    await page.getByTestId('departures-table').locator('tbody tr').nth(1).getByRole('link').click();
    await page.getByLabel('Reason (passengers will see it)').fill('Bus is being repaired');
    await page.getByRole('button', { name: 'Cancel this departure' }).click();
    await expect(page.getByText('Cancelled: Bus is being repaired')).toBeVisible();
    await expect(page.getByTestId('departure-cancel')).toHaveCount(0);
  });

  test('cannot reach fleet or staff endpoints', async ({ page }) => {
    await page.goto('/buses');
    const statuses = await page.evaluate(async () => {
      const fleet = await fetch('/api/proxy/v1/fleet');
      const staff = await fetch('/api/proxy/v1/admin/bus-operators');
      return [fleet.status, staff.status];
    });
    expect(statuses).toEqual([403, 404]);
  });
});

import { expect, type Page, test } from '@playwright/test';
import path from 'node:path';
import { accessibilityProblems, testBuses } from '@rideswithme/e2e-support';
import { E2E_DATABASE_URL, OUT, SUPER_ADMIN_PHONE } from './env';
import { prepareOperations } from './ops-data';
import { api, latestOtp, logLineCount, totp } from './support';

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

  test('creates a bus operator, records a payment to it and cancels a booking', async ({
    page,
  }) => {
    await page.goto('/buses');
    await page.getByRole('button', { name: 'New bus operator' }).click();
    await page.getByLabel('Operator name').fill('Arewa Coaches');
    await page.getByLabel("Manager's phone number").fill('0803 777 0002');
    await page.getByLabel('Service fee (%)').fill('8');
    await page.getByRole('dialog').getByRole('button', { name: 'New bus operator' }).click();
    const row = page
      .getByTestId('operators-table')
      .locator('tbody tr')
      .filter({ hasText: 'Arewa Coaches' });
    await expect(row).toContainText('8%');

    // The operator lists a departure; a passenger buys a seat on the payment page.
    const buses = testBuses(api, E2E_DATABASE_URL);
    const manager = await api.signInWithTotp('+2348037770002');
    const service = await buses.service(manager.token, [3]);
    const passenger = await api.signIn('+2348037770003');
    const booking = await buses.hold(passenger.token, service.departures[0]!, [
      { seatId: service.seat('S1'), passengerName: 'Hauwa Sule' },
    ]);
    await buses.payByCheckout(passenger.token, booking.id);

    await row.getByRole('link').click();
    await expect(page.getByTestId('operator-balance')).toContainText('₦11,040');
    await page.getByLabel('Amount paid (₦)').fill('11040');
    await page.getByLabel('Note (e.g. transfer reference)').fill('Transfer TRF-001');
    await page.getByRole('button', { name: 'Record payment' }).click();
    await expect(page.getByTestId('operator-balance')).toContainText('₦0');
    await expect(page.getByTestId('operator-statement')).toContainText('Paid to operator');
    await expect(page.getByTestId('operator-departures').locator('tbody tr')).toHaveCount(1);
    await shot(page, '14-bus-operator');

    await page.goto('/buses');
    await page
      .getByLabel('Booking reference (8 characters) or passenger phone number')
      .fill(booking.reference);
    await page.getByRole('button', { name: 'Find' }).click();
    await page.getByTestId('bookings-table').getByRole('link', { name: booking.reference }).click();
    await expect(page.getByTestId('booking-status')).toHaveText('Paid');
    await expect(page.getByTestId('booking-tickets')).toContainText('Hauwa Sule');
    page.on('dialog', (d) => void d.accept());
    await page.getByLabel('Reason').fill('Passenger asked by phone');
    await page.getByRole('button', { name: 'Cancel booking with full refund' }).click();
    await expect(page.getByTestId('booking-status')).toHaveText('Cancelled');
    await expect(page.getByText('Refunded ₦12,000 to the wallet')).toBeVisible();
  });

  test('shows an SOS on every page the moment it is pressed, and handles it', async ({ page }) => {
    await page.goto('/overview');
    await expect(page.getByTestId('sos-banner')).toHaveCount(0);
    const passenger = await api.signIn('+2348037770010');
    await api.call('/v1/sos', {
      method: 'POST',
      token: passenger.token,
      body: { location: { lat: 12.0021, lng: 8.5203 }, note: 'Please call me' },
    });
    // Arrives over the live connection (no reload).
    await expect(page.getByTestId('sos-banner')).toContainText('SOS: 1 open alert(s)');
    await expect(page).toHaveTitle(/^\(SOS\)/);
    await shot(page, '15-sos-banner');
    await page.getByRole('link', { name: 'Open the SOS panel' }).click();
    const card = page.getByTestId('sos-card').first();
    await expect(card).toContainText('Please call me');
    await expect(card.getByRole('link', { name: 'Open in maps' })).toHaveAttribute(
      'href',
      'https://maps.google.com/?q=12.0021,8.5203',
    );
    await card.getByRole('button', { name: 'Acknowledge (we are responding)' }).click();
    await expect(card).toContainText('Responding');
    await card.getByLabel('What happened and what was done').fill('Called; passenger is safe');
    await card.getByRole('button', { name: 'Resolve' }).click();
    await expect(page.getByText('No open SOS alerts.')).toBeVisible();
    await expect(page.getByTestId('sos-banner')).toHaveCount(0);
  });

  test('handles a safety report and creates a promotion', async ({ page }) => {
    const passenger = await api.signIn('+2348037770011');
    await api.call('/v1/incidents', {
      method: 'POST',
      token: passenger.token,
      body: { category: 'harassment', description: 'The driver shouted at me' },
    });
    await page.goto('/incidents');
    const report = page.getByTestId('incident-card').first();
    await expect(report).toContainText('Harassment');
    await expect(report).toContainText('High');
    await report
      .getByLabel('Resolution (the reporter sees this)')
      .fill('Driver warned and retrained');
    await report.getByRole('button', { name: 'Resolve' }).click();
    await expect(page.getByText('No open reports.')).toBeVisible();

    await page.goto('/promotions');
    await page.getByRole('button', { name: 'New promotion' }).click();
    await page.getByLabel('Code').fill('KANO10');
    await page.getByLabel('Description (passengers see this)').fill('10% off in Kano');
    await page.getByLabel('Percent (%)').fill('10');
    await page.getByLabel('Most off per ride (₦, optional)').fill('500');
    await page.getByRole('dialog').getByRole('button', { name: 'New promotion' }).click();
    const row = page.getByTestId('promotions-table').locator('tr').filter({ hasText: 'KANO10' });
    await expect(row).toContainText('10% (≤ ₦500)');
    await expect(row).toContainText('Active');
    await row.getByRole('button', { name: 'Switch off' }).click();
    await expect(row).toContainText('Off');
  });

  test('lists roles with their permissions', async ({ page }) => {
    await page.goto('/roles');
    await expect(page.getByTestId('role-super_admin')).toContainText('wallets.adjust');
    await expect(page.getByTestId('role-fleet_manager')).toContainText('fleet.portal');
    await expect(page.getByTestId('role-bus_operator')).toContainText('bus.operator');
    await expect(page.getByTestId('role-support_agent')).toContainText('safety.manage');
  });

  test('every page passes the automated accessibility checks (WCAG 2.1 AA)', async ({ page }) => {
    const pages = [
      '/overview',
      '/live',
      '/rides',
      `/rides/${data.active}`,
      '/users',
      `/users/${data.driverId}`,
      '/drivers',
      '/fleets',
      '/buses',
      '/pricing',
      '/areas',
      '/payments',
      '/sos',
      '/incidents',
      '/support',
      '/promotions',
      '/privacy',
      '/roles',
      '/audit',
    ];
    const problems: string[] = [];
    for (const url of pages) {
      await page.goto(url);
      await expect(page.locator('h1').first()).toBeVisible();
      await page.waitForLoadState('networkidle');
      // Map tiles are third-party images; the map itself has its own text alternative.
      for (const p of await accessibilityProblems(page, { exclude: ['.leaflet-pane'] }))
        problems.push(`${url}: ${p}`);
    }
    expect(problems).toEqual([]);
  });
});

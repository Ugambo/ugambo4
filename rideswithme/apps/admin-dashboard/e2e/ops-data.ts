import { testRides } from '@rideswithme/e2e-support';
import { E2E_DATABASE_URL } from './env';
import { api } from './support';

/** An approved driver online in Kano with one completed cash ride and one ride in progress. */
export async function prepareOperations() {
  const rides = testRides(api, E2E_DATABASE_URL);
  const driver = await rides.approvedDriver({
    phone: '+2348031110003',
    fullName: 'Ibrahim Sani',
    nin: '12345678903',
    plate: 'KAN555AA',
  });
  await rides.goOnline(driver.token);
  const first = await api.signIn('+2348035559001');
  const completed = await rides.bookAndAccept(first.token, driver.token);
  await rides.finish(completed, driver.token);
  const second = await api.signIn('+2348035559002');
  const active = await rides.bookAndAccept(second.token, driver.token);
  return { driverId: driver.userId, completed, active };
}

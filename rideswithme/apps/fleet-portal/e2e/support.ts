import { readFileSync } from 'node:fs';
import { testApi, testRides } from '@rideswithme/e2e-support';
import { API_LOG, API_URL, E2E_DATABASE_URL, POLICY_VERSION, STATE_FILE } from './env';

export { totp } from '@rideswithme/e2e-support';

export const api = testApi({ apiUrl: API_URL, apiLog: API_LOG, policyVersion: POLICY_VERSION });
export const rides = testRides(api, E2E_DATABASE_URL);

/** Tokens and ids made by global-setup. */
export interface Scenario {
  driver: { token: string; userId: string };
  otherDriver: { token: string; userId: string };
  otherManagerToken: string;
}
export const scenario = (): Scenario => JSON.parse(readFileSync(STATE_FILE, 'utf8')) as Scenario;

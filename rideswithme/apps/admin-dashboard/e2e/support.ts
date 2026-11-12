import { testApi } from '@rideswithme/e2e-support';
import { API_LOG, API_URL, POLICY_VERSION } from './env';

export { totp } from '@rideswithme/e2e-support';

/** The test API: SMS codes from its log, sign-in and driver applications. */
export const { latestOtp, logLineCount, submitDriverApplication } = testApi({
  apiUrl: API_URL,
  apiLog: API_LOG,
  policyVersion: POLICY_VERSION,
});

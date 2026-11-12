import 'server-only';
import { createBff } from '@rideswithme/web-core';
import { PASSENGER_API_ALLOW } from './allowlist';
import { cookieSecure, serverEnv } from './env';

/** The passenger's API tokens stay in an encrypted cookie on this server (see @rideswithme/web-core). */
export const bff = createBff({
  cookieName: 'rwm_session',
  apiUrl: () => serverEnv().API_URL,
  sessionSecret: () => serverEnv().PASSENGER_SESSION_SECRET,
  cookieSecure,
  policyVersion: () => serverEnv().POLICY_VERSION,
  deviceName: 'Web browser',
  allow: PASSENGER_API_ALLOW,
});

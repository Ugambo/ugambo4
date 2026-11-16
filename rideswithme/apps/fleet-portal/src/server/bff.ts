import 'server-only';
import { createBff } from '@rideswithme/web-core';
import { FLEET_API_ALLOW } from './allowlist';
import { cookieSecure, serverEnv } from './env';

/** The manager's API tokens stay in an encrypted cookie on this server (see @rideswithme/web-core). */
export const bff = createBff({
  cookieName: 'rwm_fleet_session',
  apiUrl: () => serverEnv().API_URL,
  sessionSecret: () => serverEnv().FLEET_SESSION_SECRET,
  cookieSecure,
  policyVersion: () => serverEnv().POLICY_VERSION,
  deviceName: 'Fleet portal',
  allow: FLEET_API_ALLOW,
});

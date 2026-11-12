import 'server-only';
import { createBff } from '@rideswithme/web-core';
import { ADMIN_API_ALLOW } from './allowlist';
import { cookieSecure, serverEnv } from './env';

/** The admin's API tokens stay in an encrypted cookie on this server (see @rideswithme/web-core). */
export const bff = createBff({
  cookieName: 'rwm_admin_session',
  apiUrl: () => serverEnv().API_URL,
  sessionSecret: () => serverEnv().ADMIN_SESSION_SECRET,
  cookieSecure,
  policyVersion: () => serverEnv().POLICY_VERSION,
  deviceName: 'Admin dashboard',
  allow: ADMIN_API_ALLOW,
});

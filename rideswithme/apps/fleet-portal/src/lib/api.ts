'use client';

/** API calls go through this app's server, which holds the manager's tokens (see @rideswithme/web-core). */
export { browserApi as api, browserAuth as auth, isSignedOut } from '@rideswithme/web-core/client';

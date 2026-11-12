'use client';

/** API calls go through this app's server, which holds the admin's tokens (see @rideswithme/web-core). */
export { browserApi as api, browserAuth as auth, isSignedOut } from '@rideswithme/web-core/client';

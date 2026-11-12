'use client';

/** API calls go through this site's server, which holds the passenger's tokens (see @rideswithme/web-core). */
export { browserApi as api, browserAuth as auth, isSignedOut } from '@rideswithme/web-core/client';

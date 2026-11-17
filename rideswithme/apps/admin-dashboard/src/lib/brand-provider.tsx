'use client';

/**
 * The logo provider, re-exported from a client module so the server layout can
 * use it: a server component cannot reach a client component through
 * web-core/client's "export *" index (it arrives as undefined).
 */
export { BrandProvider } from '@rideswithme/web-core/client';

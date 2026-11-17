import { brandLogoRoute } from '@rideswithme/web-core';
import { serverEnv } from '@/server/env';

/** The logo set on the Settings page, served from this site's own address. */
export const GET = brandLogoRoute(() => serverEnv().API_URL);
export const dynamic = 'force-dynamic';

import { isAllowedPath } from '@rideswithme/web-core';

/** API paths the admin's browser may reach through this server's proxy. Everything else is refused. */
export const ADMIN_API_ALLOW = [
  /^v1\/me$/,
  /^v1\/auth\/mfa\/totp\/(setup|activate|verify)$/,
  /^v1\/auth\/sessions(\/[0-9a-f-]{36})?$/,
  /^v1\/auth\/realtime-ticket$/,
  /^v1\/admin\/(users|roles|audit-logs|drivers|rides|service-areas|fare-rules|fleets|payments|disputes|payouts|bus-operators|bus-departures|bus-bookings|sos|incidents|support|promotions|deletion-requests)(\/.*)?$/,
  /^v1\/admin\/(dashboard|live|ledger|settings)$/,
  /^v1\/admin\/vehicle-categories(\/[a-z][a-z0-9_]{1,30})?$/,
  /^v1\/vehicle-categories$/,
];

export const isAllowedApiPath = (path: string) => isAllowedPath(path, ADMIN_API_ALLOW);

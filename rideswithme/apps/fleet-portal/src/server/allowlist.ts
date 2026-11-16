import { isAllowedPath } from '@rideswithme/web-core';

/** API paths a fleet or bus operator manager's browser may reach through this server. The API scopes them to their own fleet or operator. */
export const FLEET_API_ALLOW = [
  /^v1\/me$/,
  /^v1\/auth\/mfa\/totp\/(setup|activate|verify)$/,
  /^v1\/auth\/sessions(\/[0-9a-f-]{36})?$/,
  /^v1\/fleet$/,
  /^v1\/fleet\/(drivers|vehicles|trips)$/,
  /^v1\/fleet\/drivers\/[0-9a-f-]{36}$/,
  // Bus operators (Phase 7). The API scopes them to the operator the caller manages.
  /^v1\/operator$/,
  /^v1\/operator\/(routes|layouts|departures|check-in|statement)$/,
  /^v1\/operator\/routes\/[0-9a-f-]{36}$/,
  /^v1\/operator\/departures\/[0-9a-f-]{36}(\/cancel)?$/,
];

export const isAllowedFleetPath = (path: string) => isAllowedPath(path, FLEET_API_ALLOW);

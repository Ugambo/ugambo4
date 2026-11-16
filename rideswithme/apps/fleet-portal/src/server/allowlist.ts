import { isAllowedPath } from '@rideswithme/web-core';

/** API paths a fleet manager's browser may reach through this server. The API scopes them to their own fleet. */
export const FLEET_API_ALLOW = [
  /^v1\/me$/,
  /^v1\/auth\/mfa\/totp\/(setup|activate|verify)$/,
  /^v1\/auth\/sessions(\/[0-9a-f-]{36})?$/,
  /^v1\/fleet$/,
  /^v1\/fleet\/(drivers|vehicles|trips)$/,
  /^v1\/fleet\/drivers\/[0-9a-f-]{36}$/,
];

export const isAllowedFleetPath = (path: string) => isAllowedPath(path, FLEET_API_ALLOW);

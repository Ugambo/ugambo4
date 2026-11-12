import { isAllowedPath } from '@rideswithme/web-core';

/** API paths the admin's browser may reach through this server's proxy. Everything else is refused. */
export const ADMIN_API_ALLOW = [
  /^v1\/me$/,
  /^v1\/auth\/mfa\/totp\/(setup|activate|verify)$/,
  /^v1\/auth\/sessions(\/[0-9a-f-]{36})?$/,
  /^v1\/auth\/realtime-ticket$/,
  /^v1\/admin\/(users|roles|audit-logs|drivers|rides|service-areas|fare-rules)(\/.*)?$/,
  /^v1\/vehicle-categories$/,
];

export const isAllowedApiPath = (path: string) => isAllowedPath(path, ADMIN_API_ALLOW);

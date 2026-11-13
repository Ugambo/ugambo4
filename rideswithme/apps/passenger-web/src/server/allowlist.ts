import { isAllowedPath } from '@rideswithme/web-core';

/** API paths a passenger's browser may reach through this server. Everything else is refused. */
export const PASSENGER_API_ALLOW = [
  /^v1\/me$/,
  /^v1\/me\/saved-places(\/[0-9a-f-]{36})?$/,
  /^v1\/auth\/sessions(\/[0-9a-f-]{36})?$/,
  /^v1\/places\/(autocomplete|reverse)$/,
  /^v1\/places\/details\/[A-Za-z0-9:_-]{1,300}$/,
  /^v1\/fares\/estimate$/,
  /^v1\/rides(\/active)?$/,
  /^v1\/rides\/[0-9a-f-]{36}(\/(cancel|driver-photo|dispute))?$/,
  /^v1\/wallet(\/(transactions|topups))?$/,
  /^v1\/payments\/[0-9a-f-]{36}$/,
  /^v1\/payment-cards(\/[0-9a-f-]{36})?$/,
  /^v1\/vehicle-categories$/,
];

export const isAllowedPassengerPath = (path: string) => isAllowedPath(path, PASSENGER_API_ALLOW);

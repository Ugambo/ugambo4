/**
 * Exports every English/Hausa string for review by a native Hausa speaker:
 * one CSV row per text, each catalogue once (shared text is not repeated in
 * the apps that reuse it), with blank "hausa_corrected" and "comment" columns.
 *
 *   pnpm hausa:export [output.csv]      (default: hausa-review.csv)
 *
 * Needs the packages built (pnpm build). See documentation/HAUSA_REVIEW.md.
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  checkCatalog,
  reviewCsv,
  reviewRows,
  type ReviewRow,
} from '../packages/utilities/src/catalog-check.ts';
import { catalogs } from '../packages/utilities/src/i18n.ts';
import { passengerMessages } from '../packages/utilities/src/passenger-messages.ts';
import { commonEn, commonHa } from '../packages/mobile-core/src/messages.ts';
import { staffSignInMessages } from '../packages/web-core/src/client/staff-sign-in-messages.ts';
import { messages as admin } from '../apps/admin-dashboard/src/lib/messages.ts';
import { messages as fleet } from '../apps/fleet-portal/src/lib/messages.ts';
import { messages as passengerWeb } from '../apps/passenger-web/src/lib/messages.ts';
import { messages as passengerApp } from '../apps/passenger-mobile/src/lib/messages.ts';
import { messages as driverApp } from '../apps/driver-mobile/src/lib/messages.ts';
import { TEMPLATES } from '../apps/api/src/notifications/templates.ts';

type Catalog = Record<string, string>;
const notifications = (lang: 'en' | 'ha'): Catalog =>
  Object.fromEntries(
    Object.entries(TEMPLATES).flatMap(([kind, t]) => [
      [`${kind}.title`, t[lang][0]],
      [`${kind}.body`, t[lang][1]],
    ]),
  );

const passengerShared = Object.keys(passengerMessages.en);
const staffShared = Object.keys(staffSignInMessages.en);
const sources: [string, Catalog, Catalog, string[]][] = [
  ['SMS and error messages (all apps)', catalogs.en, catalogs.ha, []],
  ['Passenger rides (app and website)', passengerMessages.en, passengerMessages.ha, []],
  ['Mobile apps: common', commonEn, commonHa, []],
  ['Staff sign-in (admin, partner portal)', staffSignInMessages.en, staffSignInMessages.ha, []],
  ['Push notifications', notifications('en'), notifications('ha'), []],
  ['Passenger app', passengerApp.en, passengerApp.ha, passengerShared],
  ['Passenger website', passengerWeb.en, passengerWeb.ha, passengerShared],
  ['Driver app', driverApp.en, driverApp.ha, []],
  ['Partner portal (fleets, bus operators)', fleet.en, fleet.ha, staffShared],
  ['Admin dashboard', admin.en, admin.ha, staffShared],
];

const rows: ReviewRow[] = [];
let problems = 0;
for (const [name, en, ha, skip] of sources) {
  const found = reviewRows(name, en, ha, skip);
  rows.push(...found);
  problems += checkCatalog(en, ha, { sameAllowed: ['app.name'] }).length; // product names stay in English
  process.stdout.write(`${String(found.length).padStart(5)}  ${name}\n`);
}
const out = path.resolve(process.argv[2] ?? 'hausa-review.csv');
writeFileSync(out, `﻿${reviewCsv(rows)}\n`); // BOM: spreadsheets then read Hausa letters (ɗ, ƙ, ƴ) correctly
process.stdout.write(`${String(rows.length).padStart(5)}  texts written to ${out}\n`);
if (problems) process.stdout.write(`Note: ${problems} automatic-check problems; run pnpm test.\n`);

// Creates the local settings files for every app from their .env.example,
// with fresh random secrets, so the project runs on a new machine without
// openssl or copying by hand. Works on Windows, macOS and Linux.
//
//   pnpm setup:local
//
// Never overwrites a file that already exists (delete it first to start over).
// The files it writes are git-ignored; never commit them.
import { randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hex = () => randomBytes(32).toString('hex');
const b64 = () => randomBytes(32).toString('base64');

/** App folder, settings file name, and the blank secrets to fill in. */
const apps = [
  [
    'apps/api',
    '.env',
    {
      JWT_ACCESS_SECRET: hex,
      OTP_PEPPER: hex,
      LOOKUP_HASH_SECRET: hex,
      FIELD_ENCRYPTION_KEYS: () => `k1:${b64()}`,
    },
  ],
  ['apps/admin-dashboard', '.env.local', { ADMIN_SESSION_SECRET: b64 }],
  ['apps/passenger-web', '.env.local', { PASSENGER_SESSION_SECRET: b64 }],
  ['apps/fleet-portal', '.env.local', { FLEET_SESSION_SECRET: b64 }],
  ['apps/driver-mobile', '.env', {}],
  ['apps/passenger-mobile', '.env', {}],
];

for (const [dir, file, secrets] of apps) {
  const target = path.join(root, dir, file);
  const example = path.join(root, dir, '.env.example');
  if (existsSync(target)) {
    process.stdout.write(`kept     ${dir}/${file} (already exists)\n`);
    continue;
  }
  copyFileSync(example, target);
  let text = readFileSync(target, 'utf8');
  for (const [name, make] of Object.entries(secrets)) {
    // Only fills a blank "NAME=" line; anything already set is left alone.
    text = text.replace(new RegExp(`^${name}=$`, 'm'), `${name}=${make()}`);
  }
  writeFileSync(target, text);
  const filled = Object.keys(secrets);
  process.stdout.write(
    `created  ${dir}/${file}${filled.length ? ` (new ${filled.join(', ')})` : ''}\n`,
  );
}

process.stdout.write(`
Next: start the databases (docker compose up -d postgres redis s3), then
pnpm build, pnpm db:migrate:local and pnpm seed:local.
See documentation/RUN_IN_VSCODE.md.
`);

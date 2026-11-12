import { migrate } from '@rideswithme/database';
import { Client } from 'pg';
import { TEST_DATABASE_URL } from './env';

/** Rebuilds the test database from migrations once per test run. */
export default async function setup() {
  const client = new Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  try {
    await client.query('DROP SCHEMA IF EXISTS public CASCADE');
    await client.query('CREATE SCHEMA public');
  } finally {
    await client.end();
  }
  await migrate(TEST_DATABASE_URL);
}

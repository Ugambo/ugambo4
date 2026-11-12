import { migrate, status } from './migrator';

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is not set');
  const command = process.argv[2] ?? 'up';
  if (command === 'up') {
    const applied = await migrate(databaseUrl, { info: (m) => console.warn(m) });
    console.warn(
      applied.length ? `Applied ${applied.length} migration(s).` : 'Database is up to date.',
    );
  } else if (command === 'status') {
    for (const row of await status(databaseUrl)) {
      console.warn(`${row.appliedAt ? 'applied' : 'PENDING'}  ${row.migration}`);
    }
  } else {
    throw new Error(`Unknown command "${command}". Use "up" or "status".`);
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

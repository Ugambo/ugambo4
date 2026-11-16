import path from 'node:path';
import { backup, backupConfigFromEnv, heartbeat, latestKey, restore, verify } from './backup';
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
  } else if (command === 'backup') {
    const key = await backup(databaseUrl, backupConfigFromEnv());
    console.warn(`Backup stored: ${key}`);
    await heartbeat(process.env.BACKUP_HEARTBEAT_URL);
  } else if (command === 'verify-backup') {
    // DATABASE_URL here is any database on the server the check may use for a scratch copy.
    const report = await verify(
      databaseUrl,
      backupConfigFromEnv(),
      path.join(__dirname, '..', 'migrations'),
    );
    console.warn(JSON.stringify(report));
    if (!report.ok) throw new Error('Restore check FAILED');
    console.warn('Restore check passed.');
    await heartbeat(process.env.BACKUP_VERIFY_HEARTBEAT_URL);
  } else if (command === 'restore') {
    // Into an existing, EMPTY database named by DATABASE_URL. Pass the backup key, or "latest".
    if (process.argv[4] !== '--yes')
      throw new Error('Usage: restore <key|latest> --yes (target must be empty)');
    const c = backupConfigFromEnv();
    const key = process.argv[3] === 'latest' ? await latestKey(c) : process.argv[3];
    if (!key) throw new Error('Name the backup to restore, or "latest"');
    await restore(databaseUrl, c, key);
    console.warn(`Restored ${key}`);
  } else {
    throw new Error(
      `Unknown command "${command}". Use up, status, backup, verify-backup or restore.`,
    );
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

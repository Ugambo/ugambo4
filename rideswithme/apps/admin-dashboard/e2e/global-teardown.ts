import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { OUT } from './env';

export default async function globalTeardown() {
  const file = path.join(OUT, 'pids.json');
  if (!existsSync(file)) return;
  for (const pid of JSON.parse(readFileSync(file, 'utf8')) as number[]) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // already gone
    }
  }
}

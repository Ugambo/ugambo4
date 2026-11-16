import path from 'node:path';
import { stopPids } from '@rideswithme/e2e-support';
import { OUT } from './env';

export default async function globalTeardown() {
  stopPids(path.join(OUT, 'pids.json'));
}

import * as SQLite from 'expo-sqlite';
import type { LocationPoint } from '@rideswithme/validation';
import type { BufferedPoint, BufferStore } from './location-buffer';

/** SQLite-backed buffer: survives the app being closed or the phone restarting. */
export class SqliteBufferStore implements BufferStore {
  private db: Promise<SQLite.SQLiteDatabase>;

  constructor(name = 'rwm-locations.db') {
    this.db = SQLite.openDatabaseAsync(name).then(async (db) => {
      await db.execAsync(
        'PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS points (id INTEGER PRIMARY KEY AUTOINCREMENT, json TEXT NOT NULL);',
      );
      return db;
    });
  }

  async append(points: LocationPoint[]) {
    const db = await this.db;
    await db.withExclusiveTransactionAsync(async (txn) => {
      for (const p of points)
        await txn.runAsync('INSERT INTO points (json) VALUES (?)', JSON.stringify(p));
    });
  }

  async peek(limit: number): Promise<BufferedPoint[]> {
    const rows = await (
      await this.db
    ).getAllAsync<{ id: number; json: string }>(
      'SELECT id, json FROM points ORDER BY id LIMIT ?',
      limit,
    );
    return rows.map((r) => ({ id: r.id, point: JSON.parse(r.json) as LocationPoint }));
  }

  async removeThrough(id: number) {
    await (await this.db).runAsync('DELETE FROM points WHERE id <= ?', id);
  }

  async count() {
    return (
      (await (await this.db).getFirstAsync<{ n: number }>('SELECT count(*) AS n FROM points'))?.n ??
      0
    );
  }

  async trimTo(max: number) {
    await (
      await this.db
    ).runAsync(
      'DELETE FROM points WHERE id NOT IN (SELECT id FROM points ORDER BY id DESC LIMIT ?)',
      max,
    );
  }
}

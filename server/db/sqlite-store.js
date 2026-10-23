// Legacy tables stay untouched; browser-scoped tables hold all new records.
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { HttpError } from '../validation.js';

const PROJECT_ROOT = path.join(import.meta.dirname, '..', '..');
export function createSqliteStore() {
  const dbPath = process.env.DB_PATH ?? path.join(PROJECT_ROOT, 'data', 'hobbies.db');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(fs.readFileSync(path.join(import.meta.dirname, 'browser-schema.sql'), 'utf8'));

  function catalogue(table, shared = false) {
    const scope = shared ? '(browser_key = ? OR browser_key IS NULL)' : 'browser_key = ?';
    const list = db.prepare(`SELECT id, name, created_at FROM ${table} WHERE ${scope} ORDER BY name`);
    const find = db.prepare(`SELECT id, name, created_at FROM ${table} WHERE ${scope} AND name = ? ORDER BY browser_key IS NULL DESC LIMIT 1`);
    const insert = db.prepare(`INSERT INTO ${table} (name, browser_key) VALUES (?, ?) RETURNING id, name, created_at`);
    return {
      list: async (key) => list.all(key),
      findOrCreate: async (name, key) => {
        const row = find.get(key, name);
        return row ? { row, created: false } : { row: insert.get(name, key), created: true };
      },
    };
  }
  const entrants = catalogue('browser_entrants');
  const hobbies = catalogue('browser_hobbies', true);
  const ownsEntrant = db.prepare('SELECT id FROM browser_entrants WHERE id = ? AND browser_key = ?');
  const canUseHobby = db.prepare('SELECT id FROM browser_hobbies WHERE id = ? AND (browser_key = ? OR browser_key IS NULL)');
  const insert = db.prepare(`INSERT INTO browser_time_entries
    (browser_key, entrant_id, hobby_id, started_at, ended_at, duration_seconds)
    VALUES (@browserKey, @entrantId, @hobbyId, @startedAt, @endedAt, @durationSeconds)
    RETURNING id, entrant_id, hobby_id, started_at, ended_at, duration_seconds, created_at`);
  const totals = db.prepare(`SELECT entrant_id, entrant, hobby_id, hobby, sessions, total_seconds
    FROM browser_hobby_totals WHERE browser_key = ? ORDER BY total_seconds DESC, entrant, hobby`);
  const tables = ['browser_entrants', 'browser_hobbies', 'browser_time_entries', 'browser_hobby_totals'];
  return {
    name: 'SQLite', location: dbPath,
    listEntrants: entrants.list, findOrCreateEntrant: entrants.findOrCreate,
    listHobbies: hobbies.list, findOrCreateHobby: hobbies.findOrCreate,
    async createTimeEntry(entry) {
      if (!ownsEntrant.get(entry.entrantId, entry.browserKey) || !canUseHobby.get(entry.hobbyId, entry.browserKey)) {
        throw new HttpError(404, 'Player or hobby not found in this browser.');
      }
      return insert.get(entry);
    },
    hobbyTotals: async (key) => totals.all(key),
    health: async () => ({ tables }),
  };
}

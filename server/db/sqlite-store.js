// The local database: a SQLite file in /data.
// Used when Supabase isn't configured in .env.

import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { HttpError } from '../validation.js';

const PROJECT_ROOT = path.join(import.meta.dirname, '..', '..');

export function createSqliteStore() {
  // The DB file lives in /data. Override with the DB_PATH environment variable if needed.
  const dbPath = process.env.DB_PATH ?? path.join(PROJECT_ROOT, 'data', 'hobbies.db');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL'); // faster writes, and readers don't block the writer
  db.pragma('foreign_keys = ON');  // SQLite only enforces foreign keys when asked, per connection
  db.exec(fs.readFileSync(path.join(import.meta.dirname, 'schema.sql'), 'utf8'));

  // Players and hobbies are both "id + unique name" tables, so they share this code.
  // (The table name comes from our own code below, never from user input.)
  function catalogue(table) {
    const list   = db.prepare(`SELECT id, name, created_at FROM ${table} ORDER BY name`);
    const find   = db.prepare(`SELECT id, name, created_at FROM ${table} WHERE name = ?`); // NOCASE column: "alex" finds "Alex"
    const insert = db.prepare(`INSERT INTO ${table} (name) VALUES (?) RETURNING id, name, created_at`);

    return {
      list: async () => list.all(),
      findOrCreate: async (name) => {
        const existing = find.get(name);
        return existing ? { row: existing, created: false } : { row: insert.get(name), created: true };
      },
    };
  }

  const entrants = catalogue('entrants');
  const hobbies = catalogue('hobbies');

  const insertEntry = db.prepare(`
    INSERT INTO time_entries (entrant_id, hobby_id, started_at, ended_at, duration_seconds)
    VALUES (@entrantId, @hobbyId, @startedAt, @endedAt, @durationSeconds)
    RETURNING id, entrant_id, hobby_id, started_at, ended_at, duration_seconds, created_at`);
  const totals = db.prepare('SELECT * FROM hobby_totals ORDER BY total_seconds DESC, entrant, hobby');
  const objects = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY name`);

  return {
    name: 'SQLite',
    location: dbPath,
    listEntrants: entrants.list,
    findOrCreateEntrant: entrants.findOrCreate,
    listHobbies: hobbies.list,
    findOrCreateHobby: hobbies.findOrCreate,

    async createTimeEntry(entry) {
      try {
        return insertEntry.get(entry);
      } catch (error) {
        if (error.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') throw new HttpError(400, 'Unknown player or hobby.');
        throw error;
      }
    },

    hobbyTotals: async () => totals.all(),
    health: async () => ({ tables: objects.all().map((row) => row.name) }),
  };
}

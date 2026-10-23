CREATE TABLE IF NOT EXISTS browser_entrants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  browser_key TEXT NOT NULL,
  name TEXT NOT NULL COLLATE NOCASE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(browser_key, name),
  UNIQUE(id, browser_key)
);
CREATE TABLE IF NOT EXISTS browser_hobbies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  browser_key TEXT,
  name TEXT NOT NULL COLLATE NOCASE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS browser_hobbies_name_idx ON browser_hobbies(COALESCE(browser_key, ''), name);
CREATE TABLE IF NOT EXISTS browser_time_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  browser_key TEXT NOT NULL,
  entrant_id INTEGER NOT NULL,
  hobby_id INTEGER NOT NULL REFERENCES browser_hobbies(id),
  started_at TEXT NOT NULL,
  ended_at TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL CHECK(duration_seconds >= 1),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(entrant_id, browser_key) REFERENCES browser_entrants(id, browser_key)
);
CREATE INDEX IF NOT EXISTS browser_time_owner_idx ON browser_time_entries(browser_key, entrant_id, hobby_id);
CREATE INDEX IF NOT EXISTS browser_time_entrant_idx ON browser_time_entries(entrant_id, browser_key);
CREATE INDEX IF NOT EXISTS browser_time_hobby_idx ON browser_time_entries(hobby_id);
CREATE VIEW IF NOT EXISTS browser_hobby_totals AS
SELECT e.browser_key, e.id AS entrant_id, e.name AS entrant, h.id AS hobby_id, h.name AS hobby,
       COUNT(*) AS sessions, SUM(t.duration_seconds) AS total_seconds
FROM browser_time_entries t
JOIN browser_entrants e ON e.id=t.entrant_id AND e.browser_key=t.browser_key
JOIN browser_hobbies h ON h.id=t.hobby_id
GROUP BY e.browser_key, e.id, h.id;
INSERT OR IGNORE INTO browser_hobbies(browser_key, name) VALUES
(NULL, 'Guitar'), (NULL, 'Painting'), (NULL, 'Running'), (NULL, 'Reading');

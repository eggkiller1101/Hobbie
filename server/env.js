// Loads settings from the .env file in the project root into process.env.
// server.js imports this file FIRST, so every other module can read the settings.
// (Node's built-in loader: no extra package needed. Values already set in the
// terminal win over the file.)

import path from 'node:path';

try {
  process.loadEnvFile(path.join(import.meta.dirname, '..', '.env'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error; // no .env file is fine: the app uses local SQLite
}

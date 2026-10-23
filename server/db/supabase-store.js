// Supabase (hosted PostgreSQL), reached over HTTPS with the official client.
// Used when SUPABASE_URL and SUPABASE_SECRET_KEY are set in .env.
//
// The server uses the SECRET key, which bypasses Row Level Security. That's
// safe because it never leaves the server: the browser only talks to our API.

import { createClient } from '@supabase/supabase-js';
import { HttpError } from '../validation.js';

const CATALOGUE_COLUMNS = 'id, name, created_at';
const ENTRY_COLUMNS = 'id, entrant_id, hobby_id, started_at, ended_at, duration_seconds, created_at';

export function createSupabaseStore({ url, secretKey }) {
  rejectPublicKey(secretKey);

  const supabase = createClient(url, secretKey, {
    // We're a server, not a logged-in user: no session to store or refresh.
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  // supabase-js returns { data, error, status } instead of throwing. This turns errors into exceptions.
  async function run(query) {
    const { data, error, status } = await query;
    if (error) throw explain(error, status, url);
    return data;
  }

  // Players and hobbies are both "id + unique name" tables, so they share this code.
  function catalogue(table) {
    const list = () => run(supabase.from(table).select(CATALOGUE_COLUMNS).order('name'));

    // These lists are small, so names are compared in JavaScript. (PostgREST's
    // "ilike" filter treats %, _ and * as wildcards, so "100%" could match other names.)
    const find = async (name) => (await list()).find((row) => row.name.toLowerCase() === name.toLowerCase());

    return {
      list,
      async findOrCreate(name) {
        const existing = await find(name);
        if (existing) return { row: existing, created: false };

        const { data, error, status } = await supabase.from(table).insert({ name }).select(CATALOGUE_COLUMNS).single();
        if (!error) return { row: data, created: true };

        // 23505 = unique violation: someone added the same name a moment ago.
        if (error.code === '23505') {
          const row = await find(name);
          if (row) return { row, created: false };
        }
        throw explain(error, status, url);
      },
    };
  }

  const entrants = catalogue('entrants');
  const hobbies = catalogue('hobbies');

  return {
    name: 'Supabase',
    location: url,
    listEntrants: entrants.list,
    findOrCreateEntrant: entrants.findOrCreate,
    listHobbies: hobbies.list,
    findOrCreateHobby: hobbies.findOrCreate,

    createTimeEntry: ({ entrantId, hobbyId, startedAt, endedAt, durationSeconds }) => run(
      supabase
        .from('time_entries')
        .insert({
          entrant_id: entrantId,
          hobby_id: hobbyId,
          started_at: startedAt,
          ended_at: endedAt,
          duration_seconds: durationSeconds,
        })
        .select(ENTRY_COLUMNS)
        .single(),
    ),

    hobbyTotals: () => run(
      supabase
        .from('hobby_totals')
        .select('*')
        .order('total_seconds', { ascending: false })
        .order('entrant')
        .order('hobby'),
    ),

    // Read at most one row from each table and the view, so a missing migration
    // or a wrong key shows up at /api/health. (Not a "head" request: those have
    // no body, and supabase-js treats an empty 404 as success, hiding a missing table.)
    async health() {
      const tables = ['entrants', 'hobbies', 'time_entries', 'hobby_totals'];
      for (const table of tables) {
        await run(supabase.from(table).select('*').limit(1));
      }
      return { tables };
    },
  };
}

// The public key (publishable / anon) can't see our tables because of Row Level
// Security, which would make the app look mysteriously empty. Catch that early.
function rejectPublicKey(key) {
  let role = null;
  if (key.startsWith('sb_publishable_')) {
    role = 'publishable';
  } else if (key.split('.').length === 3) {
    // Legacy keys are JWTs (header.payload.signature); the payload names the role.
    try {
      role = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role;
    } catch {
      // not a JWT: leave it to Supabase to accept or reject
    }
  }
  if (role === 'publishable' || role === 'anon') {
    throw new Error(
      'SUPABASE_SECRET_KEY in .env is the PUBLIC key (publishable / anon). '
      + 'Use the secret key instead: Supabase dashboard → Project Settings → API Keys.',
    );
  }
}

// Turn Supabase's error codes into messages that say what to do.
// 4xx messages reach the browser; 5xx details only go to the server log.
function explain(error, httpStatus, url) {
  const text = `${error.message ?? ''} ${error.details ?? ''}`;
  let status = 500;
  let message = `Supabase error ${error.code || ''} (HTTP ${httpStatus}): ${error.message || 'no details'}`;

  if (httpStatus === 401) {
    message = 'Supabase rejected the API key. Check SUPABASE_SECRET_KEY in .env.';
  } else if (error.code === '23503') {
    [status, message] = [400, 'Unknown player or hobby.'];
  } else if (error.code === '23505') {
    [status, message] = [409, 'That name already exists.'];
  } else if (error.code === '23514') {
    [status, message] = [400, "That value isn't allowed by the database rules."];
  } else if (error.code === 'PGRST205' || error.code === '42P01') {
    message = 'A table or view is missing in Supabase. Run the SQL files in supabase/migrations (see README).';
  } else if (error.code === '42501') {
    message = 'Supabase refused access. Check that SUPABASE_SECRET_KEY in .env is the secret key.';
  } else if (/invalid api key|jwt/i.test(text)) {
    message = 'Supabase rejected the API key. Check SUPABASE_SECRET_KEY in .env.';
  } else if (/fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN/i.test(text)) {
    [status, message] = [503, `Can't reach Supabase at ${url}. Check SUPABASE_URL and your internet connection.`];
  }

  const wrapped = new HttpError(status, message);
  wrapped.cause = error;
  return wrapped;
}

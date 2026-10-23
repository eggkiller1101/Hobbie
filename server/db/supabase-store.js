// Every query is scoped by the server-derived browser credential hash.
import { createClient } from '@supabase/supabase-js';
import { HttpError } from '../validation.js';
const CATALOGUE_COLUMNS = 'id, name, created_at';
const ENTRY_COLUMNS = 'id, entrant_id, hobby_id, started_at, ended_at, duration_seconds, created_at';

export function createSupabaseStore({ url, secretKey }) {
  rejectPublicKey(secretKey);
  const supabase = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  async function run(query) {
    const { data, error, status } = await query;
    if (error) throw explain(error, status, url);
    return data;
  }
  function catalogue(table, shared = false) {
    // key comes only from a SHA-256 hash, never from a request parameter.
    const scoped = (query, key) => shared
      ? query.or(`browser_key.eq.${key},browser_key.is.null`)
      : query.eq('browser_key', key);
    const list = (key) => run(scoped(supabase.from(table).select(CATALOGUE_COLUMNS), key).order('name'));
    return {
      list,
      async findOrCreate(name, key) {
        const find = async () => (await list(key)).find((row) => row.name.toLowerCase() === name.toLowerCase());
        const existing = await find();
        if (existing) return { row: existing, created: false };
        const { data, error, status } = await supabase.from(table)
          .insert({ name, browser_key: key }).select(CATALOGUE_COLUMNS).single();
        if (!error) return { row: data, created: true };
        if (error.code === '23505') {
          const row = await find();
          if (row) return { row, created: false };
        }
        throw explain(error, status, url);
      },
    };
  }
  const entrants = catalogue('browser_entrants');
  const hobbies = catalogue('browser_hobbies', true);
  return {
    name: 'Supabase', location: url,
    listEntrants: entrants.list, findOrCreateEntrant: entrants.findOrCreate,
    listHobbies: hobbies.list, findOrCreateHobby: hobbies.findOrCreate,
    async createTimeEntry({ browserKey, entrantId, hobbyId, startedAt, endedAt, durationSeconds }) {
      const [entrants, hobbies] = await Promise.all([
        run(supabase.from('browser_entrants').select('id').eq('id', entrantId).eq('browser_key', browserKey)),
        run(supabase.from('browser_hobbies').select('id').eq('id', hobbyId)
          .or(`browser_key.eq.${browserKey},browser_key.is.null`)),
      ]);
      if (!entrants.length || !hobbies.length) throw new HttpError(404, 'Player or hobby not found in this browser.');
      return run(supabase.from('browser_time_entries').insert({
        browser_key: browserKey, entrant_id: entrantId, hobby_id: hobbyId,
        started_at: startedAt, ended_at: endedAt, duration_seconds: durationSeconds,
      }).select(ENTRY_COLUMNS).single());
    },
    hobbyTotals: (key) => run(supabase.from('browser_hobby_totals')
      .select('entrant_id, entrant, hobby_id, hobby, sessions, total_seconds')
      .eq('browser_key', key).order('total_seconds', { ascending: false }).order('entrant').order('hobby')),
    async health() {
      const tables = ['browser_entrants', 'browser_hobbies', 'browser_time_entries', 'browser_hobby_totals'];
      for (const table of tables) await run(supabase.from(table).select('browser_key').limit(1));
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

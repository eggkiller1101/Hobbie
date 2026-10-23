// Chooses the database:
//   SUPABASE_URL + SUPABASE_SECRET_KEY set in .env → Supabase
//   neither set                                    → the local SQLite file
//
// Both "stores" offer the same functions (listEntrants, findOrCreateHobby,
// createTimeEntry, …), so the API routes work the same with either.
// Only the chosen one is loaded (dynamic import).

const url = process.env.SUPABASE_URL?.trim();
const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();

let store;
try {
  if (url || secretKey) {
    if (!url || !secretKey) {
      throw new Error('Set both SUPABASE_URL and SUPABASE_SECRET_KEY in .env (or leave both empty to use SQLite).');
    }
    if (!/^https?:\/\//.test(url)) {
      throw new Error(`SUPABASE_URL should look like https://your-project.supabase.co (got "${url}").`);
    }
    const { createSupabaseStore } = await import('./supabase-store.js');
    store = createSupabaseStore({ url, secretKey });
  } else {
    const { createSqliteStore } = await import('./sqlite-store.js');
    store = createSqliteStore();
  }
} catch (error) {
  // A settings mistake: show a clear message instead of a long stack trace.
  console.error(`\n⚠️  Database setup problem: ${error.message}\n`);
  process.exit(1);
}

export default store;

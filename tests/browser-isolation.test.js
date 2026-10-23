import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import net from 'node:net';
import Database from 'better-sqlite3';
import { browserIdentity } from '../server/browser-identity.js';

const root = path.resolve(import.meta.dirname, '..');

test('browser isolation across reads, writes, restarts and legacy data', { timeout: 30000 }, async (t) => {
  const temp = await mkdtemp(path.join(tmpdir(), 'hobbie-isolation-'));
  const dbPath = path.join(temp, 'test.db');
  // Simulate an existing install with shared records; they must stay untouched.
  const legacy = new Database(dbPath);
  legacy.exec(await readFile(path.join(root, 'server/db/schema.sql'), 'utf8'));
  legacy.prepare('INSERT INTO entrants(name) VALUES (?)').run('Legacy player');
  legacy.close();
  const portServer = net.createServer();
  portServer.listen(0, '127.0.0.1');
  await once(portServer, 'listening');
  const port = portServer.address().port;
  await new Promise((resolve) => portServer.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  let child;
  async function start() {
    const env = { ...process.env, PORT: String(port), DB_PATH: dbPath, SUPABASE_URL: '', SUPABASE_SECRET_KEY: '' };
    delete env.VERCEL;
    child = spawn(process.execPath, ['server.js'], { cwd: root, env, stdio: 'pipe' });
    let logs = '';
    child.stdout.on('data', (data) => { logs += data; });
    child.stderr.on('data', (data) => { logs += data; });
    for (let i = 0; i < 80; i++) {
      if (child.exitCode !== null) throw new Error(logs);
      try { const r = await fetch(`${base}/api/health`); if (r.ok) return; } catch {}
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`Server did not start: ${logs}`);
  }
  async function stop() {
    if (!child || child.exitCode !== null) return;
    const exited = once(child, 'exit');
    child.kill();
    await exited;
  }
  function browser() {
    let cookie = '';
    return {
      async call(route, body, extraHeaders = {}) {
        const headers = { 'Content-Type': 'application/json', ...extraHeaders };
        if (cookie) headers.Cookie = cookie;
        const r = await fetch(base + route, { method: body ? 'POST' : 'GET', headers, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
        const setCookie = r.headers.get('set-cookie');
        if (setCookie) cookie = setCookie.split(';')[0];
        return { status: r.status, data: await r.json(), headers: r.headers, setCookie };
      },
    };
  }
  try {
    await start();
    const a = browser(), b = browser();
    const first = await a.call('/api/entrants');
    assert.deepEqual(first.data, []);
    assert.match(first.setCookie, /HttpOnly/);
    assert.match(first.setCookie, /SameSite=Lax/);
    assert.match(first.headers.get('cache-control'), /no-store/);
    assert.match(first.headers.get('vary'), /Cookie/);
    assert.deepEqual((await b.call('/api/entrants')).data, []);
    const aPlayer = await a.call('/api/entrants', { name: 'Alex' });
    const bPlayer = await b.call('/api/entrants', { name: 'Alex' });
    assert.equal(aPlayer.status, 201);
    assert.equal(bPlayer.status, 201);
    assert.notEqual(aPlayer.data.id, bPlayer.data.id);
    assert.equal((await a.call('/api/entrants', { name: 'alex' })).status, 200);
    assert.deepEqual((await a.call('/api/entrants')).data.map((p) => p.id), [aPlayer.data.id]);
    assert.deepEqual((await b.call('/api/entrants')).data.map((p) => p.id), [bPlayer.data.id]);
    assert.equal('browser_key' in aPlayer.data, false);
    const aHobby = await a.call('/api/hobbies', { name: 'Private hobby' });
    assert.equal(aHobby.status, 201);
    assert.equal((await b.call('/api/hobbies')).data.some((h) => h.name === 'Private hobby'), false);
    const shared = (await b.call('/api/hobbies')).data[0];
    const entry = { entrant_id: aPlayer.data.id, hobby_id: aHobby.data.id,
      started_at: new Date(Date.now() - 30000).toISOString(), ended_at: new Date().toISOString(), duration_seconds: 20 };
    assert.equal((await a.call('/api/time', entry)).status, 201);
    assert.equal((await b.call('/api/time', entry)).status, 404);
    assert.equal((await a.call('/api/time', { ...entry, entrant_id: bPlayer.data.id, hobby_id: shared.id })).status, 404);
    assert.equal((await b.call('/api/time', { ...entry, entrant_id: bPlayer.data.id })).status, 404);
    assert.deepEqual((await b.call('/api/time')).data, []);
    assert.equal((await a.call('/api/time')).data[0].total_seconds, 20);
    assert.equal('browser_key' in (await a.call('/api/time')).data[0], false);
    assert.equal((await a.call('/api/entrants', { name: 'Injected' }, { Origin: 'https://evil.example' })).status, 403);
    assert.equal((await a.call('/api/entrants', { name: 'Injected' }, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
    assert.equal((await browser().call('/api/entrants', { name: 'No cookies' })).status, 401);
    const cleared = browser();
    assert.deepEqual((await cleared.call('/api/entrants')).data, []);
    assert.deepEqual((await cleared.call('/api/time')).data, []);
    const invalid = await fetch(`${base}/api/entrants`, { headers: { Cookie: 'hobbie_browser=invalid' } });
    assert.deepEqual(await invalid.json(), []);
    assert.match(invalid.headers.get('set-cookie'), /hobbie_browser=[a-f0-9]{64};/);
    // The credential is independent of server memory, so a restart keeps ownership.
    await stop();
    await start();
    assert.equal((await a.call('/api/time')).data[0].total_seconds, 20);
    assert.deepEqual((await b.call('/api/time')).data, []);
    const homepage = await fetch(base, { redirect: 'manual' });
    assert.equal(homepage.status, 302);
    assert.equal(homepage.headers.get('location'), '/index.html');
    assert.equal((await fetch(base + '/index.html')).status, 200);
    const db = new Database(dbPath);
    assert.equal(db.prepare('SELECT name FROM entrants').get().name, 'Legacy player');
    assert.equal(db.prepare('SELECT count(*) AS n FROM browser_time_entries').get().n, 1);
    db.close();
  } finally {
    await stop();
    await rm(temp, { recursive: true, force: true });
  }
});

test('production cookies use host-only secure credentials', () => {
  const prev = process.env.VERCEL;
  process.env.VERCEL = '1';
  try {
    let cookie;
    const req = { method: 'GET', headers: {}, get: () => undefined };
    const res = { set() {}, vary() {}, cookie(...args) { cookie = args; } };
    let called = false;
    browserIdentity(req, res, () => { called = true; });
    assert.equal(called, true);
    assert.equal(cookie[0], '__Host-hobbie_browser');
    assert.equal(cookie[2].secure, true);
    assert.equal(cookie[2].httpOnly, true);
    assert.equal(cookie[2].domain, undefined);
    assert.equal(cookie[2].path, '/');
    assert.match(req.browserKey, /^[a-f0-9]{64}$/);
    assert.notEqual(req.browserKey, cookie[1]);
  } finally {
    if (prev === undefined) delete process.env.VERCEL; else process.env.VERCEL = prev;
  }
});

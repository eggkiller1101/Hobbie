// =============================================================
// Hobbies Time Tracker — front-end logic
//
// Flow:  Welcome (pick a saved name, or type a new one)
//          → Loading page (today's weather)
//          → Tracker (background matches the weather)
//
// Everything is real: players, hobbies and sessions are saved in
// the database (SQLite or Supabase, chosen by the server), the
// timer counts actual time, and the Hobby Log shows real totals.
// =============================================================

import { FALLBACK_LOCATION, getTodaysWeather, locationPermission, weatherIcon, weatherLine } from './weather.js';

// ---------- DOM references ----------
const $ = (selector) => document.querySelector(selector);

// Welcome screen
const welcomeScreen   = $('#screen-welcome');
const dialogue        = $('.dialogue');
const welcomeLine     = $('#welcome-line');
const welcomeLineSr   = $('#welcome-line-sr');
const playerPicker    = $('#player-picker');
const playerList      = $('#player-list');
const btnNewPlayer    = $('#btn-new-player');
const nameForm        = $('#name-form');
const nameInput       = $('#player-name');
const nameButton      = $('#name-form button[type="submit"]');
const btnBackToList   = $('#btn-back-to-list');

// Transition overlay / weather loading page
const curtain         = $('#transition');
const weatherAnnounce = $('#weather-announce');
const loadingHint     = $('#loading-hint');
const weatherIconEl   = $('#weather-icon');
const weatherLabel    = $('#weather-label');
const weatherTemp     = $('#weather-temp');
const weatherRange    = $('#weather-range');
const weatherPlace    = $('#weather-place');
const weatherLineEl   = $('#weather-line');
const btnGo           = $('#btn-go');

// Tracker screen
const trackerScreen   = $('#screen-tracker');
const weatherNow      = $('#weather-now');
const btnSwitch       = $('#btn-switch');
const greeting        = $('#greeting');
const playerGreeting  = $('#player-greeting');
const hobbySelect     = $('#hobby-select');
const hobbyForm       = $('#hobby-form');
const hobbyInput      = $('#hobby-name');
const hobbyAddButton  = $('#hobby-form button');
const stage           = $('.stage');
const hobbyEmoji      = $('.hobby-emoji');
const stageCaption    = $('#stage-caption');
const timerLabel      = $('#timer-label');
const timerDisplay    = $('#timer-display');
const encouragement   = $('#encouragement');
const totalsBody      = $('#totals-body');
const finishDialog    = $('#finish-dialog');
const finishName      = $('#finish-name');
const finishTime      = $('#finish-time');
const finishHobby     = $('#finish-hobby');
const finishTotal     = $('#finish-total');
const btnStart        = $('#btn-start');
const startLabel      = $('#btn-start .btn-label');
const btnPause        = $('#btn-pause');
const btnStop         = $('#btn-stop');

// Live check of the OS "reduce motion" setting
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const APP_TITLE = document.title;

// Emoji shown on the island for each hobby, by lower-case name (others get a star)
const HOBBY_EMOJI = {
  guitar: '🎸', painting: '🎨', running: '🏃', reading: '📚', fishing: '🎣', cooking: '🍳',
  baking: '🧁', gardening: '🌻', knitting: '🧶', photography: '📷', gaming: '🎮', swimming: '🏊',
  cycling: '🚴', singing: '🎤', dancing: '💃', chess: '♟️', yoga: '🧘', piano: '🎹',
  drawing: '✏️', writing: '✍️', hiking: '🥾',
};
const emojiFor = (hobbyName) => HOBBY_EMOJI[hobbyName.toLowerCase()] ?? '⭐';

// Pastel colours for each player's initial circle (brown text is readable on all of them)
const CHIP_COLORS = ['#ffd23f', '#b5e48c', '#a8dcf5', '#ffc4b8', '#e8c8f0', '#ffe0a3'];

// ---------- App state ----------
const player = { id: null, name: '' };

// The timer works from timestamps rather than counting ticks, so it stays
// accurate even when the browser slows down timers in a background tab.
const timer = {
  status: 'idle',   // 'idle' | 'running' | 'paused'
  hobby: null,      // { id, name } being timed
  startedAt: null,  // Date when Start was first pressed
  bankedMs: 0,      // active time from earlier running stretches (pauses excluded)
  runningSince: 0,  // Date.now() when the current running stretch began
  tickId: null,     // setInterval handle that refreshes the display
};

// ---------- Helpers ----------

// fetch() wrapper: sends/receives JSON and returns { status, data }.
// Throws an Error with a friendly message if the server can't be reached or says no.
async function request(url, options = {}) {
  let response;
  try {
    response = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...options });
  } catch {
    throw new Error("Hmm, I can't reach the island server… Is it running?");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? `Request failed (${response.status})`);
  return { status: response.status, data };
}

// Same as request(), when only the data matters.
const api = async (url, options) => (await request(url, options)).data;

// 3725 → "01:02:05"
function formatDuration(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Centre point of an element, used as the starting point of the circle wipe.
function centerOf(element) {
  const box = element.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
}

// Same name → same colour, every time (a tiny "hash" of the name's characters).
function colorFor(name) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.codePointAt(0)) >>> 0;
  return CHIP_COLORS[hash % CHIP_COLORS.length];
}

function showMessage(text) {
  encouragement.textContent = text;
}

// ---------- Typewriter dialogue ----------
// Each call to say() bumps `typingRun`; an older line still typing sees
// the number change and stops, so lines never overlap.
let typingRun = 0;

async function say(text, { speed = 28 } = {}) {
  const run = ++typingRun;
  welcomeLineSr.textContent = text; // screen readers get the full line at once

  if (reduceMotion.matches) {
    welcomeLine.textContent = text;
    return;
  }

  const chars = Array.from(text); // splits by character, safe for emoji and non-Latin names
  for (let i = 1; i <= chars.length; i++) {
    if (run !== typingRun) return;
    welcomeLine.textContent = chars.slice(0, i).join('');
    // Pause a little longer after punctuation, like a game character talking
    await wait('.!?…,'.includes(chars[i - 1]) ? speed * 6 : speed);
  }
}

function shake(element) {
  if (reduceMotion.matches) return;
  element.animate(
    [{ translate: '0 0' }, { translate: '-12px 0' }, { translate: '10px 0' },
     { translate: '-6px 0' }, { translate: '4px 0' }, { translate: '0 0' }],
    { duration: 450, easing: 'ease-in-out' },
  );
}

// ---------- Screen transition (circle wipe) ----------
// 1. A green circle grows from `origin` until it covers the screen.
// 2. Behind it, the screens swap (and `whileCovered` runs, e.g. the weather page).
// 3. The circle shrinks into the centre, revealing the new screen.
const WIPE = { duration: 650, easing: 'cubic-bezier(0.65, 0, 0.35, 1)', fill: 'forwards' };

async function switchScreen(from, to, origin, whileCovered) {
  const duration = reduceMotion.matches ? 0 : WIPE.duration; // reduced motion: no wipe, just swap
  const { x, y } = origin ?? { x: innerWidth / 2, y: innerHeight / 2 };

  curtain.dataset.mode = 'plain';
  curtain.classList.add('is-active');

  const cover = curtain.animate(
    [{ clipPath: `circle(0% at ${x}px ${y}px)` }, { clipPath: `circle(150% at ${x}px ${y}px)` }],
    { ...WIPE, duration },
  );
  await cover.finished;

  from.hidden = true;
  if (whileCovered) await whileCovered();
  to.hidden = false;
  window.scrollTo(0, 0);
  if (duration) await wait(200);

  const reveal = curtain.animate(
    [{ clipPath: 'circle(150% at 50% 50%)' }, { clipPath: 'circle(0% at 50% 50%)' }],
    { ...WIPE, duration },
  );
  await reveal.finished;

  // Tidy up so finished animations don't pile up on the element
  cover.cancel();
  reveal.cancel();
  curtain.classList.remove('is-active');
  curtain.dataset.mode = 'plain';
}

// ---------- Welcome screen ----------

function renderPlayers(players) {
  playerList.replaceChildren(
    ...players.map((entrant) => {
      const initial = document.createElement('span');
      initial.className = 'player-initial';
      initial.setAttribute('aria-hidden', 'true');
      initial.textContent = Array.from(entrant.name)[0].toUpperCase();
      initial.style.setProperty('--chip-color', colorFor(entrant.name));

      const label = document.createElement('span');
      label.textContent = entrant.name; // textContent (not innerHTML) keeps names from being run as HTML

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'player-chip';
      button.dataset.id = entrant.id;
      button.dataset.name = entrant.name;
      button.append(initial, label);

      const li = document.createElement('li');
      li.append(button);
      return li;
    }),
  );
}

function showPicker() {
  playerPicker.hidden = false;
  nameForm.hidden = true;
}

function showNameForm({ canGoBack }) {
  playerPicker.hidden = true;
  nameForm.hidden = false;
  btnBackToList.hidden = !canGoBack;
}

// Disable every button/input in the dialogue while Tracky is busy.
function setWelcomeBusy(busy) {
  for (const control of dialogue.querySelectorAll('button, input')) control.disabled = busy;
}

// Load saved players and set up the welcome screen.
// Returns what Tracky should say first, and which element should get focus.
async function prepareWelcome() {
  welcomeLine.textContent = '';
  nameInput.value = '';
  setWelcomeBusy(false);

  try {
    const players = await api('/api/entrants');
    if (players.length > 0) {
      renderPlayers(players);
      showPicker();
      return { line: "Welcome back to Hobby Island! Who's playing today?", focusOn: playerList.querySelector('button') };
    }
    showNameForm({ canGoBack: false });
    return { line: "Oh! Hello there, and welcome to Hobby Island! Before we begin… what's your name?", focusOn: nameInput };
  } catch (error) {
    console.error(error);
    showNameForm({ canGoBack: false });
    return { line: error.message, focusOn: nameInput };
  }
}

// Returning player: click a name chip (one listener on the list handles every chip).
playerList.addEventListener('click', (event) => {
  const chip = event.target.closest('.player-chip');
  if (!chip) return;
  const entrant = { id: Number(chip.dataset.id), name: chip.dataset.name };
  enterTracker(entrant, `Hi again, ${entrant.name}! Let me check today's weather…`, centerOf(chip));
});

btnNewPlayer.addEventListener('click', () => {
  showNameForm({ canGoBack: true });
  nameInput.focus();
  say("Nice to meet you! What's your name?");
});

btnBackToList.addEventListener('click', () => {
  showPicker();
  playerList.querySelector('button')?.focus();
  say("Who's playing today?");
});

// New player: type a name. The server saves it (201) or finds the existing player (200).
nameForm.addEventListener('submit', async (event) => {
  event.preventDefault(); // stop the browser reloading the page

  const name = nameInput.value.trim().replace(/\s+/g, ' ');
  if (!name) {
    shake(dialogue);
    say("Hmm? I didn't quite catch that… What's your name?");
    nameInput.focus();
    return;
  }

  setWelcomeBusy(true);
  let result;
  try {
    result = await request('/api/entrants', { method: 'POST', body: JSON.stringify({ name }) });
  } catch (error) {
    console.error(error);
    shake(dialogue);
    setWelcomeBusy(false);
    nameInput.focus();
    say(error.message);
    return;
  }

  const saved = result.data;
  const line = result.status === 201
    ? `${saved.name}! What a lovely name. I'll remember you! Now, let me check today's weather…`
    : `Oh, ${saved.name}! I already know you. Let me check today's weather…`;
  await enterTracker(saved, line, centerOf(nameButton));
});

async function enterTracker(entrant, line, origin) {
  player.id = entrant.id;
  player.name = entrant.name;
  setWelcomeBusy(true);

  await say(line);
  await wait(500);

  playerGreeting.textContent = player.name;
  finishName.textContent = player.name;

  // Fetch the hobbies and the Hobby Log while the weather page is showing.
  // (.then(…, …) handles failure right away; the result is checked after the wipe.)
  const dataReady = Promise.all([loadHobbies(), loadTotals()]).then(() => null, (error) => error);

  await switchScreen(welcomeScreen, trackerScreen, origin, showWeatherPage);
  greeting.focus(); // move keyboard/screen-reader focus to the new screen

  const loadError = await dataReady;
  if (loadError) {
    console.error(loadError);
    showMessage(loadError.message);
  }
}

// ---------- Weather: loading page + sky ----------

// Runs while the circle wipe covers the screen: check the weather, show it,
// paint the sky behind the curtain, then carry on to the tracker.
async function showWeatherPage() {
  curtain.dataset.mode = 'loading';
  weatherAnnounce.textContent = "Checking today's weather…";
  loadingHint.hidden = true;

  if ((await locationPermission()) === 'prompt') {
    loadingHint.textContent =
      `Your browser may ask for your location. Allow it for your local weather, or block it to see ${FALLBACK_LOCATION.place}.`;
    loadingHint.hidden = false;
  }

  // Show the loading page for at least a moment, so it doesn't just flash.
  const [result] = await Promise.allSettled([getTodaysWeather(), wait(reduceMotion.matches ? 300 : 1000)]);
  const weather = result.status === 'fulfilled' ? result.value : null;
  if (!weather) console.error('Weather unavailable:', result.reason);

  applyWeather(weather);
  renderWeatherCard(weather);
  curtain.dataset.mode = 'weather';
  btnGo.focus();

  // Carry on after a few seconds, or straight away with "Let's go!"
  const stopListening = new AbortController();
  await Promise.race([
    wait(4500),
    new Promise((resolve) => btnGo.addEventListener('click', resolve, { signal: stopListening.signal })),
  ]);
  stopListening.abort();
}

function renderWeatherCard(weather) {
  const line = weatherLine(weather, player.name);
  weatherLineEl.textContent = line;
  weatherTemp.hidden = !weather;
  weatherRange.hidden = !weather;

  if (weather) {
    weatherIconEl.textContent = weatherIcon(weather);
    weatherLabel.textContent = weather.label;
    weatherTemp.textContent = `${weather.temperature}${weather.unit}`;
    weatherRange.textContent = `High ${weather.high}° · Low ${weather.low}°`;
    weatherPlace.textContent = weather.place;
    weatherAnnounce.textContent = `Today's weather: ${weather.label}, ${weather.temperature}${weather.unit}. ${line}`;
  } else {
    weatherIconEl.textContent = '🍃';
    weatherLabel.textContent = 'Weather unavailable';
    weatherPlace.textContent = "Couldn't reach the weather service";
    weatherAnnounce.textContent = line;
  }
}

// Paint the sky: sets data-weather / data-daytime on <body>, and the CSS does the rest.
function applyWeather(weather) {
  const hour = new Date().getHours();
  const isDay = weather ? weather.isDay : hour >= 6 && hour < 18; // no weather? use the clock
  document.body.dataset.weather = weather?.condition ?? 'unknown';
  document.body.dataset.daytime = isDay ? 'day' : 'night';

  weatherNow.hidden = !weather;
  if (weather) {
    weatherNow.textContent = `${weatherIcon(weather)} ${weather.temperature}${weather.unit} · ${weather.label}`;
    weatherNow.title = `${weather.place} · High ${weather.high}° · Low ${weather.low}°`;
  }
  showMessage(weatherLine(weather, player.name));
}

// ---------- Tracker screen ----------

btnSwitch.addEventListener('click', async () => {
  btnSwitch.disabled = true; // ignore double-clicks while the wipe runs
  player.id = null;
  player.name = '';

  let welcome;
  await switchScreen(trackerScreen, welcomeScreen, centerOf(btnSwitch), async () => {
    welcome = await prepareWelcome();
  });
  btnSwitch.disabled = false;
  welcome.focusOn?.focus();
  say(welcome.line);
});

// ---------- Hobbies ----------

// The hobby picked in the dropdown, as { id, name }, or null.
function selectedHobby() {
  const option = hobbySelect.selectedOptions[0];
  return option?.value ? { id: Number(option.value), name: option.textContent } : null;
}

function showHobbyOnStage() {
  const hobby = selectedHobby();
  hobbyEmoji.textContent = hobby ? emojiFor(hobby.name) : '🌱';
  stageCaption.textContent = hobby ? `${hobby.name} time!` : 'Pick a hobby to begin';
}

// Fill the dropdown from GET /api/hobbies (option value = hobby id), keeping the current choice.
async function loadHobbies() {
  const hobbies = await api('/api/hobbies');
  const keep = hobbySelect.value;
  hobbySelect.replaceChildren(
    new Option('— Select a hobby —', ''),
    ...hobbies.map((hobby) => new Option(hobby.name, String(hobby.id))),
  );
  hobbySelect.value = hobbies.some((hobby) => String(hobby.id) === keep) ? keep : '';
  showHobbyOnStage();
}

hobbySelect.addEventListener('change', () => {
  showHobbyOnStage();
  if (!reduceMotion.matches) {
    hobbyEmoji.animate([{ scale: 0.3 }, { scale: 1.25 }, { scale: 1 }], { duration: 450, easing: 'ease-out' });
  }
});

// Add a hobby: the server saves it (201) or finds the existing one (200). Either way, select it.
hobbyForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = hobbyInput.value.trim();
  if (!name) {
    hobbyInput.focus();
    return;
  }

  let result;
  try {
    result = await request('/api/hobbies', { method: 'POST', body: JSON.stringify({ name }) });
    await loadHobbies();
  } catch (error) {
    console.error(error);
    showMessage(error.message);
    return;
  }

  const hobby = result.data;
  hobbySelect.value = String(hobby.id);
  hobbySelect.dispatchEvent(new Event('change'));
  hobbyInput.value = '';
  showMessage(result.status === 201
    ? `Ooh, ${hobby.name}! I've added it to the island.`
    : `${hobby.name} is already on the list, so I picked it for you.`);
});

// ---------- Timer ----------

function elapsedSeconds() {
  const currentStretch = timer.status === 'running' ? Date.now() - timer.runningSince : 0;
  return Math.floor((timer.bankedMs + currentStretch) / 1000);
}

// Draw the time with one fixed-width box per character (see the .digit CSS),
// and show it in the tab title so it's visible from other tabs too.
let shownTime = '';
function renderTimer() {
  const text = formatDuration(elapsedSeconds());
  document.title = timer.status === 'idle' ? APP_TITLE : `${text} · ${timer.hobby.name}`;

  if (text === shownTime) return; // only rebuild the digits when the second changes
  shownTime = text;
  timerDisplay.replaceChildren(...[...text].map((char) => {
    const box = document.createElement('span');
    box.className = char === ':' ? 'colon' : 'digit';
    box.textContent = char;
    return box;
  }));
}

// Enable/disable everything to match the timer's status.
function updateTimerControls() {
  const { status } = timer;
  btnStart.disabled = status === 'running';
  startLabel.textContent = status === 'paused' ? 'Resume' : 'Start';
  btnPause.disabled = status !== 'running';
  btnStop.disabled = status === 'idle';

  // Finish (Stop) the current session before changing hobby or player.
  hobbySelect.disabled = status !== 'idle';
  hobbyInput.disabled = status !== 'idle';
  hobbyAddButton.disabled = status !== 'idle';
  btnSwitch.disabled = status !== 'idle';

  stage.classList.toggle('is-running', status === 'running');
  timerDisplay.classList.toggle('is-running', status === 'running');
  timerLabel.textContent = status === 'paused' ? 'Paused' : 'Time spent';
}

function startTimer() {
  timer.status = 'running';
  timer.runningSince = Date.now();
  timer.tickId = setInterval(renderTimer, 250); // 4×/second, so the display never lags a whole second
  updateTimerControls();
  renderTimer();
}

function pauseTimer() {
  timer.bankedMs += Date.now() - timer.runningSince;
  timer.status = 'paused';
  clearInterval(timer.tickId);
  updateTimerControls();
  renderTimer();
}

function resetTimer() {
  clearInterval(timer.tickId);
  Object.assign(timer, { status: 'idle', hobby: null, startedAt: null, bankedMs: 0, runningSince: 0, tickId: null });
  updateTimerControls();
  renderTimer();
}

btnStart.addEventListener('click', () => {
  if (timer.status === 'paused') {
    startTimer();
    showMessage(`Welcome back! The ${timer.hobby.name} timer is running again.`);
    return;
  }

  const hobby = selectedHobby();
  if (!hobby) {
    shake(hobbySelect);
    hobbySelect.focus();
    showMessage(`Pick a hobby first, ${player.name}!`);
    return;
  }
  timer.hobby = hobby;
  timer.startedAt = new Date();
  timer.bankedMs = 0;
  startTimer();
  showMessage(`Let's go, ${player.name}! ${hobby.name} time has started.`);
});

btnPause.addEventListener('click', () => {
  pauseTimer();
  showMessage("Taking a breather? Press Resume when you're ready.");
});

// Stop = save the session (POST /api/time), then celebrate.
btnStop.addEventListener('click', async () => {
  if (timer.status === 'running') pauseTimer(); // freeze the clock while saving

  const durationSeconds = elapsedSeconds();
  if (durationSeconds < 1) {
    resetTimer();
    showMessage('That was quick! Sessions need at least a second to be saved.');
    return;
  }

  btnStart.disabled = true;
  btnStop.disabled = true;
  showMessage('Saving your session…');

  const hobby = timer.hobby;
  try {
    await api('/api/time', {
      method: 'POST',
      body: JSON.stringify({
        entrant_id: player.id,
        hobby_id: hobby.id,
        started_at: timer.startedAt.toISOString(),
        ended_at: new Date().toISOString(),
        duration_seconds: durationSeconds,
      }),
    });
  } catch (error) {
    // Nothing is lost: the timer stays paused, so the player can press Stop again.
    console.error(error);
    updateTimerControls();
    const reason = /[.!?…]$/.test(error.message) ? error.message : `${error.message}.`;
    showMessage(`${reason} Your time is kept: press Stop to try again.`);
    return;
  }

  resetTimer();
  showMessage(`Saved! ${formatDuration(durationSeconds)} of ${hobby.name}. Ready for another round?`);

  const totals = await loadTotals().catch((error) => {
    console.error(error);
    return [];
  });
  showFinish(hobby, durationSeconds, totals);
});

function showFinish(hobby, durationSeconds, totals) {
  finishTime.textContent = formatDuration(durationSeconds);
  finishHobby.textContent = hobby.name;

  const mine = totals.find((row) => row.entrant_id === player.id && row.hobby_id === hobby.id);
  finishTotal.textContent = mine
    ? `Your ${hobby.name} total: ${formatDuration(mine.total_seconds)} over ${mine.sessions} session${mine.sessions === 1 ? '' : 's'}.`
    : '';
  finishDialog.showModal();
}

// Leaving the page mid-session would lose it, so ask the browser to confirm first.
window.addEventListener('beforeunload', (event) => {
  if (timer.status !== 'idle') event.preventDefault();
});

// ---------- Hobby Log (GET /api/time) ----------

// Show everyone's totals, highlighting the current player's rows. Returns the rows.
async function loadTotals() {
  const totals = await api('/api/time');

  if (totals.length === 0) {
    const td = document.createElement('td');
    td.colSpan = 4;
    td.className = 'muted';
    td.textContent = 'No sessions yet. Press Start to log the first one!';
    const tr = document.createElement('tr');
    tr.append(td);
    totalsBody.replaceChildren(tr);
    return totals;
  }

  totalsBody.replaceChildren(
    ...totals.map((row) => {
      const tr = document.createElement('tr');
      tr.classList.toggle('is-me', row.entrant_id === player.id);
      for (const value of [row.entrant, row.hobby, row.sessions, formatDuration(row.total_seconds)]) {
        const td = document.createElement('td');
        td.textContent = value; // textContent (not innerHTML) keeps names from being run as HTML
        tr.append(td);
      }
      return tr;
    }),
  );
  return totals;
}

// ---------- Start-up ----------
renderTimer();

const welcome = await prepareWelcome();
if (welcome.focusOn === nameInput) nameInput.focus(); // first visit: ready to type straight away

// Let the dialogue box pop up before Tracky starts talking
// (skip the intro if the player already picked or typed a name in the meantime).
await wait(reduceMotion.matches ? 0 : 700);
if (typingRun === 0) say(welcome.line);

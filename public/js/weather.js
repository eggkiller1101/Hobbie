// =============================================================
// Today's weather, from Open-Meteo (https://open-meteo.com).
// Free, and no account or API key needed.
//
// Why call it from the browser instead of our server? There's no
// secret key to hide, and the browser already knows how to get
// through office proxies and security certificates. (If we ever
// switch to a service that needs a key, move this to the server.)
// =============================================================

// Used when the browser can't, or isn't allowed to, share its location.
// Change it to your own town (coordinates: search your city on open-meteo.com).
export const FALLBACK_LOCATION = { place: 'Sydney', latitude: -33.87, longitude: 151.21 };

// WMO weather codes (the international standard Open-Meteo uses)
// → [label shown to the player, background scene to paint]
const WEATHER_CODES = {
  0:  ['Clear sky', 'clear'],
  1:  ['Mainly clear', 'clear'],
  2:  ['Partly cloudy', 'partly-cloudy'],
  3:  ['Overcast', 'cloudy'],
  45: ['Foggy', 'fog'],
  48: ['Icy fog', 'fog'],
  51: ['Light drizzle', 'rain'],
  53: ['Drizzle', 'rain'],
  55: ['Heavy drizzle', 'rain'],
  56: ['Freezing drizzle', 'rain'],
  57: ['Freezing drizzle', 'rain'],
  61: ['Light rain', 'rain'],
  63: ['Rain', 'rain'],
  65: ['Heavy rain', 'rain'],
  66: ['Freezing rain', 'rain'],
  67: ['Freezing rain', 'rain'],
  71: ['Light snow', 'snow'],
  73: ['Snow', 'snow'],
  75: ['Heavy snow', 'snow'],
  77: ['Snow grains', 'snow'],
  80: ['Light showers', 'rain'],
  81: ['Showers', 'rain'],
  82: ['Heavy showers', 'rain'],
  85: ['Snow showers', 'snow'],
  86: ['Heavy snow showers', 'snow'],
  95: ['Thunderstorm', 'storm'],
  96: ['Thunderstorm with hail', 'storm'],
  99: ['Thunderstorm with hail', 'storm'],
};

// [day icon, night icon] per scene
const ICONS = {
  'clear':         ['☀️', '🌙'],
  'partly-cloudy': ['⛅', '☁️'],
  'cloudy':        ['☁️', '☁️'],
  'fog':           ['🌫️', '🌫️'],
  'rain':          ['🌧️', '🌧️'],
  'storm':         ['⛈️', '⛈️'],
  'snow':          ['🌨️', '🌨️'],
};

// What Tracky says about the weather: [day line, night line]
const LINES = {
  'clear':         ['What a sunny day! Perfect for any hobby, {name}!',
                    'A calm, starry night. Cozy hobby time, {name}!'],
  'partly-cloudy': ["A few clouds about, but it's a lovely day, {name}!",
                    'A few clouds tonight. Snuggle in with a hobby, {name}!'],
  'cloudy':        ["Grey skies today. Let's brighten it up with a hobby, {name}!",
                    'A cloudy night. Perfect for a quiet hobby, {name}.'],
  'fog':           ['Ooh, foggy! A great day to stay in and focus, {name}.',
                    'A misty night. Stay in and get cozy, {name}.'],
  'rain':          ["It's raining! Perfect weather for an indoor hobby, {name}.",
                    "Rain on the roof tonight. Lovely hobby weather, {name}."],
  'storm':         ["Thunder and lightning! Let's stay in and keep busy, {name}.",
                    "A stormy night! Let's stay in and keep busy, {name}."],
  'snow':          ['Snow! Stay warm and cozy, {name}.',
                    'Snowing tonight! Stay warm and cozy, {name}.'],
};

const CACHE_MS = 10 * 60 * 1000; // re-use a result for 10 minutes
let cached = null;               // { at, weather }

// Has the player already allowed/blocked location? ('granted' | 'prompt' | 'denied' | 'unknown')
export async function locationPermission() {
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' });
    return status.state;
  } catch {
    return 'unknown';
  }
}

// Ask the browser where we are. Resolves to null if blocked, unavailable
// or too slow. Our own timer also covers time spent on the permission prompt.
function getPosition() {
  if (!navigator.geolocation) return Promise.resolve(null);

  return new Promise((resolve) => {
    const giveUp = setTimeout(() => resolve(null), 8000);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        clearTimeout(giveUp);
        resolve({ latitude: coords.latitude, longitude: coords.longitude });
      },
      () => {
        clearTimeout(giveUp);
        resolve(null);
      },
      { maximumAge: 30 * 60 * 1000, timeout: 8000 },
    );
  });
}

// Returns { condition, label, isDay, temperature, high, low, unit, place }.
// Throws if the weather service can't be reached.
export async function getTodaysWeather() {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.weather;

  const position = await getPosition();
  const location = position ?? FALLBACK_LOCATION;

  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.search = new URLSearchParams({
    // Rounded to ~1 km: plenty for weather, and we don't share an exact location.
    latitude: location.latitude.toFixed(2),
    longitude: location.longitude.toFixed(2),
    current: 'temperature_2m,weather_code,is_day',
    daily: 'temperature_2m_max,temperature_2m_min',
    timezone: 'auto',  // "today" and day/night are based on that location's clock
    forecast_days: '1',
  });

  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`Weather request failed: ${response.status}`);
  const data = await response.json();

  const [label, condition] = WEATHER_CODES[data.current.weather_code] ?? ['Mixed weather', 'partly-cloudy'];
  const weather = {
    condition,
    label,
    isDay: data.current.is_day === 1,
    temperature: Math.round(data.current.temperature_2m),
    high: Math.round(data.daily.temperature_2m_max[0]),
    low: Math.round(data.daily.temperature_2m_min[0]),
    unit: data.current_units?.temperature_2m ?? '°C',
    place: position ? 'Your location' : location.place,
  };

  cached = { at: Date.now(), weather };
  return weather;
}

export function weatherIcon(weather) {
  return ICONS[weather.condition][weather.isDay ? 0 : 1];
}

// Tracky's comment. `weather` may be null when it couldn't be fetched.
export function weatherLine(weather, name) {
  const line = weather
    ? LINES[weather.condition][weather.isDay ? 0 : 1]
    : "I couldn't check the weather, but every day is a good hobby day, {name}!";
  return line.replace('{name}', () => name); // a function, so names containing "$" stay as typed
}

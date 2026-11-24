/* EYES 4.4.6 · Weather Organ, the data side.
   Provider: Open-Meteo (https://open-meteo.com). Free for non-commercial apps without ads or subscriptions,
   no API key, data licensed CC BY 4.0 (attribution shown in Weather Organ and The Optic). Free-tier limits are
   per device IP (600/min, 5,000/h, 10,000/day); EYES makes at most a couple of calls an hour.
   If EYES ever carries ads or a subscription, Open-Meteo's terms require a paid plan.

   What leaves the phone: the place name you type (to geocoding-api.open-meteo.com) and the coordinates of the
   place you picked (to api.open-meteo.com). Device location is rounded to ~1 km before it is used or stored.
   Nothing else: no account, no identifiers.

   Everything is fetched in metric (°C, km/h) and converted on screen, so switching °F/°C never refetches.
   Times arrive as Unix seconds and are shown in the forecast location's own timezone (IANA name from the
   provider, with its UTC offset as a fallback).

   This file has no DOM and no animation: weather.js asks it for data, weather-sky.js paints it. */
'use strict';
(function (root) {
  const FORECAST = 'https://api.open-meteo.com/v1/forecast';
  const GEOCODE = 'https://geocoding-api.open-meteo.com/v1/search';
  const PREFS_KEY = 'eyes.weather.prefs.v1';
  const CACHE_KEY = 'eyes.weather.cache.v1';
  const FRESH_MS = 30 * 60e3;          // younger than this: never refetch
  const REFRESH_MS = 45 * 60e3;        // while EYES is on screen, refresh about this often
  const STALE_MS = 2 * 3600e3;         // older than this: say so, quietly
  const OLD_MS = 90 * 60e3;            // past this the "current" values come from the forecast hour instead
  const TIMEOUT_MS = 12e3;
  const F_REGIONS = ['US', 'LR', 'MM', 'BS', 'BZ', 'KY', 'PW', 'FM', 'MH', 'PR', 'GU', 'VI', 'AS', 'MP', 'UM'];

  // ---------- preferences ----------
  const DEFAULT_PREFS = { enabled: true, chip: true, idle: true, unit: 'auto', place: null };
  function readPrefs(storage) {
    const s = storage || safeStorage();
    let p = {};
    try { p = JSON.parse(s.getItem(PREFS_KEY)) || {}; } catch {}
    const out = { ...DEFAULT_PREFS };
    for (const k of ['enabled', 'chip', 'idle']) if (typeof p[k] === 'boolean') out[k] = p[k];
    if (['auto', 'F', 'C'].includes(p.unit)) out.unit = p.unit;
    out.place = cleanPlace(p.place);
    return out;
  }
  function writePrefs(prefs, storage) {
    const s = storage || safeStorage();
    try { s.setItem(PREFS_KEY, JSON.stringify(prefs)); return true; } catch { return false; }
  }
  function cleanPlace(pl) {
    if (!pl || typeof pl !== 'object') return null;
    const lat = Number(pl.lat), lon = Number(pl.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    const src = pl.source === 'device' ? 'device' : 'manual';
    return {
      name: str(pl.name, 80) || (src === 'device' ? 'Your location' : 'Somewhere'),
      region: str(pl.region, 80), country: str(pl.country, 60), cc: str(pl.cc, 2).toUpperCase(),
      lat: round(lat, src === 'device' ? 2 : 4), lon: round(lon, src === 'device' ? 2 : 4),
      tz: str(pl.tz, 64), source: src, at: Number(pl.at) || 0
    };
  }
  const str = (v, n) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n) : '');
  const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d;
  function safeStorage() {
    try { if (root.localStorage) return root.localStorage; } catch {}
    const m = new Map();
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
  }

  // °F where people use it, °C everywhere else; an explicit choice always wins
  function regionOf(lang) {
    const m = /[-_]([A-Za-z]{2})\b/.exec(String(lang || ''));
    return m ? m[1].toUpperCase() : '';
  }
  function resolveUnit(prefs, place, langs) {
    if (prefs && (prefs.unit === 'F' || prefs.unit === 'C')) return prefs.unit;
    const list = Array.isArray(langs) ? langs : [langs];
    for (const l of list) { const r = regionOf(l); if (r) return F_REGIONS.includes(r) ? 'F' : 'C'; }
    if (place && place.cc) return F_REGIONS.includes(place.cc) ? 'F' : 'C';
    return 'C';
  }
  const toUnit = (c, unit) => (c == null || !Number.isFinite(c) ? null : unit === 'F' ? c * 9 / 5 + 32 : c);
  function fmtTemp(c, unit, bare) {
    const v = toUnit(c, unit);
    if (v == null) return '–';
    const n = Math.round(v);
    return (Object.is(n, -0) ? 0 : n) + '°' + (bare ? '' : unit);
  }
  const fmtWind = (kmh, unit) => (kmh == null ? '' : unit === 'F' ? Math.round(kmh / 1.609) + ' mph' : Math.round(kmh) + ' km/h');

  // ---------- conditions ----------
  // WMO weather interpretation codes → the scenes EYES can grow inside him
  //   sun · partly · overcast · rain · storm · snow · fog · wind · night (clear night)
  const WMO = {
    0: ['Clear', 'clear'], 1: ['Mostly clear', 'clear'], 2: ['Partly cloudy', 'partly'], 3: ['Overcast', 'overcast'],
    45: ['Fog', 'fog'], 48: ['Freezing fog', 'fog'],
    51: ['Light drizzle', 'rain', 0.25], 53: ['Drizzle', 'rain', 0.35], 55: ['Heavy drizzle', 'rain', 0.5],
    56: ['Freezing drizzle', 'rain', 0.35], 57: ['Freezing drizzle', 'rain', 0.5],
    61: ['Light rain', 'rain', 0.45], 63: ['Rain', 'rain', 0.7], 65: ['Heavy rain', 'rain', 1],
    66: ['Freezing rain', 'rain', 0.6], 67: ['Freezing rain', 'rain', 0.9],
    71: ['Light snow', 'snow', 0.4], 73: ['Snow', 'snow', 0.7], 75: ['Heavy snow', 'snow', 1], 77: ['Snow grains', 'snow', 0.35],
    80: ['Light showers', 'rain', 0.45], 81: ['Showers', 'rain', 0.7], 82: ['Violent showers', 'rain', 1],
    85: ['Snow showers', 'snow', 0.55], 86: ['Heavy snow showers', 'snow', 0.95],
    95: ['Thunderstorm', 'storm', 0.8], 96: ['Thunderstorm, hail', 'storm', 0.9], 99: ['Thunderstorm, hail', 'storm', 1]
  };
  const WINDY_KMH = 38;
  // one forecast moment → { kind, label, night, intensity, code, wind }
  function condition(code, isDay, windKmh) {
    const w = WMO[code];
    if (!w) return null;
    let [label, kind, intensity] = w;
    const night = isDay === 0 || isDay === false;
    if (kind === 'clear') {
      kind = night ? 'night' : 'sun';
      if (!night && code === 0) label = 'Sunny';
      if (!night && code === 1) label = 'Mostly sunny';
    }
    // a windy dry day is its own scene; wet or wintry weather keeps its own and simply moves faster
    if (Number.isFinite(windKmh) && windKmh >= WINDY_KMH && ['sun', 'partly', 'overcast', 'night'].includes(kind)) {
      kind = 'wind';
      label = label === 'Overcast' ? 'Windy, overcast' : label === 'Partly cloudy' ? 'Windy, some clouds' : 'Windy';
    }
    return { kind, label, night, intensity: intensity == null ? (kind === 'partly' ? 0.5 : 1) : intensity, code, wind: Number.isFinite(windKmh) ? windKmh : null };
  }

  // ---------- time in the forecast's own place ----------
  const fmtCache = new Map();
  function formatter(tz, opts) {
    const key = tz + '|' + JSON.stringify(opts);
    if (!fmtCache.has(key)) {
      let f = null;
      try { f = new Intl.DateTimeFormat(undefined, { ...opts, timeZone: tz }); } catch { f = null; }
      fmtCache.set(key, f);
    }
    return fmtCache.get(key);
  }
  // parts of a moment as the clock on a wall in that place would read it
  function localParts(sec, data) {
    const tz = data && data.tz;
    const f = tz && formatter(tz, { hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', weekday: 'short' });
    if (f && f.formatToParts) {
      try {
        const p = {};
        for (const x of f.formatToParts(new Date(sec * 1000))) p[x.type] = x.value;
        return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, wd: p.weekday };
      } catch {}
    }
    const off = (data && Number(data.offset)) || 0;
    const d = new Date((sec + off) * 1000);
    return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), wd: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()] };
  }
  function hour12(langs) {
    try { return new Intl.DateTimeFormat(Array.isArray(langs) ? langs[0] : langs, { hour: 'numeric' }).resolvedOptions().hour12 !== false; } catch { return true; }
  }
  function fmtHour(sec, data, h12) {
    const p = localParts(sec, data);
    if (h12 === false) return String(p.h).padStart(2, '0') + ':00';
    const h = p.h % 12 || 12;
    return h + (p.h < 12 ? ' AM' : ' PM');
  }
  function fmtClock(sec, data, h12) {
    const p = localParts(sec, data);
    const mm = String(p.mi).padStart(2, '0');
    if (h12 === false) return String(p.h).padStart(2, '0') + ':' + mm;
    return (p.h % 12 || 12) + ':' + mm + (p.h < 12 ? ' AM' : ' PM');
  }
  function ago(ms) {
    const m = Math.max(0, Math.round(ms / 60e3));
    if (m < 1) return 'just now';
    if (m < 60) return m + ' min ago';
    const h = Math.round(m / 60);
    if (h < 48) return h + ' h ago';
    return Math.round(h / 24) + ' days ago';
  }

  // ---------- the network ----------
  function withTimeout(promise, ms, ctl) {
    let timer;
    return Promise.race([
      promise,
      new Promise((_, rej) => { timer = setTimeout(() => { try { ctl && ctl.abort(); } catch {} rej(err('timeout', 'The weather took too long to answer.')); }, ms); })
    ]).finally(() => clearTimeout(timer));
  }
  function err(code, message) { const e = new Error(message); e.code = code; return e; }
  async function getJSON(url, fetcher) {
    const f = fetcher || (root.fetch && root.fetch.bind(root));
    if (!f) throw err('offline', 'No network here.');
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    let res;
    try {
      res = await withTimeout(f(url, { signal: ctl ? ctl.signal : undefined, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' }), TIMEOUT_MS, ctl);
    } catch (e) {
      if (e && typeof e.code === 'string') throw e;                       // our own timeout
      if (e && e.name === 'AbortError') throw err('timeout', 'The weather took too long to answer.');
      throw err('offline', 'Couldn’t reach the weather. Check your connection.');
    }
    if (!res || !res.ok) {
      let reason = '';
      try { const j = await res.json(); reason = j && j.reason ? String(j.reason) : ''; } catch {}
      if (res && res.status === 429) throw err('limited', 'The weather service is busy. EYES will try again later.');
      if (res && res.status === 400) throw err('unsupported', reason ? 'The weather service can’t forecast that place.' : 'That place isn’t supported.');
      throw err('provider', 'The weather service is having trouble' + (res ? ' (' + res.status + ')' : '') + '.');
    }
    try { return await res.json(); } catch { throw err('provider', 'The weather service sent something unreadable.'); }
  }

  async function searchPlaces(query, opts) {
    const q = String(query || '').trim().slice(0, 80);
    if (q.length < 2) return [];
    const lang = (opts && opts.lang) || 'en';
    const url = GEOCODE + '?name=' + encodeURIComponent(q) + '&count=8&format=json&language=' + encodeURIComponent(lang.slice(0, 2));
    const j = await getJSON(url, opts && opts.fetch);
    const list = Array.isArray(j && j.results) ? j.results : [];
    return list.map((r) => cleanPlace({
      name: r.name, region: r.admin1 || r.admin2 || '', country: r.country || '', cc: r.country_code || '',
      lat: r.latitude, lon: r.longitude, tz: r.timezone || '', source: 'manual'
    })).filter(Boolean);
  }

  function forecastUrl(place) {
    const q = [
      'latitude=' + place.lat, 'longitude=' + place.lon,
      'current=temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m,wind_direction_10m,precipitation,cloud_cover',
      'hourly=temperature_2m,apparent_temperature,precipitation_probability,weather_code,is_day,wind_speed_10m,wind_direction_10m',
      'daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset',
      'timezone=auto', 'timeformat=unixtime', 'forecast_days=7', 'past_hours=1',
      'temperature_unit=celsius', 'wind_speed_unit=kmh'
    ];
    return FORECAST + '?' + q.join('&');
  }

  // Open-Meteo's shape → EYES' shape. Missing pieces stay missing (null), never made up.
  function normalize(j, place, fetchedAt) {
    if (!j || typeof j !== 'object') throw err('provider', 'The weather service sent nothing usable.');
    const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    const arr = (o, k) => (o && Array.isArray(o[k]) ? o[k] : []);
    const H = j.hourly || {}, D = j.daily || {}, C = j.current || null;
    const ht = arr(H, 'time');
    const hours = [];
    for (let i = 0; i < ht.length; i++) {
      const t = num(ht[i]);
      if (t == null) continue;
      hours.push({
        t, temp: num(arr(H, 'temperature_2m')[i]), feels: num(arr(H, 'apparent_temperature')[i]),
        pop: num(arr(H, 'precipitation_probability')[i]), code: num(arr(H, 'weather_code')[i]),
        day: num(arr(H, 'is_day')[i]), wind: num(arr(H, 'wind_speed_10m')[i]), dir: num(arr(H, 'wind_direction_10m')[i])
      });
    }
    const dt = arr(D, 'time');
    const days = [];
    for (let i = 0; i < dt.length; i++) {
      const t = num(dt[i]);
      if (t == null) continue;
      days.push({
        t, code: num(arr(D, 'weather_code')[i]), hi: num(arr(D, 'temperature_2m_max')[i]), lo: num(arr(D, 'temperature_2m_min')[i]),
        pop: num(arr(D, 'precipitation_probability_max')[i]), sunrise: num(arr(D, 'sunrise')[i]), sunset: num(arr(D, 'sunset')[i])
      });
    }
    const current = C && num(C.time) != null ? {
      t: num(C.time), temp: num(C.temperature_2m), feels: num(C.apparent_temperature), code: num(C.weather_code),
      day: num(C.is_day), wind: num(C.wind_speed_10m), dir: num(C.wind_direction_10m), cloud: num(C.cloud_cover), precip: num(C.precipitation)
    } : null;
    if (!hours.length && !(current && current.temp != null)) throw err('incomplete', 'The forecast came back empty for this place.');
    return {
      v: 1, fetchedAt: fetchedAt || Date.now(),
      place: { ...place, tz: str(j.timezone, 64) || place.tz || '' },
      tz: str(j.timezone, 64) || place.tz || '', offset: num(j.utc_offset_seconds) || 0,
      current, hours, days
    };
  }

  async function fetchForecast(place, opts) {
    const p = cleanPlace(place);
    if (!p) throw err('noplace', 'Choose a place for the weather.');
    const j = await getJSON(forecastUrl(p), opts && opts.fetch);
    return normalize(j, p, (opts && opts.now) || Date.now());
  }

  // ---------- cache ----------
  const placeKey = (p) => (p ? p.lat.toFixed(2) + ',' + p.lon.toFixed(2) : '');
  function readCache(storage) {
    const s = storage || safeStorage();
    try {
      const c = JSON.parse(s.getItem(CACHE_KEY));
      if (!c || c.v !== 1 || !Array.isArray(c.hours) || !c.place) return null;
      return c;
    } catch { return null; }
  }
  function writeCache(data, storage) {
    const s = storage || safeStorage();
    try { s.setItem(CACHE_KEY, JSON.stringify(data)); return true; } catch { return false; }
  }
  function clearCache(storage) { const s = storage || safeStorage(); try { s.removeItem(CACHE_KEY); } catch {} }

  // ---------- reading the forecast for a moment ----------
  // the hour that contains `sec` (or null if the forecast doesn't reach it)
  function hourIndex(data, sec) {
    const h = data && data.hours;
    if (!h || !h.length) return -1;
    for (let i = h.length - 1; i >= 0; i--) if (h[i].t <= sec) return sec - h[i].t < 3600 ? i : -1;
    return -1;
  }
  function dayFor(data, sec) {
    const d = data && data.days;
    if (!d || !d.length) return null;
    const p = localParts(sec, data);
    for (const day of d) { const q = localParts(day.t + 43200, data); if (q.y === p.y && q.mo === p.mo && q.d === p.d) return day; }
    return null;
  }
  // is it daytime at `sec`? Sunrise and sunset first, the provider's flag second
  function isDayAt(data, sec, fallback) {
    const day = dayFor(data, sec);
    if (day && day.sunrise != null && day.sunset != null) return sec >= day.sunrise && sec < day.sunset ? 1 : 0;
    return fallback == null ? null : fallback;
  }
  // "now", honestly: fresh current conditions when we have them; otherwise the forecast for this hour, marked
  function nowView(data, nowMs) {
    if (!data) return null;
    const t = nowMs || Date.now(), sec = Math.floor(t / 1000), age = t - data.fetchedAt;
    const hi = hourIndex(data, sec);
    const hr = hi >= 0 ? data.hours[hi] : null;
    let src = null, from = 'none';
    const c = data.current;
    if (c && c.temp != null && age < OLD_MS && Math.abs(sec - c.t) < 3 * 3600) { src = c; from = 'current'; }
    else if (hr && hr.temp != null) { src = hr; from = 'forecast'; }
    if (!src) return { available: false, age, stale: true, from };
    const day = dayFor(data, sec);
    const isDay = isDayAt(data, sec, src.day);
    const cond = condition(src.code, isDay, src.wind);
    return {
      available: true, from, age, stale: age > STALE_MS, t: src.t,
      temp: src.temp, feels: src.feels != null ? src.feels : null,
      cond, pop: hr ? hr.pop : null, wind: src.wind, dir: src.dir,
      hi: day ? day.hi : null, lo: day ? day.lo : null, dayPop: day ? day.pop : null,
      sunrise: day ? day.sunrise : null, sunset: day ? day.sunset : null
    };
  }
  // upcoming hours, starting with the one we're in
  function upcoming(data, nowMs, count) {
    if (!data || !data.hours) return [];
    const sec = Math.floor((nowMs || Date.now()) / 1000);
    let i = hourIndex(data, sec);
    if (i < 0) i = data.hours.findIndex((h) => h.t > sec);
    if (i < 0) return [];
    return data.hours.slice(i, i + (count || 24)).map((h) => ({ ...h, cond: condition(h.code, isDayAt(data, h.t + 1800, h.day), h.wind) }));
  }
  function dailyList(data, nowMs) {
    if (!data || !data.days) return [];
    const today = localParts(Math.floor((nowMs || Date.now()) / 1000), data);
    return data.days.filter((d) => { const p = localParts(d.t + 43200, data); return p.y * 400 + p.mo * 32 + p.d >= today.y * 400 + today.mo * 32 + today.d; })
      .map((d) => ({ ...d, cond: condition(d.code, 1, null), wd: localParts(d.t + 43200, data).wd }));
  }

  // ---------- one weather source for the whole launcher ----------
  // Fetches only when asked and stale; a single timer while EYES is visible; nothing at all while hidden.
  function createService(opts) {
    const o = opts || {};
    const storage = o.storage || safeStorage();
    const listeners = new Set();
    const S = { prefs: readPrefs(storage), data: readCache(storage), busy: null, error: null, lastTry: 0, timer: 0, visible: true, fetches: 0 };
    if (S.data && S.prefs.place && placeKey(S.data.place) !== placeKey(S.prefs.place)) S.data = null;
    const now = () => (o.now ? o.now() : Date.now());
    const emit = (why) => { for (const f of listeners) { try { f(why, S); } catch {} } };
    function setPrefs(patch) {
      const before = S.prefs;
      S.prefs = { ...S.prefs, ...patch, place: patch && 'place' in patch ? cleanPlace(patch.place) : S.prefs.place };
      writePrefs(S.prefs, storage);
      if (placeKey(before.place) !== placeKey(S.prefs.place)) {
        S.data = null; S.error = null; clearCache(storage);
        if (S.prefs.place && S.prefs.enabled) refresh({ force: true });
      }
      if (!S.prefs.enabled) stopTimer(); else plan();
      emit('prefs');
    }
    function age() { return S.data ? now() - S.data.fetchedAt : Infinity; }
    async function refresh(r) {
      const force = !!(r && r.force);
      if (!S.prefs.enabled || !S.prefs.place) return S.data;
      if (S.busy) return S.busy;
      if (!force && age() < FRESH_MS) return S.data;
      // after a failure, wait a little before trying again (unless you asked)
      if (!force && S.error && now() - S.lastTry < 5 * 60e3) return S.data;
      const place = S.prefs.place;
      S.lastTry = now(); S.fetches++;
      S.busy = (o.fetchForecast || fetchForecast)(place, { fetch: o.fetch, now: now() }).then((d) => {
        S.busy = null;
        if (placeKey(S.prefs.place) !== placeKey(place)) return S.data;     // the place changed while we waited
        S.data = d; S.error = null; writeCache(d, storage);
        emit('data');
        return d;
      }, (e) => {
        S.busy = null;
        S.error = { code: (e && e.code) || 'provider', message: (e && e.message) || 'The weather is unavailable.', at: now() };
        emit('error');
        return S.data;
      }).finally(() => { S.busy = null; plan(); });
      emit('loading');
      return S.busy;
    }
    function stopTimer() { if (S.timer) { clearTimeout(S.timer); S.timer = 0; } }
    function plan() {
      stopTimer();
      if (!S.visible || !S.prefs.enabled || !S.prefs.place) return;
      const wait = S.error ? 10 * 60e3 : Math.max(60e3, REFRESH_MS - age());
      S.timer = setTimeout(() => { S.timer = 0; refresh(); }, Math.min(wait, REFRESH_MS));
    }
    function visible(on) {
      S.visible = !!on;
      if (!on) { stopTimer(); return; }
      if (age() >= FRESH_MS) refresh(); else plan();
    }
    return {
      get prefs() { return S.prefs; }, get data() { return S.data; }, get error() { return S.error; }, get busy() { return !!S.busy; },
      setPrefs, refresh, visible, age,
      unit: () => resolveUnit(S.prefs, S.prefs.place, o.langs || (root.navigator ? navigator.languages || [navigator.language] : [])),
      now: (t) => nowView(S.data, t || now()),
      on: (f) => { listeners.add(f); return () => listeners.delete(f); },
      diagnostics: () => ({ fetches: S.fetches, timer: !!S.timer, visible: S.visible, age: age(), error: S.error, place: S.prefs.place, hours: S.data ? S.data.hours.length : 0 })
    };
  }

  const API = {
    FRESH_MS, REFRESH_MS, STALE_MS, OLD_MS, PREFS_KEY, CACHE_KEY, WMO,
    readPrefs, writePrefs, cleanPlace, resolveUnit, toUnit, fmtTemp, fmtWind, condition,
    localParts, fmtHour, fmtClock, hour12, ago, searchPlaces, forecastUrl, normalize, fetchForecast,
    readCache, writeCache, clearCache, hourIndex, dayFor, isDayAt, nowView, upcoming, dailyList, createService, placeKey
  };
  root.EyesWeatherData = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);

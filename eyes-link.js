/* EYES for iPhone: Eye Contact.
   Speaks exactly the same protocol as the Android app's native HavenLink, so an iPhone and an
   Android EYES/HAVEN can pair with the same HL1 invite code.

   Code   HL1-<43 chars base64url> = 32 random bytes (the shared secret, never leaves the two phones)
   Topic  "haven_link_" + hex(SHA-256("HAVEN-LINK-TOPIC-1" || key))[first 22 bytes]   on https://ntfy.sh
   Wire   "HL1." + base64url(iv[12] || AES-256-GCM(json, 128-bit tag))
   JSON   { v:1, s:<my id>, k:<kind>, t:<ms>, n:<16-char nonce> }  (+ p:<profile json> when k = "profile")
   Kinds  pulse, spark, calm, resonance, hello, profile
   Pairing: whoever joins says "hello"; the first other id heard becomes the peer and gets a "hello" back.
   Rules mirrored from Android: drop anything >12 h off, ignore our own id, only the peer after pairing,
   nonce de-duplication, profiles only once paired, a pulse answered within 9 s becomes "resonance".
   Signals older than 10 minutes don't play live (as on Android); here they're kept as "while you were away". */
(function (root) {
  'use strict';
  const RELAY = 'https://ntfy.sh/';
  const LS = 'eyes.link.v1';
  const SIGNALS = ['pulse', 'spark', 'calm', 'resonance', 'hello'];
  const CODE_RE = /HL1-[A-Za-z0-9_-]{43}/;
  const enc = new TextEncoder(), dec = new TextDecoder();

  // ---------- small helpers ----------
  function b64u(bytes) {
    let s = ''; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function unb64u(str) {
    let s = str.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '=';
    const bin = atob(s), out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  const randomBytes = (n) => crypto.getRandomValues(new Uint8Array(n));
  const randomId = (n) => b64u(randomBytes(n));
  const findCode = (text) => (String(text || '').match(CODE_RE) || [null])[0];

  // ---------- state ----------
  let st = load();
  let key = null, topic = null, active = false, gen = 0, abort = null, retry = 0, connection = 'off';
  let lastSend = 0, lastSentPulse = 0, lastIncomingPulse = 0, lastResonance = 0, lastProfileSent = 0;
  const seen = [];                    // relay message ids
  const listeners = {};
  function load() {
    let s = null; try { s = JSON.parse(localStorage.getItem(LS)); } catch (e) {}
    if (!s || typeof s !== 'object') s = {};
    if (typeof s.myId !== 'string' || s.myId.length < 15) s.myId = randomId(18);
    if (!Array.isArray(s.nonces)) s.nonces = [];
    if (!Array.isArray(s.missed)) s.missed = [];
    return s;
  }
  function save() { try { localStorage.setItem(LS, JSON.stringify(st)); } catch (e) {} }
  function emit(name, data) { (listeners[name] || []).forEach((f) => { try { f(data); } catch (e) { console.error(e); } }); }
  function status() { emit('status', { linked: !!key, paired: !!st.peer, connection, code: st.code || '' }); }

  // ---------- crypto ----------
  async function applySecret(code) {
    code = String(code || '').trim();
    if (!/^HL1-[A-Za-z0-9_-]{43}$/.test(code)) throw new Error('Invalid code');
    const raw = unb64u(code.slice(4));
    if (raw.length !== 32) throw new Error('Invalid code');
    const pre = enc.encode('HAVEN-LINK-TOPIC-1'), buf = new Uint8Array(pre.length + 32);
    buf.set(pre); buf.set(raw, pre.length);
    const h = new Uint8Array(await crypto.subtle.digest('SHA-256', buf));
    let hex = ''; for (let i = 0; i < 22; i++) hex += h[i].toString(16).padStart(2, '0');
    key = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
    topic = 'haven_link_' + hex;
  }
  async function encrypt(obj) {
    const iv = randomBytes(12);
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128 }, key, enc.encode(JSON.stringify(obj))));
    const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12);
    return 'HL1.' + b64u(out);
  }
  async function decrypt(str) {
    if (typeof str !== 'string' || str.length > 3000 || !str.startsWith('HL1.')) return null;
    let b; try { b = unb64u(str.slice(4)); } catch (e) { return null; }
    if (b.length < 29) return null;
    try {
      const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b.slice(0, 12), tagLength: 128 }, key, b.slice(12));
      return JSON.parse(dec.decode(pt));
    } catch (e) { return null; }
  }

  // ---------- relay ----------
  async function publish(obj, silent) {
    if (!key || !topic) return;
    const body = await encrypt(obj);
    try {
      // query params instead of custom headers keep this a "simple" request (no CORS preflight)
      const r = await fetch(RELAY + topic + '?priority=min&firebase=no', { method: 'POST', body, headers: { 'Content-Type': 'text/plain; charset=utf-8' }, cache: 'no-store' });
      if (!r.ok) throw new Error('rejected');
    } catch (e) { if (!silent) emit('error', 'Your signal could not reach the relay'); }
  }
  function sendInternal(kind, silent) {
    const msg = { v: 1, s: st.myId, k: kind, t: Date.now(), n: randomId(12) };
    if (!silent) emit('outgoing', kind);
    return publish(msg, silent);
  }
  function since() {
    // a saved cursor if it's fresh enough, otherwise the last 12 h so missed signals can be shown
    if (st.cursor && Date.now() - (st.cursorAt || 0) < 11 * 3600000) return st.cursor;
    return '12h';
  }
  async function listen(g) {
    while (active && g === gen && key) {
      const ctl = new AbortController(); abort = ctl;
      let idle;
      const kick = () => { clearTimeout(idle); idle = setTimeout(() => ctl.abort(), 75000); };   // ntfy keepalives every ~45 s
      try {
        kick();
        const r = await fetch(RELAY + topic + '/json?since=' + encodeURIComponent(since()), { signal: ctl.signal, cache: 'no-store', headers: { Accept: 'application/x-ndjson' } });
        if (!r.ok || !r.body) throw new Error('unavailable');
        if (g !== gen) return;
        connection = 'online'; retry = 0; status();
        const reader = r.body.getReader(); let buf = '';
        while (active && g === gen) {
          const { value, done } = await reader.read();
          if (done) break;
          kick();
          buf += dec.decode(value, { stream: true });
          let i;
          while ((i = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
            if (line && line.length <= 4000) await processLine(line);
          }
        }
      } catch (e) {
        if (!active || g !== gen) return;
        connection = 'offline'; status();
      } finally { clearTimeout(idle); }
      if (!active || g !== gen) return;
      retry = Math.min(6, retry + 1);
      await new Promise((res) => setTimeout(res, Math.min(30000, 800 * 2 ** retry)));
    }
  }
  async function processLine(line) {
    let m; try { m = JSON.parse(line); } catch (e) { return; }
    if (m.event !== 'message') return;
    const id = m.id || '';
    if (id) {
      if (seen.includes(id)) return;
      seen.push(id); if (seen.length > 140) seen.shift();
      st.cursor = id; st.cursorAt = Date.now(); save();
    }
    if (!key) return;
    const p = await decrypt(m.message || '');
    if (!p || p.v !== 1) return;
    const now = Date.now(), age = Math.abs(now - (Number(p.t) || 0));
    if (age > 12 * 3600000) return;
    const s = typeof p.s === 'string' ? p.s : '', k = typeof p.k === 'string' ? p.k : '';
    if (s.length < 15 || s.length > 90 || s === st.myId) return;
    const isProfile = k === 'profile';
    if (!isProfile && !SIGNALS.includes(k)) return;
    if (isProfile && !st.peer) return;
    const n = typeof p.n === 'string' ? p.n : '';
    if (!/^[A-Za-z0-9_-]{16}$/.test(n) || st.nonces.includes(n)) return;
    st.nonces.push(n); if (st.nonces.length > 140) st.nonces.shift(); save();
    if (st.peer && st.peer !== s) return;
    if (!st.peer) {                                   // first other eye heard: that's our peer
      st.peer = s; save(); status(); emit('paired');
      sendInternal('hello', true);
    }
    if (isProfile) {
      if (typeof p.p === 'string' && p.p.length <= 1024 && enc.encode(p.p).length <= 1024) { try { emit('profile', JSON.parse(p.p)); } catch (e) {} }
      return;
    }
    if (k === 'hello') return;
    if (age > 600000) {                               // too old to play live: remember it quietly
      if (k !== 'resonance') { st.missed.push({ k, t: Number(p.t) }); st.missed = st.missed.slice(-12); save(); emit('missed', st.missed.slice()); }
      return;
    }
    if (k === 'resonance') { if (now - lastResonance < 5500) return; lastResonance = now; }
    if (k === 'pulse') {
      const answer = now - lastSentPulse <= 9000 && now - lastResonance > 6000;
      lastIncomingPulse = now;
      if (answer) { lastResonance = now; emit('incoming', 'resonance'); sendInternal('resonance', false); return; }
    }
    emit('incoming', k);
  }

  // ---------- public ----------
  async function switchCode(code) {
    const oldKey = key, oldTopic = topic;
    try { await applySecret(code); } catch (e) { key = oldKey; topic = oldTopic; throw e; }
    stop();
    Object.assign(st, { code, peer: null, cursor: null, cursorAt: 0, nonces: [], missed: [] }); save();
    seen.length = 0; lastResonance = lastSentPulse = lastIncomingPulse = lastProfileSent = 0;
    connection = 'connecting'; status();
  }
  function start() {
    if (!key || active) return;
    active = true; const g = ++gen; connection = 'connecting'; status();
    listen(g);
    if (!st.peer) sendInternal('hello', true);
  }
  function stop() {
    active = false; gen++;
    if (abort) { try { abort.abort(); } catch (e) {} abort = null; }
    connection = key ? 'sleeping' : 'off'; status();
  }
  const Link = {
    on(name, f) { (listeners[name] = listeners[name] || []).push(f); },
    findCode,
    state: () => ({ linked: !!key, paired: !!st.peer, connection, code: st.code || '', missed: st.missed.slice() }),
    async restore() { if (st.code) { try { await applySecret(st.code); start(); } catch (e) { st.code = null; save(); } } status(); },
    async create() {
      const code = 'HL1-' + b64u(randomBytes(32));
      await switchCode(code); start(); return code;
    },
    async join(text) {
      const code = findCode(text);
      if (!code) throw new Error("That isn't a valid Eye Contact code");
      if (code === st.code) throw new Error("That's already your code");
      await switchCode(code); start(); return code;
    },
    send(kind) {
      if (!key || !st.peer) { emit('error', 'Pair with their eye first'); return false; }
      if (!['pulse', 'spark', 'calm'].includes(kind)) return false;
      const now = Date.now();
      if (now - lastSend < 1900) return false;
      lastSend = now;
      if (kind === 'pulse') lastSentPulse = now;
      sendInternal(kind, false);
      if (kind === 'pulse' && now - lastIncomingPulse < 9000 && now - lastResonance > 6000) {
        lastResonance = now; emit('incoming', 'resonance'); sendInternal('resonance', false);
      }
      return true;
    },
    sendProfile(json) {
      if (!key || !st.peer || !active || typeof json !== 'string' || enc.encode(json).length > 1024) return false;
      const now = Date.now(); if (now - lastProfileSent < 30000) return false;
      lastProfileSent = now;
      publish({ v: 1, s: st.myId, k: 'profile', p: json, t: now, n: randomId(12) }, true);
      return true;
    },
    clearMissed() { st.missed = []; save(); },
    unlink() { stop(); key = null; topic = null; Object.assign(st, { code: null, peer: null, cursor: null, cursorAt: 0, nonces: [], missed: [] }); save(); connection = 'off'; status(); },
    wake() { if (key && !active) start(); },
    sleep() { if (active) stop(); },
    // for tests
    _debug: { applySecret, encrypt, decrypt, topic: () => topic, processLine, myId: () => st.myId }
  };
  root.EyesLink = Link;
})(window);

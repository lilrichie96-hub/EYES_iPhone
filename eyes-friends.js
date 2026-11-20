/* EYES 4.0 · Friends: many linked eyes.
   Each friend is one Eye Contact channel on the protocol decoded from Android's native HavenLink
   (HL1 code → AES-256-GCM, topic on ntfy.sh, {v,s,k,t,n} messages; see eyes-link notes in the README).
   - On Android the native link (if any) stays exactly as it was and shows up here as one friend;
     every new friend runs in this file. On iPhone every friend runs here (1.x's single link is migrated).
   - Presence: opening EYES says a silent "hello" to every friend (at most every 2 min). A hello means
     "I'm here now", so you can see who's awake and a pulse between two open eyes becomes resonance.
   - History per friend: when you met, signals traded, first resonance.
   - Notifications: after a signal to a friend who isn't open right now, a contentless nudge goes to the
     push relay (eyes-push.js). */
'use strict';
(function (root) {
  const RELAY = 'https://ntfy.sh/';
  const KEY = 'eyes.friends.v1';
  const SIGNALS = ['pulse', 'spark', 'calm', 'resonance', 'hello'];
  const CODE_RE = /HL1-[A-Za-z0-9_-]{43}/;
  const enc = new TextEncoder(), dec = new TextDecoder();
  const b64u = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const unb64u = (str) => { let s = str.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; const bin = atob(s), out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; };
  const randomBytes = (n) => crypto.getRandomValues(new Uint8Array(n));
  const randomId = (n) => b64u(randomBytes(n));
  const hex = (b, n) => { let s = ''; for (let i = 0; i < (n || b.length); i++) s += b[i].toString(16).padStart(2, '0'); return s; };
  const sha = async (...parts) => { const len = parts.reduce((a, p) => a + p.length, 0), buf = new Uint8Array(len); let o = 0; for (const p of parts) { buf.set(p, o); o += p.length; } return new Uint8Array(await crypto.subtle.digest('SHA-256', buf)); };
  const findCode = (text) => (String(text || '').match(CODE_RE) || [null])[0];

  // ---------- store ----------
  let st = load();
  function load() {
    let s = null; try { s = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
    if (!s || typeof s !== 'object') s = {};
    if (!Array.isArray(s.friends)) s.friends = [];
    if (!s.native || typeof s.native !== 'object') s.native = { stats: {}, firsts: {} };
    // iPhone 1.x kept one link in eyes.link.v1: it becomes the first friend, same id, same peer
    if (!s.myId) {
      try {
        const old = JSON.parse(localStorage.getItem('eyes.link.v1'));
        if (old && old.myId) s.myId = old.myId;
        if (old && old.code && !s.friends.length) {
          let prof = null; try { prof = JSON.parse(localStorage.getItem('haven.link.friend.v1')).profile; } catch (e) {}
          s.friends.push({ code: old.code, peer: old.peer || null, cursor: old.cursor || null, cursorAt: old.cursorAt || 0, nonces: old.nonces || [], missed: old.missed || [], profile: prof, addedAt: Date.now(), stats: {}, firsts: {} });
        }
      } catch (e) {}
    }
    if (typeof s.myId !== 'string' || s.myId.length < 15) s.myId = randomId(18);
    s.friends.forEach((f) => { f.stats = f.stats || {}; f.firsts = f.firsts || {}; f.nonces = f.nonces || []; f.missed = f.missed || []; });
    return s;
  }
  let saveT = 0;
  function save(now) {
    clearTimeout(saveT);
    const w = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} };
    if (now) w(); else saveT = setTimeout(w, 400);
  }
  const listeners = {};
  function emit(name, ...a) { (listeners[name] || []).forEach((f) => { try { f(...a); } catch (e) { console.error(e); } }); }

  // ---------- one channel per friend ----------
  const channels = new Map();          // code -> Channel
  class Channel {
    constructor(f) { this.f = f; this.key = null; this.topic = null; this.active = false; this.gen = 0; this.abort = null; this.retry = 0; this.connection = 'off'; this.seen = []; this.lastSend = 0; this.lastSentPulse = 0; this.lastIncomingPulse = 0; this.lastResonance = 0; this.lastProfile = 0; this.lastHello = 0; }
    async init() {
      const raw = unb64u(this.f.code.slice(4));
      if (raw.length !== 32) throw new Error('Invalid code');
      const h = await sha(enc.encode('HAVEN-LINK-TOPIC-1'), raw);
      this.topic = 'haven_link_' + hex(h, 22);
      this.mailbox = hex(await sha(enc.encode('EYES-PUSH-1'), raw), 16);                     // the pair's push mailbox
      this.tag = hex(await sha(enc.encode('EYES-PUSH-TAG-1'), raw, enc.encode(st.myId)), 16);  // "this phone" within it
      this.key = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
    }
    async encrypt(obj) {
      const iv = randomBytes(12), ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128 }, this.key, enc.encode(JSON.stringify(obj))));
      const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12); return 'HL1.' + b64u(out);
    }
    async decrypt(str) {
      if (typeof str !== 'string' || str.length > 3000 || !str.startsWith('HL1.')) return null;
      let b; try { b = unb64u(str.slice(4)); } catch (e) { return null; }
      if (b.length < 29) return null;
      try { return JSON.parse(dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b.slice(0, 12), tagLength: 128 }, this.key, b.slice(12)))); } catch (e) { return null; }
    }
    async publish(obj, silent) {
      if (!this.key) return false;
      try {
        const r = await fetch(RELAY + this.topic + '?priority=min&firebase=no', { method: 'POST', body: await this.encrypt(obj), headers: { 'Content-Type': 'text/plain; charset=utf-8' }, cache: 'no-store' });
        if (!r.ok) throw new Error('rejected');
        return true;
      } catch (e) { if (!silent) emit('error', 'Your signal could not reach the relay'); return false; }
    }
    msg(kind) { return { v: 1, s: st.myId, k: kind, t: Date.now(), n: randomId(12) }; }
    since() { return this.f.cursor && Date.now() - (this.f.cursorAt || 0) < 11 * 3600000 ? this.f.cursor : '12h'; }
    start() {
      if (!this.key || this.active) return;
      this.active = true; const g = ++this.gen; this.setConn('connecting');
      this.listen(g);
      this.hello(true);
    }
    stop() { this.active = false; this.gen++; if (this.abort) { try { this.abort.abort(); } catch (e) {} this.abort = null; } this.setConn('sleeping'); }
    setConn(c) { if (this.connection !== c) { this.connection = c; emit('change', this.f); } }
    hello(force) {
      const now = Date.now();
      if (!force && now - this.lastHello < 120000) return;
      this.lastHello = now;
      this.publish(this.msg('hello'), true);
    }
    async listen(g) {
      while (this.active && g === this.gen) {
        const ctl = new AbortController(); this.abort = ctl;
        let idle; const kick = () => { clearTimeout(idle); idle = setTimeout(() => ctl.abort(), 75000); };
        try {
          kick();
          const r = await fetch(RELAY + this.topic + '/json?since=' + encodeURIComponent(this.since()), { signal: ctl.signal, cache: 'no-store', headers: { Accept: 'application/x-ndjson' } });
          if (!r.ok || !r.body) throw new Error('unavailable');
          if (g !== this.gen) return;
          this.retry = 0; this.setConn('online');
          const reader = r.body.getReader(); let buf = '';
          while (this.active && g === this.gen) {
            const { value, done } = await reader.read();
            if (done) break;
            kick(); buf += dec.decode(value, { stream: true });
            let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (line && line.length <= 4000) await this.line(line); }
          }
        } catch (e) { if (!this.active || g !== this.gen) return; this.setConn('offline'); }
        finally { clearTimeout(idle); }
        if (!this.active || g !== this.gen) return;
        this.retry = Math.min(6, this.retry + 1);
        await new Promise((res) => setTimeout(res, Math.min(30000, 800 * 2 ** this.retry)));
      }
    }
    async line(text) {
      let m; try { m = JSON.parse(text); } catch (e) { return; }
      if (m.event !== 'message') return;
      const f = this.f, id = m.id || '';
      if (id) { if (this.seen.includes(id)) return; this.seen.push(id); if (this.seen.length > 140) this.seen.shift(); f.cursor = id; f.cursorAt = Date.now(); save(); }
      const p = await this.decrypt(m.message || ''); if (!p || p.v !== 1) return;
      const now = Date.now(), age = Math.abs(now - (Number(p.t) || 0));
      if (age > 12 * 3600000) return;
      const s = typeof p.s === 'string' ? p.s : '', k = typeof p.k === 'string' ? p.k : '';
      if (s.length < 15 || s.length > 90 || s === st.myId) return;
      const isProfile = k === 'profile';
      if (!isProfile && !SIGNALS.includes(k)) return;
      if (isProfile && !f.peer) return;
      const n = typeof p.n === 'string' ? p.n : '';
      if (!/^[A-Za-z0-9_-]{16}$/.test(n) || f.nonces.includes(n)) return;
      f.nonces.push(n); if (f.nonces.length > 140) f.nonces.shift();
      if (f.peer && f.peer !== s) return;
      if (!f.peer) {                                   // the first other eye heard: they're our friend
        f.peer = s; f.pairedAt = now; save(true);
        emit('paired', f); this.publish(this.msg('hello'), true); this.lastHello = now;
        sendProfile(f, true);
      }
      if (age <= 180000) { const was = online(f); f.lastSeen = Math.max(f.lastSeen || 0, Number(p.t) || now); if (!was) emit('here', f); }
      if (isProfile) {
        if (typeof p.p === 'string' && enc.encode(p.p).length <= 1024) {
          try { const prof = root.HavenDNA ? root.HavenDNA.cleanProfile(JSON.parse(p.p)) : null; if (prof) { const first = !f.profile; f.profile = prof; save(); emit('profile', f, first); if (first) sendProfile(f, true); } } catch (e) {}
        }
        return;
      }
      if (k === 'hello') { save(); emit('change', f); return; }
      if (age > 600000) {                               // too old to play live: "while you were away"
        if (k !== 'resonance') { f.missed.push({ k, t: Number(p.t) }); f.missed = f.missed.slice(-12); save(); emit('missed', f); }
        return;
      }
      if (k === 'resonance') { if (now - this.lastResonance < 5500) return; this.lastResonance = now; return incoming(f, 'resonance'); }
      if (k === 'pulse') {
        // two open eyes: a pulse back within 30 s resonates (9 s otherwise, as on Android)
        const window = online(f) && document.visibilityState === 'visible' ? 30000 : 9000;
        const answer = now - this.lastSentPulse <= window && now - this.lastResonance > 6000;
        this.lastIncomingPulse = now;
        if (answer) { this.lastResonance = now; incoming(f, 'resonance'); this.publish(this.msg('resonance')); count(f, 'sent'); return; }
      }
      incoming(f, k);
    }
  }
  function online(f) { return !!f.lastSeen && Date.now() - f.lastSeen < 180000; }
  function count(f, what) { f.stats[what] = (f.stats[what] || 0) + 1; const wk = weekKey(); if (f.stats.weekOf !== wk) { f.stats.weekOf = wk; f.stats.wsent = 0; f.stats.wrecv = 0; } f.stats['w' + what] = (f.stats['w' + what] || 0) + 1; save(); }
  const weekKey = () => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
  function incoming(f, kind) {
    count(f, 'recv');
    if (kind === 'resonance') { f.stats.resonances = (f.stats.resonances || 0) + 1; if (!f.firsts.resonance) f.firsts.resonance = Date.now(); save(); }
    emit('incoming', f, kind);
  }

  // ---------- profiles ----------
  function sendProfile(f, force) {
    const ch = channels.get(f.code); if (!ch || !f.peer || !root.HavenDNA || !root.HavenDNA.has()) return;
    const json = JSON.stringify(root.HavenDNA.profile());
    if (enc.encode(json).length > 1024) return;
    const now = Date.now();
    if (!force && f.sentProfile === json && now - (f.sentProfileAt || 0) < 6 * 3600000) return;
    if (now - ch.lastProfile < 30000) { clearTimeout(ch.profileT); ch.profileT = setTimeout(() => sendProfile(f, force), 31000); return; }
    ch.lastProfile = now; f.sentProfile = json; f.sentProfileAt = now; save();
    ch.publish({ ...ch.msg('profile'), p: json }, true);
  }

  // ---------- the manager ----------
  async function open(f) {
    if (channels.has(f.code)) return channels.get(f.code);
    const ch = new Channel(f); await ch.init(); channels.set(f.code, ch);
    if (document.visibilityState === 'visible') ch.start();
    return ch;
  }
  function wakeAll() { channels.forEach((ch) => { if (!ch.active) ch.start(); else ch.hello(false); }); st.friends.forEach((f) => sendProfile(f, false)); }
  function sleepAll() { channels.forEach((ch) => ch.stop()); }
  document.addEventListener('visibilitychange', () => (document.visibilityState === 'visible' ? wakeAll() : sleepAll()));
  addEventListener('haven:dna', () => st.friends.forEach((f) => sendProfile(f, true)));

  const Friends = {
    on(name, f) { (listeners[name] = listeners[name] || []).push(f); },
    findCode, online,
    myId: () => st.myId,
    list: () => st.friends.slice(),
    native: () => st.native,
    channel: (f) => channels.get(f.code),
    connection: (f) => { const ch = channels.get(f.code); return ch ? ch.connection : 'off'; },
    async restore() { for (const f of st.friends) { try { await open(f); } catch (e) {} } emit('change'); },
    async invite() {                                   // a new code waiting for someone to open it
      const code = 'HL1-' + b64u(randomBytes(32));
      const f = { code, peer: null, cursor: null, cursorAt: 0, nonces: [], missed: [], profile: null, addedAt: Date.now(), stats: {}, firsts: {} };
      st.friends.push(f); save(true); await open(f); emit('change', f); return f;
    },
    async join(text) {
      const code = findCode(text);
      if (!code) throw new Error("That isn't an Eye Contact code");
      if (st.friends.some((f) => f.code === code)) throw new Error("You're already linked with that code");
      if (root.EYES_NATIVE_CODE && root.EYES_NATIVE_CODE === code) throw new Error("That's your existing Eye Contact");
      const f = { code, peer: null, cursor: null, cursorAt: 0, nonces: [], missed: [], profile: null, addedAt: Date.now(), stats: {}, firsts: {}, joined: true };
      st.friends.push(f); save(true); await open(f); emit('change', f); return f;
    },
    send(f, kind) {
      const ch = channels.get(f.code); if (!ch || !f.peer || !['pulse', 'spark', 'calm'].includes(kind)) return false;
      const now = Date.now(); if (now - ch.lastSend < 1900) return false;
      ch.lastSend = now;
      if (kind === 'pulse') ch.lastSentPulse = now;
      ch.publish(ch.msg(kind)); count(f, 'sent');
      emit('outgoing', f, kind);
      const window = online(f) ? 30000 : 9000;
      if (kind === 'pulse' && now - ch.lastIncomingPulse < window && now - ch.lastResonance > 6000) {
        ch.lastResonance = now; ch.publish(ch.msg('resonance')); incoming(f, 'resonance');
      }
      if (!online(f) && root.EyesPush) root.EyesPush.nudge(ch.mailbox, ch.tag, kind);
      return true;
    },
    sendAll(kind) { let any = false; st.friends.forEach((f) => { if (f.peer) any = Friends.send(f, kind) || any; }); return any; },
    rename(f, nick) { f.nick = String(nick || '').trim().slice(0, 24) || undefined; save(); emit('change', f); },
    remove(f) {
      const ch = channels.get(f.code); if (ch) { ch.stop(); channels.delete(f.code); if (root.EyesPush) root.EyesPush.forget(ch.mailbox, ch.tag); }
      st.friends = st.friends.filter((x) => x !== f); save(true); emit('change'); emit('removed', f);
    },
    clearMissed(f) { f.missed = []; save(); },
    // the Android native link's history (its signals are counted from the launcher)
    countNative(what, kind) {
      const n = st.native; n.stats = n.stats || {}; n.firsts = n.firsts || {};
      n.stats[what] = (n.stats[what] || 0) + 1;
      if (kind === 'resonance') { n.stats.resonances = (n.stats.resonances || 0) + 1; if (!n.firsts.resonance) n.firsts.resonance = Date.now(); }
      if (!n.since) n.since = Date.now();
      save();
    },
    _debug: { channels, st: () => st }
  };
  root.EyesFriends = Friends;
})(window);

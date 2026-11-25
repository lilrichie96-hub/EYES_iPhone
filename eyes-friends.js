/* EYES 4.0 · Friends: many linked eyes.
   Each friend is one Eye Contact channel on the protocol decoded from Android's native HavenLink
   (HL1 code → AES-256-GCM, topic on ntfy.sh, {v,s,k,t,n} messages; see eyes-link notes in the README).
   - On Android the native link (if any) stays exactly as it was and shows up here as one friend;
     every new friend runs in this file. On iPhone every friend runs here (1.x's single link is migrated).
   - Presence: opening EYES says a silent "hello" to every friend (at most every 2 min). A hello means
     "I'm here now", so you can see who's awake and a pulse between two open eyes becomes resonance.
   - History per friend: when you met, signals traded, first resonance.
   - Notifications: after a signal to a friend who isn't open right now, a contentless nudge goes to the
     push relay (eyes-push.js).
   4.1 (Eye Contact 2.0), additive only:
   - hello carries `c`: the capabilities this phone understands (['ack'] for now). Older phones and the
     Android native link parse with optString/JSON and ignore extra fields, so nothing changes for them.
   - New kinds are only ever sent to a peer that advertised them. 'ack' {r: nonce, a: 'live'|'later'}
     tells the sender their signal was actually played on the other phone (live, or later on return).
   - Each sent signal is tracked: sending → relayed (ntfy accepted it) / failed → felt (an ack came back).
     The UI never shows more than the protocol knows.
   4.2 (Battle Lite), additive only:
   - hello's `c` also carries 'duel'. Kind 'duel' {d: {o: ask|yes|no|cancel|mv|bye, id, …}} is only ever sent
     to a peer that advertised it, is only played live (≤ 90 s old) and never counts as a signal: no stats,
     no "while you were away", no ack, no push. eyes-duel.js owns everything inside `d`.
   4.2.2 (Foundation), additive only:
   - Presence ('presence' cap). A hello may carry q:1 ("are you there?"); an open 4.2.2 Eye answers with one
     plain hello (at most every 15 s). Kind 'away' says "I just closed EYES"; it is only sent to a peer we were
     actively in touch with in the last 10 minutes, so a launcher that hides 100 times a day stays quiet.
     presence(f) is 'online' | 'offline' | 'unknown', and only ever reports what was observed.
     No heartbeats, no background polling.
   - Upgraded friendships. The original native Android link (and any friend whose Eye never advertised
     capabilities) gets a companion channel whose 32-byte secret is SHA-256('EYES-UPGRADE-1' ‖ original
     secret). Only the two phones that already share the original secret can derive it, nothing new is
     exchanged, and the original link is never touched. The companion carries only hello/profile/ack/
     presence/duel, never signals, and is never listed as a separate friend.
   - Reconnection: the browser's 'online' event wakes any channel that is waiting out a retry.
   4.4 (Distant Connections), additive only:
   - Waiting signals. A signal that is older than 90 s when it arrives was sent while this Eye wasn't
     listening (ntfy keeps it for 12 h). It is no longer played as if it were live: it is listed under
     "while you were away" (now with its nonce) and announced as 'waiting', so eyes-visits.js can turn it
     into a Distant Visit when the owner is actually free. Its 'later' ack is sent only once the visit (or
     the Meeting Space replay) has actually shown it: Friends.felt(f, nonces). Without eyes-visits.js the
     4.3 behaviour (ack on arrival) is kept.
   - presence(f).tier: 'online' (heard in the last 90 s: confirmed available) | 'recent' (heard in the last
     30 min, nothing newer) | 'offline' | 'unknown'. presence(f).state is unchanged for older callers.
     'here' is only announced for a message that is itself fresh (≤ 60 s), never for a replayed hello.
   - Mirror ('mirror' cap): kind 'mirror' {m: {o, id, …}} is live only (≤ 90 s), never a signal (no stats,
     no ack, no push, no "while you were away") and only sent to a peer that advertised it, directly or
     through the upgraded companion. eyes-mirror.js owns everything inside `m`. */
'use strict';
(function (root) {
  const RELAY = 'https://ntfy.sh/';
  const KEY = 'eyes.friends.v1';
  const SIGNALS = ['pulse', 'spark', 'calm', 'resonance', 'hello'];
  // 4.5: 'mirror' is no longer advertised (Mirror became Hangout); 'hangout' is.
  const CAPS = ['ack', 'duel', 'presence', 'duel2', 'hangout'];   // what this phone understands beyond the original protocol
  const EXTRA = ['ack', 'duel', 'away', 'mirror', 'hangout'];               // kinds that only go to peers that advertised them
  const PRESENCE_MS = 180000, PROBE_WAIT_MS = 12000, ENGAGED_MS = 600000, MAX_COMPANIONS = 6;
  const COMPANION_KINDS = ['hello', 'profile', 'ack', 'duel', 'away', 'mirror', 'hangout'];
  const LIVE_MS = 90000, CONFIRMED_MS = 90000, RECENT_MS = 30 * 60000, HERE_MS = 60000;
  const capOk = (x) => typeof x === 'string' && /^[a-z0-9]{1,12}$/.test(x);
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
    if (!Array.isArray(s.upgrades)) s.upgrades = [];
    s.upgrades = s.upgrades.filter((c) => c && typeof c.code === 'string' && CODE_RE.test(c.code) && typeof c.parent === 'string');
    s.upgrades.forEach((c) => { c.companion = true; c.stats = c.stats || {}; c.firsts = c.firsts || {}; c.nonces = c.nonces || []; c.missed = []; });
    s.friends.forEach((f) => {
      f.stats = f.stats || {}; f.firsts = f.firsts || {}; f.nonces = f.nonces || []; f.missed = f.missed || [];
      // a send still in flight when EYES closed: we don't know if the relay took it
      if (Array.isArray(f.outbox)) f.outbox.forEach((e) => { if (e.st === 'sending') e.st = 'unknown'; });
    });
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
    constructor(f) { this.f = f; this.key = null; this.topic = null; this.active = false; this.gen = 0; this.abort = null; this.retry = 0; this.connection = 'off'; this.seen = []; this.lastSend = 0; this.lastSentPulse = 0; this.lastIncomingPulse = 0; this.lastResonance = 0; this.lastProfile = 0; this.lastHello = 0;
      this.onlineSince = 0; this.probeAt = 0; this.lastAnswer = 0; this.engagedUntil = 0; this.wakeWait = null; }
    engage() { this.engagedUntil = Date.now() + ENGAGED_MS; }
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
    // 2.5.0: respect relay throttling instead of repeatedly trying and displaying misleading delivery.
    retryAfter(response) {
      const v = response.headers?.get('Retry-After');
      if (!v) return 30000;
      const seconds = Number(v);
      const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(v) - Date.now();
      return Number.isFinite(delay) ? Math.max(5000, Math.min(300000, delay)) : 30000;
    }
    async publish(obj, silent, keepalive) {
      if (!this.key) return false;
      if ((this.relayBlockedUntil || 0) > Date.now()) {
        if (!silent) emit('error','Eye Contact relay is cooling down. Try again shortly.');
        return false;
      }
      const ctl = typeof AbortController === 'function' ? new AbortController() : null, stall = ctl ? setTimeout(() => ctl.abort(), 15000) : 0;
      try {
        const r = await fetch(RELAY + this.topic + '?priority=min&firebase=no', {
          method:'POST',body:await this.encrypt(obj),
          headers:{'Content-Type':'text/plain; charset=utf-8'},
          cache:'no-store',keepalive:!!keepalive,signal:ctl ? ctl.signal : undefined
        });
        if(r.status===429) {
          this.relayBlockedUntil=Date.now()+this.retryAfter(r);
          if(!silent) emit('error','Eye Contact relay is rate-limiting. Your signal was not sent. Retry later.');
          return false;
        }
        if(!r.ok) throw new Error('Relay HTTP '+r.status);
        this.relayBlockedUntil=0;
        return true;
      } catch(e) {
        if(!silent)emit('error','Your signal could not reach the relay');
        return false;
      } finally { clearTimeout(stall); }
    }
    msg(kind) { return { v: 1, s: st.myId, k: kind, t: Date.now(), n: randomId(12) }; }
    since() { return this.f.cursor && Date.now() - (this.f.cursorAt || 0) < 11 * 3600000 ? this.f.cursor : '12h'; }
    start() {
      if (!this.key || this.active) return;
      this.active = true; const g = ++this.gen; this.setConn('connecting');
      this.listen(g);
      this.hello(true);
      // Re-announce on reopening: a first introduction can be lost while either phone sleeps.
      if (this.f.peer) sendProfile(this.f, false);
    }
    stop() { this.active = false; this.gen++; clearTimeout(this.profileT); if (this.abort) { try { this.abort.abort(); } catch (e) {} this.abort = null; } this.wakeNow(); this.setConn('sleeping'); }
    setConn(c) {
      if (this.connection === c) return;
      this.connection = c;
      this.onlineSince = c === 'online' ? Date.now() : 0;
      emitFor(this.f, 'change');
    }
    // 4.2.2: a retry that is waiting can be cut short (network came back, or the user asked)
    wakeNow() { const w = this.wakeWait; this.wakeWait = null; if (w) w(); }
    hello(force) {
      const now = Date.now();
      if (!force && now - this.lastHello < 120000) return;
      this.lastHello = now;
      this.announce();
    }
    // 4.2.2 presence: "are you there?" Only a peer that advertised 'presence' answers, so for older
    // EYES this is just an ordinary hello and presence stays 'unknown' rather than guessing.
    probe() {
      const now = Date.now();
      if (!this.f.peer || now - this.probeAt < 30000) return false;
      this.probeAt = now; this.lastHello = now; this.engage();
      this.publish({ ...this.msg('hello'), c: CAPS, q: 1 }, true);
      return true;
    }
    away() {
      if (!this.f.peer || !supportsDirect(this.f, 'presence') || Date.now() > this.engagedUntil) return;
      this.engagedUntil = 0;
      this.publish(this.msg('away'), true, true);
    }
    announce() {                                       // a hello that says what we understand
      return this.publish({ ...this.msg('hello'), c: CAPS }, true).then((ok) => {
        if (ok && !this.f.announcedAt) { this.f.announcedAt = Date.now(); save(); emitFor(this.f, 'change'); }
        return ok;
      });
    }
    ack(n, late) {                                     // "your signal reached my Eye"
      if (!supports(this.f, 'ack') || !/^[A-Za-z0-9_-]{16}$/.test(n)) return;
      this.publish({ ...this.msg('ack'), r: n, a: late ? 'later' : 'live' }, true);
    }
    async listen(g) {
      while (this.active && g === this.gen) {
        const ctl = new AbortController(); this.abort = ctl;
        let idle; const kick = () => { clearTimeout(idle); idle = setTimeout(() => ctl.abort(), 75000); };
        try {
          kick();
          const r = await fetch(RELAY + this.topic + '/json?since=' + encodeURIComponent(this.since()), { signal: ctl.signal, cache: 'no-store', headers: { Accept: 'application/x-ndjson' } });
          if (r.status === 429) this.relayBlockedUntil = Date.now() + this.retryAfter(r);
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
        await new Promise((res) => { const t = setTimeout(() => { this.wakeWait = null; res(); }, Math.max(Math.min(30000, 800 * 2 ** this.retry), Math.max(0, (this.relayBlockedUntil || 0) - Date.now()))); this.wakeWait = () => { clearTimeout(t); res(); }; });
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
      if (!isProfile && !SIGNALS.includes(k) && !EXTRA.includes(k)) return;
      if (f.companion && !COMPANION_KINDS.includes(k)) return;       // companions never carry signals
      if ((isProfile || EXTRA.includes(k)) && !f.peer) return;
      const n = typeof p.n === 'string' ? p.n : '';
      if (!/^[A-Za-z0-9_-]{16}$/.test(n) || f.nonces.includes(n)) return;
      f.nonces.push(n); if (f.nonces.length > 140) f.nonces.shift();
      if (f.peer && f.peer !== s) return;
      if (!f.peer) {                                   // the first other eye heard: they're our friend
        f.peer = s; f.pairedAt = now; save(true);
        if (f.companion) emitFor(f, 'change', 'upgraded'); else emit('paired', f);
        this.announce(); this.lastHello = now;
        sendProfile(f, true);
      }
      if (Array.isArray(p.c)) {                        // what their EYES understands (newer phones only)
        const caps = p.c.filter(capOk).slice(0, 16);
        if (JSON.stringify(caps) !== JSON.stringify(f.caps || [])) { f.caps = caps; save(); emitFor(f, 'change'); if (!f.companion) syncCompanions(); }
      } else if (k === 'hello' && !f.companion && !Array.isArray(f.caps) && !f.legacyPeer) {
        // a hello without capabilities: the original native link or a very old EYES on the other side
        f.legacyPeer = true; save(); syncCompanions();
      }
      if (k === 'ack') {
        const r = typeof p.r === 'string' ? p.r : '', e = (f.outbox || []).find((x) => x.n === r);
        if (e && !e.felt) { e.felt = p.a === 'later' ? 'later' : 'live'; e.feltAt = now; save(); emit('delivery', f, e); }
        return;
      }
      if (k === 'away') {                              // 4.2.2: they closed EYES (only ever a statement they made)
        const at = Math.min(now, Number(p.t) || now);
        if (at >= (f.lastSeen || 0)) { f.awayAt = at; save(); emitFor(f, 'change'); }
        return;
      }
      if (age <= PRESENCE_MS) {
        const was = online(f), heard = Math.min(now, Number(p.t) || now);
        f.lastSeen = Math.max(f.lastSeen || 0, heard);
        if (f.awayAt && f.awayAt <= f.lastSeen) f.awayAt = 0;
        if (age <= 60000) this.lastHeardAt = now;
        // 4.4: a replayed hello from minutes ago is not "here"
        if (!was && !f.companion && age <= HERE_MS) emit('here', f);
        else if (!was) emitFor(f, 'change');
      }
      if (k === 'duel') {                              // 4.2 Battle Lite: live only, never a signal
        if (age <= 90000 && p.d && typeof p.d === 'object' && !Array.isArray(p.d)) { this.engage(); emitFor(f, 'duel', p.d, Number(p.t) || now); }
        return;
      }
      if (k === 'hangout') {                           // 4.5 Hangout: live only, never a signal
        if (age <= 90000 && p.h && typeof p.h === 'object' && !Array.isArray(p.h)) { this.engage(); emitFor(f, 'hangout', p.h, Number(p.t) || now); }
        return;
      }
      if (k === 'mirror') {                            // 4.4 Mirror (older phones): still heard, so it can be answered politely
        if (age <= 90000 && p.m && typeof p.m === 'object' && !Array.isArray(p.m)) { this.engage(); emitFor(f, 'mirror', p.m, Number(p.t) || now); }
        return;
      }
      if (isProfile) {
        if (typeof p.p === 'string' && enc.encode(p.p).length <= 1024) {
          try {
            const prof = root.HavenDNA ? root.HavenDNA.cleanProfile(JSON.parse(p.p)) : null;
            if (prof) { const first = !f.profile; f.profile = prof; save(); if (f.companion) emitFor(f, 'change'); else emit('profile', f, first); if (first) sendProfile(f, true); }
          } catch (e) {}
        }
        return;
      }
      if (k === 'hello') {
        // "are you there?" from an Eye that is open right now: answer once, briefly, if we are open too
        if (p.q === 1 && age <= 60000 && document.visibilityState === 'visible' && now - this.lastAnswer > 15000) {
          this.lastAnswer = now; this.engage(); this.lastHello = now; this.announce();
        }
        save(); emitFor(f, 'change'); sendProfile(f, true); return;
      }
      // 4.4: anything sent while this Eye wasn't listening waits for its owner (a Distant Visit, eyes-visits.js).
      // Without the visits module the 4.3 rule stands: up to 10 min old still plays live.
      if (age > (root.EyesVisits ? LIVE_MS : 600000)) {   // too old to play live: "while you were away"
        if (k !== 'resonance') {
          const w = { k, t: Math.min(now, Number(p.t) || now), n };
          f.missed.push(w); f.missed = f.missed.slice(-12);
          if (root.EyesVisits) count(f, 'recv');          // it did reach this Eye; it just hasn't been seen yet
          save(); emit('missed', f);
          if (root.EyesVisits) emit('waiting', f, w); else this.ack(n, true);
        }
        return;
      }
      this.engage();
      if (k === 'resonance') { if (now - this.lastResonance < 5500) return; this.lastResonance = now; return incoming(f, 'resonance'); }
      if (k === 'pulse') {
        // two open eyes: a pulse back within 30 s resonates (9 s otherwise, as on Android)
        const window = online(f) && document.visibilityState === 'visible' ? 30000 : 9000;
        const answer = now - this.lastSentPulse <= window && now - this.lastResonance > 6000;
        this.lastIncomingPulse = now;
        if (answer) { this.lastResonance = now; this.ack(n, false); incoming(f, 'resonance'); this.publish(this.msg('resonance')); count(f, 'sent'); return; }
      }
      if (k !== 'resonance') this.ack(n, false);
      incoming(f, k);
    }
  }
  function supportsDirect(f, cap) { return !!(f && Array.isArray(f.caps) && f.caps.includes(cap)); }
  // A friend supports a capability directly, or through its upgraded companion channel.
  function supports(f, cap) {
    if (supportsDirect(f, cap)) return true;
    const c = f && !f.companion ? companionFor(f.code) : null;
    return !!(c && c.peer && supportsDirect(c, cap));
  }

  // ---------- 4.2.2 upgraded friendships (companion channels) ----------
  const companionFor = (parent) => st.upgrades.find((c) => c.parent === parent) || null;
  const parentOf = (c) => (c && c.companion ? (c.parent === 'native' ? null : st.friends.find((f) => f.code === c.parent) || null) : c);
  // Events about a companion are reported as its friend (a native companion stands for the native link).
  function emitFor(f, name, ...a) {
    if (!f || !f.companion) return emit(name, f, ...a);
    const p = parentOf(f);
    if (name === 'duel') return emit('duel', p || f, ...a);
    emit(name, p || f, ...a);
  }
  async function deriveUpgrade(code) {
    const raw = unb64u(code.slice(4)); if (raw.length !== 32) throw new Error('Invalid code');
    return 'HL1-' + b64u(await sha(enc.encode('EYES-UPGRADE-1'), raw));
  }
  async function srcTag(code) { return hex(await sha(enc.encode('EYES-UPGRADE-SRC-1'), unb64u(code.slice(4))), 12); }
  let nativeCode = null;
  // Which friendships need a companion: the native link, and friends whose Eye never advertised anything.
  function wantsCompanion(f) { return !!(f && f.peer && !Array.isArray(f.caps) && f.legacyPeer); }
  let syncing = Promise.resolve();
  function syncCompanions() { syncing = syncing.then(syncNow, syncNow); return syncing; }
  async function syncNow() {
    const want = [];
    if (nativeCode) want.push({ parent: 'native', code: nativeCode });
    st.friends.filter(wantsCompanion).forEach((f) => want.push({ parent: f.code, code: f.code }));
    let changed = false;
    // a parent that no longer needs one (gone, or now understands duels itself) lets its companion rest
    for (const c of st.upgrades.slice()) {
      const parentGone = c.parent === 'native' ? !nativeCode : !st.friends.some((f) => f.code === c.parent);
      const parentF = c.parent === 'native' ? null : st.friends.find((f) => f.code === c.parent);
      if (parentGone) { closeChannel(c); st.upgrades = st.upgrades.filter((x) => x !== c); changed = true; continue; }
      if (parentF && supportsDirect(parentF, 'duel')) closeChannel(c);
    }
    for (const w of want.slice(0, MAX_COMPANIONS)) {
      let c = companionFor(w.parent);
      const src = await srcTag(w.code).catch(() => null); if (!src) continue;
      if (c && c.src !== src) { closeChannel(c); st.upgrades = st.upgrades.filter((x) => x !== c); c = null; changed = true; }   // relinked natively
      if (!c) {
        c = { companion: true, parent: w.parent, src, code: await deriveUpgrade(w.code), peer: null, cursor: null, cursorAt: 0, nonces: [], missed: [], profile: null, addedAt: Date.now(), stats: {}, firsts: {} };
        st.upgrades.push(c); changed = true;
      }
      try { await open(c); } catch (e) {}
    }
    if (changed) { save(true); emit('change'); }
  }
  function closeChannel(f) { const ch = channels.get(f.code); if (ch) { ch.stop(); channels.delete(f.code); } }

  // ---------- 4.2.2 presence: only what was observed ----------
  //  online  : heard from them in the last 3 minutes, and they haven't said they left
  //  offline : they told us they closed EYES, or they understand probes and didn't answer one while we listened
  //  unknown : everything else (we're not connected, they're on older EYES, or nothing was asked yet)
  function presence(f) {
    const p = presence0(f), now = Date.now();
    // 4.4: how sure we are, in four honest tiers (state stays exactly as it was for older callers)
    p.tier = p.state === 'online' ? (now - p.lastSeen <= CONFIRMED_MS ? 'online' : 'recent')
      : p.state === 'offline' ? 'offline'
        : p.lastSeen && now - p.lastSeen < RECENT_MS && p.why !== 'not-paired' ? 'recent' : 'unknown';
    return p;
  }
  function presence0(f) {
    if (!f || !f.peer) {
      const c0 = f && !f.companion ? companionFor(f.code) : null;
      if (!c0 || !c0.peer) return { state: 'unknown', why: 'not-paired', lastSeen: 0 };
    }
    const c = f && !f.companion ? companionFor(f.code) : null;
    const views = [f, c && c.peer ? c : null].filter((x) => x && x.peer);
    const lastSeen = Math.max(0, ...views.map((x) => x.lastSeen || 0)), awayAt = Math.max(0, ...views.map((x) => x.awayAt || 0));
    const now = Date.now();
    if (awayAt && awayAt >= lastSeen && now - awayAt < 12 * 3600000) return { state: 'offline', why: 'closed', lastSeen, since: awayAt };
    if (lastSeen && now - lastSeen < PRESENCE_MS) return { state: 'online', why: 'heard', lastSeen };
    const chans = views.map((x) => channels.get(x.code)).filter(Boolean);
    const listening = chans.filter((ch) => ch.connection === 'online');
    if (!listening.length) return { state: 'unknown', why: chans.some((ch) => ch.connection === 'offline') ? 'relay' : 'not-listening', lastSeen };
    const asked = listening.find((ch) => supportsDirect(ch.f, 'presence') && ch.probeAt && ch.onlineSince && ch.onlineSince <= ch.probeAt && now - ch.probeAt >= PROBE_WAIT_MS && now - ch.probeAt < PRESENCE_MS && !((ch.lastHeardAt || 0) >= ch.probeAt));
    if (asked) return { state: 'offline', why: 'no-answer', lastSeen, since: asked.probeAt };
    const waiting = listening.find((ch) => supportsDirect(ch.f, 'presence') && ch.probeAt && now - ch.probeAt < PROBE_WAIT_MS);
    if (waiting) return { state: 'unknown', why: 'asking', lastSeen };
    return { state: 'unknown', why: views.some((x) => supportsDirect(x, 'presence')) ? 'not-asked' : 'older', lastSeen };
  }
  function probe(f) {
    if (!f) return false;
    let any = false;
    [f, !f.companion ? companionFor(f.code) : null].forEach((x) => {
      const ch = x && x.peer && channels.get(x.code);
      if (!ch) return;
      if (!ch.active && document.visibilityState === 'visible') ch.start();
      if (ch.probe()) any = true;
    });
    if (any) setTimeout(() => emitFor(f, 'change'), PROBE_WAIT_MS + 200);
    return any;
  }
  // Where a pairing really is. Every step is something this phone has actually observed.
  function stage(f) {
    const ch = channels.get(f.code), listening = !!ch && ch.connection === 'online';
    const steps = [
      { id: 'send', label: f.joined ? 'Sending your invitation' : 'Invite ready to share', done: f.joined ? !!f.announcedAt || !!f.peer : true },
      { id: 'listen', label: 'Listening for their Eye', done: listening || !!f.peer },
      { id: 'notice', label: 'Your Eyes found each other', done: !!f.peer },
      { id: 'swap', label: 'Exchanging identities', done: !!f.peer && !!f.profile && !!f.sentProfileAt },
      { id: 'made', label: 'Eye Contact made', done: !!f.peer && !!f.profile && !!f.sentProfileAt }
    ];
    let at = steps.findIndex((x) => !x.done); if (at < 0) at = steps.length;
    return { steps, at, done: at >= steps.length, trouble: !!ch && ch.connection === 'offline' };
  }
  function online(f) { return !!f && presence(f).state === 'online'; }
  function count(f, what) { f.stats[what] = (f.stats[what] || 0) + 1; const wk = weekKey(); if (f.stats.weekOf !== wk) { f.stats.weekOf = wk; f.stats.wsent = 0; f.stats.wrecv = 0; } f.stats['w' + what] = (f.stats['w' + what] || 0) + 1; save(); }
  const weekKey = () => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
  function incoming(f, kind) {
    count(f, 'recv');
    if (kind === 'resonance') { f.stats.resonances = (f.stats.resonances || 0) + 1; if (!f.firsts.resonance) f.firsts.resonance = Date.now(); save(); }
    emit('incoming', f, kind);
  }

  // ---------- profiles ----------
  function sendProfile(f, force) {
    const ch = channels.get(f.code); if (!ch || !ch.active || !f.peer || !root.HavenDNA || !root.HavenDNA.has()) return;
    const own = root.HavenDNA.profile(); if (!own) return;
    const json = JSON.stringify(own);
    if (enc.encode(json).length > 1024) return;
    const now = Date.now();
    // A profile is not reliably delivered merely because it was POSTed once.
    // Re-introduce on the other phone's hello, limited to once per 20 seconds.
    if (!force && f.sentProfile === json && now - (f.sentProfileAt || 0) < 5 * 60000) return;
    if (ch.profileSending) return;
    const delay = 20000 - (now - ch.lastProfile);
    if (delay > 0) {
      clearTimeout(ch.profileT);
      ch.profileT = setTimeout(() => sendProfile(f, force), delay + 25);
      return;
    }
    clearTimeout(ch.profileT);
    ch.lastProfile = now;
    ch.profileSending = true;
    ch.publish({ ...ch.msg('profile'), p: json }, true).then((delivered) => {
      ch.profileSending = false;
      if (delivered) {
        f.sentProfile = json;
        f.sentProfileAt = Date.now();
        save();
      } else if (ch.active) {
        // Do not mark a failed send as delivered. Retry while the app remains open.
        clearTimeout(ch.profileT);
        ch.profileT = setTimeout(() => sendProfile(f, true), 20000);
      }
    }, () => {
      ch.profileSending = false;
      if (ch.active) {
        clearTimeout(ch.profileT);
        ch.profileT = setTimeout(() => sendProfile(f, true), 20000);
      }
    });
  }

  // ---------- the manager ----------
  async function open(f) {
    if (channels.has(f.code)) return channels.get(f.code);
    const ch = new Channel(f); await ch.init(); channels.set(f.code, ch);
    if (document.visibilityState === 'visible') ch.start();
    return ch;
  }
  function wakeAll() { channels.forEach((ch) => { if (!ch.active) ch.start(); else ch.hello(false); }); st.friends.forEach((f) => sendProfile(f, false)); }
  function sleepAll() { channels.forEach((ch) => { ch.away(); ch.stop(); }); }
  document.addEventListener('visibilitychange', () => (document.visibilityState === 'visible' ? wakeAll() : sleepAll()));
  // 4.4: an iPhone Home Screen app restored from the back-forward cache may not report a visibility change
  addEventListener('pageshow', (e) => { if (e && e.persisted && document.visibilityState === 'visible') wakeAll(); });
  // 4.2.2: the network came back: stop waiting out the retry and listen again right away
  addEventListener('online', () => channels.forEach((ch) => { if (ch.active && ch.connection !== 'online') { ch.retry = 0; ch.wakeNow(); } }));
  addEventListener('offline', () => channels.forEach((ch) => { if (ch.active) ch.setConn('offline'); }));
  addEventListener('haven:dna', () => st.friends.forEach((f) => sendProfile(f, true)));

  const Friends = {
    on(name, f) { (listeners[name] = listeners[name] || []).push(f); },
    findCode, online, supports, supportsDirect, stage, CAPS, presence, probe,
    outbox: (f) => (f.outbox || []).slice(),
    myId: () => st.myId,
    list: () => st.friends.slice(),
    native: () => st.native,
    channel: (f) => channels.get(f.code),
    refreshProfile(f) {
      const ch = channels.get(f && f.code);
      if (!ch || !f.peer) return false;
      // Both phones can safely ask for a re-introduction without breaking a pairing.
      if (!ch.active && document.visibilityState === 'visible') ch.start();
      ch.hello(true);
      sendProfile(f, true);
      return true;
    },
    // the best connection this phone has to that friend (their own channel, or its upgraded companion)
    connection: (f) => {
      const rank = { online: 3, connecting: 2, offline: 1, sleeping: 0, off: 0 };
      const list = [f, f && !f.companion ? companionFor(f.code) : null].filter(Boolean).map((x) => { const ch = channels.get(x.code); return ch ? ch.connection : 'off'; });
      return list.sort((a, b) => (rank[b] || 0) - (rank[a] || 0))[0] || 'off';
    },
    byCode: (code) => st.friends.find((f) => f.code === code) || st.upgrades.find((c) => c.code === code) || null,
    // 4.2.2 upgraded friendships
    upgradeFor: (f) => (f && !f.companion ? companionFor(f.code) : null),
    nativeUpgrade: () => companionFor('native'),
    async upgradeNative(code) {                        // the launcher told us the native link's secret (never stored here)
      if (typeof code !== 'string' || !CODE_RE.test(code) || code.length !== 47) { nativeCode = null; return syncCompanions(); }
      nativeCode = code; return syncCompanions();
    },
    upgradeState(f) {                                  // plain-words status of an upgrade, for the UI
      const c = f === 'native' ? companionFor('native') : f && !f.companion ? companionFor(f.code) : null;
      if (f !== 'native' && supportsDirect(f, 'duel')) return { id: 'direct' };
      if (!c) return { id: 'none' };
      if (!c.peer) return { id: 'waiting', since: c.addedAt };
      if (!supportsDirect(c, 'duel')) return { id: 'partial' };
      return { id: 'ready', since: c.pairedAt };
    },
    reconnect(f) {                                     // "Reconnect now": a fresh listen + hello, same pairing
      let any = false;
      [f, f && !f.companion ? companionFor(f.code) : null].forEach((x) => {
        const ch = x && channels.get(x.code); if (!ch) return;
        ch.stop(); ch.retry = 0; any = true;
        if (document.visibilityState === 'visible') ch.start();
      });
      return any;
    },
    async restore() { for (const f of st.friends) { try { await open(f); } catch (e) {} } await syncCompanions(); emit('change'); },
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
      ch.lastSend = now; ch.engage();
      if (kind === 'pulse') ch.lastSentPulse = now;
      const m = ch.msg(kind), e = { n: m.n, k: kind, t: now, st: 'sending', awake: online(f), canFeel: supports(f, 'ack') };
      f.outbox = (f.outbox || []).concat(e).slice(-8);
      ch.publish(m).then((ok) => { e.st = ok ? 'relayed' : 'failed'; save(); emit('delivery', f, e); });
      count(f, 'sent');
      emit('outgoing', f, kind, e);
      const window = online(f) ? 30000 : 9000;
      if (kind === 'pulse' && now - ch.lastIncomingPulse < window && now - ch.lastResonance > 6000) {
        ch.lastResonance = now; ch.publish(ch.msg('resonance')); incoming(f, 'resonance');
      }
      if (!online(f) && root.EyesPush) root.EyesPush.nudge(ch.mailbox, ch.tag, kind);
      return e;
    },
    // 4.2 Battle Lite: a duel message, only to a peer that understands it. Resolves true when the relay took it.
    // 4.2.2: goes through the upgraded companion when the friendship itself can't carry duels.
    duel(f, d) {
      if (!f || !d || typeof d !== 'object' || JSON.stringify(d).length > 600) return Promise.resolve(false);
      const via = supportsDirect(f, 'duel') ? f : !f.companion ? companionFor(f.code) : null;
      const ch = via && channels.get(via.code);
      if (!ch || !via.peer || !supportsDirect(via, 'duel')) return Promise.resolve(false);
      if (!ch.active && document.visibilityState === 'visible') ch.start();
      ch.engage();
      return ch.publish({ ...ch.msg('duel'), d }, true);
    },
    // 4.4 Mirror: same routing as duels (direct, or through the upgraded companion). Resolves true when the relay took it.
    mirror(f, m) {
      if (!f || !m || typeof m !== 'object' || JSON.stringify(m).length > 600) return Promise.resolve(false);
      const via = supportsDirect(f, 'mirror') ? f : !f.companion ? companionFor(f.code) : null;
      const ch = via && channels.get(via.code);
      if (!ch || !via.peer || !supportsDirect(via, 'mirror')) return Promise.resolve(false);
      if (!ch.active && document.visibilityState === 'visible') ch.start();
      ch.engage();
      return ch.publish({ ...ch.msg('mirror'), m }, true, m.o === 'bye');
    },
    // 4.5 Hangout: same routing as Mirror had (direct, or through the upgraded companion). Resolves true when the relay took it.
    hangout(f, h) {
      if (!f || !h || typeof h !== 'object' || JSON.stringify(h).length > 600) return Promise.resolve(false);
      const via = supportsDirect(f, 'hangout') ? f : !f.companion ? companionFor(f.code) : null;
      const ch = via && channels.get(via.code);
      if (!ch || !via.peer || !supportsDirect(via, 'hangout')) return Promise.resolve(false);
      if (!ch.active && document.visibilityState === 'visible') ch.start();
      ch.engage();
      return ch.publish({ ...ch.msg('hangout'), h }, true, h.o === 'bye' || h.o === 'away');
    },
    hangoutVia: (f) => (supportsDirect(f, 'hangout') ? f : f && !f.companion && supportsDirect(companionFor(f.code), 'hangout') ? companionFor(f.code) : null),
    mirrorVia: (f) => (supportsDirect(f, 'mirror') ? f : f && !f.companion && supportsDirect(companionFor(f.code), 'mirror') ? companionFor(f.code) : null),
    // 4.4: the owner has now actually seen these waiting signals: tell the sender ('later' ack, newer phones only)
    felt(f, nonces) {
      const ch = f && channels.get(f.code); if (!ch || !Array.isArray(nonces)) return 0;
      const list = [...new Set(nonces.filter((n) => typeof n === 'string'))].slice(-8);
      list.forEach((n) => ch.ack(n, true));
      return list.length;
    },
    duelSupports: (f, cap) => { const via = supportsDirect(f, 'duel') ? f : f && !f.companion ? companionFor(f.code) : null; return supportsDirect(via, cap); },
    sendAll(kind) { let any = false; st.friends.forEach((f) => { if (f.peer) any = Friends.send(f, kind) || any; }); return any; },
    rename(f, nick) { f.nick = String(nick || '').trim().slice(0, 24) || undefined; save(); emit('change', f); },
    remove(f) {
      const ch = channels.get(f.code); if (ch) { ch.stop(); channels.delete(f.code); if (root.EyesPush) root.EyesPush.forget(ch.mailbox, ch.tag); }
      st.friends = st.friends.filter((x) => x !== f);
      const c = companionFor(f.code); if (c) { closeChannel(c); st.upgrades = st.upgrades.filter((x) => x !== c); }
      save(true); emit('change'); emit('removed', f);
    },
    clearMissed(f) { f.missed = []; save(); },
    touch() { save(); emit('change'); },   // 4.4: history changed elsewhere (visits, mirror): keep it
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

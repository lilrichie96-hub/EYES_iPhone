/* EYES push relay · Cloudflare Worker (free plan is plenty).
   Delivers a "your friend's eye reached for you" notification to iPhones (Home Screen web app, iOS 16.4+).
   It never sees any signal content or who anyone is: phones register under a random-looking mailbox id
   derived from their shared Eye Contact secret, and senders only say "mailbox X, kind pulse".

   Bindings (set in the dashboard or wrangler.toml):
     EYES_KV            a KV namespace
     VAPID_PUBLIC       base64url raw P-256 public key        } open the Worker's URL once with no
     VAPID_PRIVATE_JWK  the matching private key as JWK JSON  } secrets set: it generates a pair for you
     VAPID_SUBJECT      e.g. mailto:you@example.com
   Routes:
     GET  /            status / one-time setup page
     GET  /vapid       { publicKey }   (the web app subscribes with this)
     POST /register    { mailbox, tag, sub }      sub = PushSubscription.toJSON()
     POST /unregister  { mailbox, tag }
     POST /nudge       { mailbox, from, kind }    notifies every phone in the mailbox except `from` */
const PUSH_HOSTS = [/\.push\.apple\.com$/, /^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /\.notify\.windows\.com$/, /^android\.googleapis\.com$/];
const KINDS = ['pulse', 'spark', 'calm', 'resonance'];
const HEX = /^[0-9a-f]{32}$/;
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json', ...cors } });
const enc = new TextEncoder();

const b64u = (buf) => { const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf); let s = ''; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64u = (str) => { let s = String(str).replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; const bin = atob(s), out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; };
const concat = (...a) => { const out = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let o = 0; for (const x of a) { out.set(x, o); o += x.length; } return out; };
async function hmac(key, data) { const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); return new Uint8Array(await crypto.subtle.sign('HMAC', k, data)); }

// ---------- RFC 8291 (Message Encryption for Web Push), aes128gcm ----------
export async function encryptPayload(payload, p256dh, auth, fixed) {
  const uaPublic = unb64u(p256dh), authSecret = unb64u(auth);
  let asKeys;
  if (fixed && fixed.asPrivateJwk) {
    asKeys = { privateKey: await crypto.subtle.importKey('jwk', fixed.asPrivateJwk, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']) };
    asKeys.publicRaw = unb64u(fixed.asPublic);
  } else {
    const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    asKeys = { privateKey: kp.privateKey, publicRaw: new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey)) };
  }
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, asKeys.privateKey, 256));
  const prkKey = await hmac(authSecret, ecdh);
  const ikm = await hmac(prkKey, concat(enc.encode('WebPush: info\0'), uaPublic, asKeys.publicRaw, new Uint8Array([1])));
  const salt = fixed && fixed.salt ? unb64u(fixed.salt) : crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, concat(enc.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, concat(enc.encode('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12);
  const key = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, key, concat(payload, new Uint8Array([2]))));
  const header = new Uint8Array(21); header.set(salt, 0); new DataView(header.buffer).setUint32(16, 4096); header[20] = asKeys.publicRaw.length;
  return concat(header, asKeys.publicRaw, ct);
}

// ---------- VAPID (RFC 8292) ----------
export async function vapidAuth(endpoint, env) {
  const aud = new URL(endpoint).origin;
  const head = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = b64u(enc.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: env.VAPID_SUBJECT || 'mailto:eyes@example.com' })));
  const key = await crypto.subtle.importKey('jwk', JSON.parse(env.VAPID_PRIVATE_JWK), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(head + '.' + body)));
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${env.VAPID_PUBLIC}`;
}
async function push(sub, payload, env) {
  const body = await encryptPayload(enc.encode(JSON.stringify(payload)), sub.keys.p256dh, sub.keys.auth);
  return fetch(sub.endpoint, { method: 'POST', body, headers: { Authorization: await vapidAuth(sub.endpoint, env), 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '3600', Urgency: 'high' } });
}

async function setupPage() {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pub = b64u(await crypto.subtle.exportKey('raw', kp.publicKey)), jwk = JSON.stringify(await crypto.subtle.exportKey('jwk', kp.privateKey));
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return new Response(`<!doctype html><meta name=viewport content="width=device-width"><title>EYES push setup</title>
<body style="font:15px system-ui;max-width:640px;margin:30px auto;padding:0 16px;background:#05080a;color:#dfeff1">
<h2>EYES push relay: one-time setup</h2><p>This Worker has no keys yet. Add these as <b>Settings → Variables and Secrets</b> (type <b>Secret</b>), then deploy again. Reloading this page makes a different pair, so copy all three from the same page.</p>
<p><b>VAPID_PUBLIC</b><br><textarea rows=3 style="width:100%">${esc(pub)}</textarea></p>
<p><b>VAPID_PRIVATE_JWK</b><br><textarea rows=5 style="width:100%">${esc(jwk)}</textarea></p>
<p><b>VAPID_SUBJECT</b><br><textarea rows=1 style="width:100%">mailto:you@example.com</textarea></p>
<p>Also bind a KV namespace named <b>EYES_KV</b>. When it's set up, this page says "ready".</p></body>`, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    const ready = env.VAPID_PUBLIC && env.VAPID_PRIVATE_JWK && env.EYES_KV;
    if (req.method === 'GET' && url.pathname === '/') return ready ? json({ eyes: 'push relay', ready: true }) : setupPage();
    if (req.method === 'GET' && url.pathname === '/vapid') return ready ? json({ publicKey: env.VAPID_PUBLIC }) : json({ error: 'not set up' }, 503);
    if (req.method !== 'POST') return json({ error: 'not found' }, 404);
    if (!ready) return json({ error: 'not set up' }, 503);
    let o; try { o = JSON.parse(await req.text()); } catch (e) { return json({ error: 'bad json' }, 400); }
    if (!o || !HEX.test(o.mailbox || '')) return json({ error: 'bad mailbox' }, 400);
    const k = 'mb:' + o.mailbox;
    const list = (await env.EYES_KV.get(k, 'json')) || [];
    if (url.pathname === '/register') {
      const sub = o.sub;
      if (!HEX.test(o.tag || '') || !sub || typeof sub.endpoint !== 'string' || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) return json({ error: 'bad subscription' }, 400);
      let host; try { host = new URL(sub.endpoint).host; } catch (e) { return json({ error: 'bad endpoint' }, 400); }
      if (!sub.endpoint.startsWith('https://') || !PUSH_HOSTS.some((r) => r.test(host))) return json({ error: 'unknown push service' }, 400);
      const next = list.filter((x) => x.tag !== o.tag).concat([{ tag: o.tag, sub: { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } }, at: Date.now() }]).slice(-6);
      await env.EYES_KV.put(k, JSON.stringify(next), { expirationTtl: 60 * 86400 });   // refreshed whenever the app opens
      return json({ ok: true });
    }
    if (url.pathname === '/unregister') {
      await env.EYES_KV.put(k, JSON.stringify(list.filter((x) => x.tag !== o.tag)), { expirationTtl: 60 * 86400 });
      return json({ ok: true });
    }
    if (url.pathname === '/nudge') {
      if (!KINDS.includes(o.kind)) return json({ error: 'bad kind' }, 400);
      const rk = 'rl:' + o.mailbox, n = Number(await env.EYES_KV.get(rk)) || 0;
      if (n > 40) return json({ error: 'slow down' }, 429);                       // at most ~40 an hour per pair
      await env.EYES_KV.put(rk, String(n + 1), { expirationTtl: 3600 });
      const targets = list.filter((x) => x.tag !== o.from);
      const dead = [];
      await Promise.all(targets.map(async (x) => { try { const r = await push(x.sub, { m: o.mailbox, k: o.kind }, env); if (r.status === 404 || r.status === 410) dead.push(x.tag); } catch (e) {} }));
      if (dead.length) await env.EYES_KV.put(k, JSON.stringify(list.filter((x) => !dead.includes(x.tag))), { expirationTtl: 60 * 86400 });
      return json({ ok: true, sent: targets.length - dead.length });
    }
    return json({ error: 'not found' }, 404);
  }
};
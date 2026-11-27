/* Eye Contact for EYES. Room names are derived locally from the private invite.
   Anonymous device credentials stay on this installation, outside Eye Passport. */
(function (root) {
  'use strict';
  const project = 'https://eyes-b0d38-default-rtdb.firebaseio.com';
  const apiKey = 'AIzaSyAqtB_vn3lnqgZjhje1a7y-KwQX0jXAyLg';
  const credentialKey = 'fray.firebase.auth.v1';
  let identity = null, pendingAuth = null;
  const error = (message, status) => Object.assign(new Error(message), { status });

  async function request(url, options) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal, cache: 'no-store' });
      if (!response.ok) {
        let detail = '';
        try { const body = await response.json(); detail = body.error?.message || body.error || ''; } catch (_) {}
        throw error('Eye Contact service returned ' + response.status + (detail ? ': ' + String(detail).slice(0, 80) : ''), response.status);
      }
      return await response.json();
    } finally { clearTimeout(timeout); }
  }

  async function authenticate() {
    const saved = localStorage.getItem(credentialKey);
    const url = saved ? 'https://securetoken.googleapis.com/v1/token' :
      'https://identitytoolkit.googleapis.com/v1/accounts:signUp';
    const form = saved ? new URLSearchParams({ grant_type: 'refresh_token', refresh_token: saved }).toString() :
      JSON.stringify({ returnSecureToken: true });
    const data = await request(url + '?key=' + apiKey, { method: 'POST',
      headers: { 'Content-Type': saved ? 'application/x-www-form-urlencoded' : 'application/json' }, body: form });
    const token = data.id_token || data.idToken, refresh = data.refresh_token || data.refreshToken;
    const uid = data.user_id || data.localId;
    if (!uid || !token || !refresh) throw error('Device sign-in failed', 401);
    localStorage.setItem(credentialKey, refresh);
    identity = { uid, token, until: Date.now() + Number(data.expires_in || data.expiresIn || 3600) * 1000 };
    return identity;
  }
  // A rejected access token may be refreshed without changing the device UID.
  // Never silently create a replacement anonymous account: doing so loses room ownership.
  function invalidateAccessToken() { identity = null; }
  function session() {
    if (identity && identity.until > Date.now() + 120000) return Promise.resolve(identity);
    if (!pendingAuth) pendingAuth = authenticate().finally(() => { pendingAuth = null; });
    return pendingAuth;
  }

  function channel(room, joined) {
    if (!/^haven_link_[0-9a-f]{44}$/.test(room)) throw Error('Invalid Eye Contact room');
    const side = joined ? 'guest' : 'host', other = joined ? 'host' : 'guest';
    const base = project + '/eyeContactV1/' + room + '/';
    let claimed = null, claiming = null;
    const endpoint = (path, user) => base + path + '.json?auth=' + encodeURIComponent(user.token);
    const put = (path, user, value) => request(endpoint(path, user), { method: 'PUT', body: JSON.stringify(value) });
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    async function writeWithRecovery(path, value, suppliedUser) {
      let user = suppliedUser;
      for (let attempt = 0; attempt < 3; attempt++) {
        try { await put(path, user, value); return user; }
        catch (e) {
          if (e.status === 401 && attempt === 0) {
            invalidateAccessToken();
            user = await session();
            continue;
          }
          // 403 means a rules/ownership problem, not a connectivity problem.
          if (e.status === 403 || (e.status >= 400 && e.status < 500 && e.status !== 408 && e.status !== 429)) throw e;
          if (attempt === 2 || navigator.onLine === false) throw e;
          await delay(350 * (attempt + 1));
        }
      }
      return user;
    }
    async function ready() {
      const user = await session();
      if (claimed !== user.uid) {
        if (!claiming) claiming = writeWithRecovery(side, user.uid, user).then((current) => { claimed = current.uid; }).finally(() => { claiming = null; });
        await claiming;
      }
      return user;
    }
    async function publish(payload, nonce) {
      const user = await ready();
      // Each sender owns a bounded mailbox. Include the nonce in every record:
      // the existing receiver deduplicates the initial snapshot on each reconnect.
      const key = 'fray.firebase.slot.' + room + '.' + side;
      const slot = (Number(localStorage.getItem(key) || 0) + 1) % 64;
      localStorage.setItem(key, String(slot));
      await writeWithRecovery('mail/' + side + '/' + slot, { id: nonce, body: payload, at: { '.sv': 'timestamp' } }, user);
    }
    async function listen(signal, onReady, onMessage) {
      const user = await ready();
      if (signal.aborted) return;
      await new Promise((resolve, reject) => {
        const source = new EventSource(endpoint('mail/' + other, user));
        let chain = Promise.resolve(), closed = false;
        const renewal = setTimeout(() => finish(), Math.max(1000, user.until - Date.now() - 110000));
        function finish(problem) {
          if (closed) return;
          closed = true; source.close(); clearTimeout(renewal); signal.removeEventListener('abort', stop);
          if (problem) reject(problem); else resolve();
        }
        const stop = () => finish();
        signal.addEventListener('abort', stop, { once: true });
        source.onerror = () => finish(error('Connection interrupted', 0));
        source.addEventListener('cancel', () => finish(error('Room access denied', 403)));
        source.addEventListener('auth_revoked', () => { if (identity === user) invalidateAccessToken(); finish(error('Device sign-in expired', 401)); });
        function receive(event) {
          chain = chain.then(async () => {
            if (closed) return;
            const frame = JSON.parse(event.data);
            const records = frame.path === '/' ? Object.values(frame.data || {}) : [frame.data];
            for (const entry of records.filter(Boolean).sort((a, b) => a.at - b.at)) {
              if (closed) return;
              if (typeof entry.body === 'string' && typeof entry.id === 'string') await onMessage(entry.id, entry.body);
            }
            if (!closed) onReady();
          }).catch(finish);
        }
        source.addEventListener('put', receive);
        source.addEventListener('patch', receive);
      });
    }
    return { publish, listen, ready };
  }
  // 4.9 Eye Exchange uses the same project and the same anonymous device session
  root.EyesFirebase = { channel, session, project };
})(window);

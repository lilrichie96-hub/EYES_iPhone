/* HAVEN safety net and backup.
   Loads before everything else. If HAVEN fails to start, or keeps failing, it swaps in a plain,
   dependable app list so the phone is never stuck on a blank home screen.
   It also handles backing up and restoring the home setup as text. */
(function () {
  'use strict';
  const BOOT_TIMEOUT = 6000,
    ERROR_WINDOW = 10000,
    ERROR_LIMIT = 6,
    PREFIX = 'haven.',
    FORMAT = 'haven-backup';
  const phone = window.Phone;
  let ready = false,
    failed = false,
    apps = [],
    errors = [],
    real = null,
    wrapped = null,
    lastError = '';
  function call(method, ...args) {
    try {
      if (phone && typeof phone[method] === 'function') return phone[method](...args);
    } catch (e) {}
  }

  // ---------- Backup ----------
  function backupText() {
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) data[k] = localStorage.getItem(k);
    }
    return JSON.stringify({
      format: FORMAT,
      version: 1,
      exportedAt: new Date().toISOString(),
      data
    });
  }
  function parseBackup(text) {
    let parsed;
    if (/EYESP1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(String(text || '')))
      return { ok: false, reason: 'That is an Eye Passport. Use Eye Passport → Restore, just below.' };
    try {
      parsed = JSON.parse(String(text || '').trim());
    } catch (e) {
      return { ok: false, reason: "That doesn't look like an EYES backup." };
    }
    if (!parsed || parsed.format !== FORMAT || typeof parsed.data !== 'object' || !parsed.data)
      return { ok: false, reason: "That doesn't look like an EYES backup." };
    const entries = Object.entries(parsed.data).filter(
      ([k, v]) =>
        typeof k === 'string' && k.startsWith(PREFIX) && typeof v === 'string' && v.length < 500000
    );
    if (!entries.length) return { ok: false, reason: 'That backup is empty.' };
    return { ok: true, entries, exportedAt: parsed.exportedAt };
  }
  function restore(text) {
    const result = parseBackup(text);
    if (!result.ok) return result;
    // 4.2.2: all or nothing. If any write fails, the phone goes back exactly to how it was.
    const before = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) before.push([k, localStorage.getItem(k)]);
    }
    try {
      before.forEach(([k]) => localStorage.removeItem(k));
      result.entries.forEach(([k, v]) => localStorage.setItem(k, v));
    } catch (e) {
      try {
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const k = localStorage.key(i);
          if (k && k.startsWith(PREFIX)) localStorage.removeItem(k);
        }
        before.forEach(([k, v]) => localStorage.setItem(k, v));
      } catch (e2) {}
      return { ok: false, reason: "Couldn't write the backup on this phone, so nothing was changed." };
    }
    return result;
  }
  async function copy(text) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) {}
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.className = 'safe-offscreen';
      document.body.append(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      return ok;
    } catch (e) {
      return false;
    }
  }

  // ---------- Safe mode ----------
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  function render() {
    if (!document.body) return;
    let root = document.getElementById('safeMode');
    if (!root) {
      root = el('div', 'safe-mode-panel');
      root.id = 'safeMode';
      root.setAttribute('role', 'dialog');
      root.setAttribute('aria-label', 'EYES safe mode');
      const head = el('div', 'safe-head');
      head.append(
        el('h1', null, 'EYES hit a snag'),
        el('p', null, 'Your apps are still here. Try EYES again, or keep using this simple list.')
      );
      const actions = el('div', 'safe-actions');
      const retry = el('button', 'safe-primary', 'Try EYES again');
      retry.type = 'button';
      retry.onclick = () => location.reload();
      const backup = el('button', null, 'Copy my backup');
      backup.type = 'button';
      backup.onclick = async () => {
        backup.textContent = (await copy(backupText())) ? 'Backup copied' : 'Copy failed';
      };
      const other = el('button', null, 'Use another home app');
      other.type = 'button';
      other.onclick = () => call('setup', 'home');
      actions.append(retry, backup, other);
      const search = el('input', 'safe-search');
      search.type = 'search';
      search.placeholder = 'Search apps';
      search.setAttribute('aria-label', 'Search apps');
      search.oninput = () => fill(root, search.value);
      const list = el('div', 'safe-list');
      const detail = el('p', 'safe-detail');
      root.append(head, actions, search, list, detail);
      document.body.append(root);
    }
    document.documentElement.classList.add('safe-mode');
    root.querySelector('.safe-detail').textContent = lastError
      ? 'Details: ' + lastError.slice(0, 160)
      : '';
    fill(root, root.querySelector('.safe-search').value);
  }
  function fill(root, query) {
    const list = root.querySelector('.safe-list'),
      q = String(query || '')
        .trim()
        .toLowerCase();
    list.replaceChildren();
    const shown = apps
      .filter(
        (a) =>
          a &&
          a.id &&
          String(a.name || '')
            .toLowerCase()
            .includes(q)
      )
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
    if (!shown.length) {
      list.append(el('p', 'safe-empty', apps.length ? 'No matches.' : 'Loading your apps…'));
      return;
    }
    for (const app of shown) {
      const b = el('button', 'safe-app');
      b.type = 'button';
      if (app.icon) {
        const img = el('img');
        img.alt = '';
        img.src = app.icon;
        b.append(img);
      }
      b.append(el('span', null, app.name || app.id));
      b.onclick = () => call('launch', app.id);
      list.append(b);
    }
  }
  function fail(reason) {
    if (failed) return;
    failed = true;
    lastError = String(reason || '');
    try {
      render();
    } catch (e) {}
    call('refresh');
  }
  function report(err) {
    lastError = String(err?.message || err || 'Unknown error');
    if (!ready) {
      fail(lastError);
      return;
    }
    const t = Date.now();
    errors = errors.filter((x) => t - x < ERROR_WINDOW);
    errors.push(t);
    if (errors.length >= ERROR_LIMIT) fail(lastError);
  }
  addEventListener('error', (e) => report(e.error || e.message));
  addEventListener('unhandledrejection', (e) => report(e.reason));

  // Native talks to window.Haven. Until HAVEN takes over (or if it never does), this keeps the apps flowing to safe mode.
  const stub = {
    receive(data) {
      if (data && data.type === 'apps' && Array.isArray(data.apps)) {
        apps = data.apps;
        if (failed) render();
      }
    },
    back() {
      return true;
    },
    goHome() {},
    setMotion() {}
  };
  function wrap(target) {
    return new Proxy(target, {
      get(t, key) {
        const v = t[key];
        if (typeof v !== 'function') return v;
        return (...args) => {
          if (key === 'receive') stub.receive(args[0]);
          if (failed) return key === 'back' ? true : undefined;
          try {
            return v.apply(t, args);
          } catch (e) {
            report(e);
            return key === 'back' ? true : undefined;
          }
        };
      }
    });
  }
  Object.defineProperty(window, 'Haven', {
    configurable: true,
    get() {
      return failed || !real ? stub : wrapped;
    },
    set(v) {
      real = v;
      wrapped = v && typeof v === 'object' ? wrap(v) : null;
    }
  });

  setTimeout(() => {
    if (!ready) fail('EYES took too long to start.');
  }, BOOT_TIMEOUT);

  // ---------- Backup row in Settings ----------
  function wireSettings() {
    const copyBtn = document.getElementById('backupCopy'),
      restoreBtn = document.getElementById('backupRestore');
    if (!copyBtn || !restoreBtn) return;
    const status = document.getElementById('backupStatus'),
      paste = document.getElementById('backupPaste'),
      area = document.getElementById('backupText');
    const apply = document.getElementById('backupApply'),
      cancel = document.getElementById('backupCancel'),
      base = status.textContent;
    const say = (text, keep) => {
      status.textContent = text;
      if (!keep)
        setTimeout(() => {
          status.textContent = base;
        }, 5000);
    };
    copyBtn.onclick = async () => {
      const text = backupText();
      if (await copy(text)) {
        paste.hidden = true;
        say('Copied. Paste it somewhere safe, like Notes or a message to yourself.');
      } else {
        paste.hidden = false;
        area.value = text;
        area.readOnly = true;
        apply.hidden = true;
        area.select();
        say("Couldn't copy automatically. Select the text below and copy it.", true);
      }
    };
    restoreBtn.onclick = () => {
      paste.hidden = false;
      area.readOnly = false;
      area.value = '';
      apply.hidden = false;
      area.focus();
      say('Paste an EYES backup, then tap Restore now.', true);
    };
    cancel.onclick = () => {
      paste.hidden = true;
      area.value = '';
      say(base, true);
    };
    apply.onclick = () => {
      const r = restore(area.value);
      if (!r.ok) {
        say(r.reason, true);
        return;
      }
      say('Restored. Reloading EYES…', true);
      setTimeout(() => location.reload(), 600);
    };
  }
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', wireSettings);
  else wireSettings();

  window.HavenSafety = {
    ready() {
      ready = true;
    },
    fail,
    backupText,
    parseBackup,
    restore,
    get failed() {
      return failed;
    }
  };
})();

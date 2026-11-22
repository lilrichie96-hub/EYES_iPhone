/* EYES 4.2.2 · Eye Passport: one versioned, encrypted backup of everything that makes your Eye yours.
   Shared by Android and iPhone. Loads after eyes-friends.js (it only needs localStorage and WebCrypto).

   What goes in: every haven.* and eyes.* setting this phone keeps (identity, DNA, growth, temperament,
   personality, skins, settings, home layout, Eye Dex, Play records, friends with their history and the
   upgraded companions). What stays out: things that belong to this phone only (its notification
   subscription, the restore undo copy, day-stamped morning flags). The Android launcher's original native
   Eye Contact lives in the Android app itself, not in EYES's storage, so it can't travel; the passport says so.

   Format (text, safe to paste anywhere):
     EYESP1.<base64url(JSON header)>.<base64url(ciphertext)>
     header  {f:'eyes-passport', v:1, kdf:'PBKDF2-SHA256', it, salt, iv, at, from:{p, ver}}
     cipher  AES-256-GCM, key = PBKDF2(passphrase, salt, it), AAD = the exact header text.
             The header can't be altered without the passphrase check failing.
     inside  {f:'eyes-passport-data', v:1, data:{key: value}, sum:{…}}
   Friendship secrets only ever leave the phone inside that ciphertext. There is no unencrypted option.

   Restoring is all-or-nothing: the passport is decrypted and checked in full first, the plan is shown,
   then every key is written; if any write fails, the phone's previous state is put back exactly.
   The previous state is also kept on the phone for 24 hours as an undo.
   Older formats still restore here: the Android "Back up your home" text and the iPhone Keepsake code. */
'use strict';
(function (root) {
  const TAG = 'EYESP1.', VERSION = 1, ITER = 600000, MIN_PASS = 8;
  const UNDO = 'eyes.restore.undo.v1', UNDO_MS = 24 * 3600000;
  const LOCAL_ONLY = [/^eyes\.push\.on$/, /^eyes\.restore\.undo\./, /^haven\.fresh\.morning\./];
  // launcher layout that only means something on the phone it came from (kept when moving between platforms)
  const LAUNCHER_ONLY = /^haven\.(fresh|iris|music)\./;
  const CODE_RE = /^HL1-[A-Za-z0-9_-]{43}$/;
  const MAX_VALUE = 500000, MAX_TOTAL = 4000000;
  const enc = new TextEncoder(), dec = new TextDecoder();
  const b64u = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const unb64u = (str) => { let s = String(str).replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; const bin = atob(s), out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; };
  const platform = () => (root.EYES_WEB ? 'iphone' : 'android');
  const appVersion = () => { const v = document.querySelector('.version'); return v ? v.textContent.trim().slice(0, 40) : ''; };
  const ours = (k) => typeof k === 'string' && /^(haven|eyes)\./.test(k) && !LOCAL_ONLY.some((r) => r.test(k));
  const parse = (v) => { try { return JSON.parse(v); } catch (e) { return undefined; } };

  // ---------- what this phone holds ----------
  function collect() {
    const data = {};
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (ours(k)) data[k] = localStorage.getItem(k); }
    return data;
  }
  function summarize(data) {
    const dna = parse(data['haven.dna.v1']), fr = parse(data['eyes.friends.v1']), dex = parse(data['eyes.dex.v1']), play = parse(data['eyes.play.v1']);
    const friends = fr && Array.isArray(fr.friends) ? fr.friends : [];
    return {
      eye: dna && typeof dna.seed === 'number' ? { name: dna.name || 'Your Eye', seed: dna.seed, born: dna.born || dna.at || 0 } : null,
      friends: friends.filter((f) => f && f.peer).length,
      pending: friends.filter((f) => f && !f.peer).length,
      upgrades: fr && Array.isArray(fr.upgrades) ? fr.upgrades.filter((c) => c && c.peer).length : 0,
      dex: dex && dex.entries ? Object.keys(dex.entries).length : 0,
      play: play ? (play.wins || 0) + (play.losses || 0) : 0,
      keys: Object.keys(data).length,
      codes: friends.map((f) => f && f.code).filter(Boolean)
    };
  }

  // ---------- crypto ----------
  async function keyFrom(pass, salt, it) {
    const base = await crypto.subtle.importKey('raw', enc.encode(String(pass).normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: it }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function create(pass, data = collect()) {
    if (typeof pass !== 'string' || pass.length < MIN_PASS) throw new Error(`Choose a passphrase of at least ${MIN_PASS} characters.`);
    const sum = summarize(data);
    if (!sum.eye) throw new Error('There is no Eye on this phone to pack yet.');
    const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const header = JSON.stringify({ f: 'eyes-passport', v: VERSION, kdf: 'PBKDF2-SHA256', it: ITER, salt: b64u(salt), iv: b64u(iv), at: Date.now(), from: { p: platform(), ver: appVersion() } });
    const inner = JSON.stringify({ f: 'eyes-passport-data', v: VERSION, data, sum: { ...sum, codes: undefined } });
    const key = await keyFrom(pass, salt, ITER);
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(header), tagLength: 128 }, key, enc.encode(inner)));
    return TAG + b64u(enc.encode(header)) + '.' + b64u(ct);
  }
  function detect(text) {
    const t = String(text || '').trim();
    if (/EYESP1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(t)) return 'passport';
    if (/EYES1\.[A-Za-z0-9_-]+/.test(t)) return 'keepsake';
    if (/^\{[\s\S]*"format"\s*:\s*"haven-backup"/.test(t)) return 'backup';
    return null;
  }
  // Decrypt and check a passport completely. Nothing is written here.
  async function open(text, pass) {
    const m = String(text || '').match(/EYESP1\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)/);
    if (!m) return { ok: false, reason: "That isn't an Eye Passport." };
    let header, hdr;
    try { header = dec.decode(unb64u(m[1])); hdr = JSON.parse(header); } catch (e) { return { ok: false, reason: 'That passport is damaged. Check you copied all of it.' }; }
    if (!hdr || hdr.f !== 'eyes-passport') return { ok: false, reason: "That isn't an Eye Passport." };
    if (hdr.v > VERSION) return { ok: false, reason: 'That passport comes from a newer EYES. Update EYES on this phone first.' };
    if (hdr.v !== 1 || hdr.kdf !== 'PBKDF2-SHA256' || !(hdr.it >= 100000 && hdr.it <= 5000000)) return { ok: false, reason: 'That passport uses a format this EYES does not know.' };
    let inner;
    try {
      const key = await keyFrom(pass || '', unb64u(hdr.salt), hdr.it);
      const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64u(hdr.iv), additionalData: enc.encode(header), tagLength: 128 }, key, unb64u(m[2]));
      inner = JSON.parse(dec.decode(pt));
    } catch (e) { return { ok: false, reason: "That passphrase doesn't open this passport (or the passport was changed)." }; }
    if (!inner || inner.f !== 'eyes-passport-data' || inner.v !== 1 || !inner.data || typeof inner.data !== 'object') return { ok: false, reason: 'That passport is damaged.' };
    const checked = validate(inner.data);
    if (!checked.ok) return checked;
    return { ok: true, kind: 'passport', data: checked.data, header: hdr, sum: summarize(checked.data) };
  }
  function validate(raw) {
    const data = {}; let total = 0;
    for (const [k, v] of Object.entries(raw)) {
      if (!ours(k)) continue;                                        // unknown or phone-only keys are ignored
      if (typeof v !== 'string' || v.length > MAX_VALUE) return { ok: false, reason: 'That passport holds something EYES does not accept.' };
      total += k.length + v.length; data[k] = v;
    }
    if (total > MAX_TOTAL) return { ok: false, reason: 'That passport is too large for this phone.' };
    const dna = parse(data['haven.dna.v1']);
    if (!dna || typeof dna.seed !== 'number') return { ok: false, reason: "That passport doesn't hold an Eye." };
    if (data['haven.growth.v1'] !== undefined && parse(data['haven.growth.v1']) === undefined) return { ok: false, reason: 'That passport is damaged (growth).' };
    if (data['eyes.friends.v1'] !== undefined) {
      const fr = parse(data['eyes.friends.v1']);
      if (!fr || !Array.isArray(fr.friends) || typeof fr.myId !== 'string' || fr.myId.length < 15) return { ok: false, reason: 'That passport is damaged (friends).' };
      if (!fr.friends.every((f) => f && CODE_RE.test(f.code || ''))) return { ok: false, reason: 'That passport is damaged (friends).' };
      if (fr.upgrades !== undefined && (!Array.isArray(fr.upgrades) || !fr.upgrades.every((c) => c && CODE_RE.test(c.code || '')))) return { ok: false, reason: 'That passport is damaged (friends).' };
    }
    for (const k of ['eyes.dex.v1', 'eyes.play.v1', 'haven.personality.v1']) if (data[k] !== undefined && parse(data[k]) === undefined) return { ok: false, reason: 'That passport is damaged.' };
    return { ok: true, data };
  }

  // ---------- older formats (kept working) ----------
  function openBackup(text) {
    const r = root.HavenSafety && HavenSafety.parseBackup ? HavenSafety.parseBackup(text) : { ok: false, reason: "That doesn't look like an EYES backup." };
    if (!r.ok) return r;
    const data = {}; r.entries.forEach(([k, v]) => { data[k] = v; });
    // the original home backup replaces only haven.* (exactly as it always did): eyes.* stays as it is
    return { ok: true, kind: 'backup', data, scope: /^haven\./, sum: summarize({ ...collect(), ...data }) };
  }
  function openKeepsake(text) {
    try {
      const m = String(text || '').match(/EYES1\.[A-Za-z0-9_-]+/); if (!m) throw 0;
      const o = JSON.parse(dec.decode(unb64u(m[0].slice(6))));
      if (!o || !o.d || typeof o.d.seed !== 'number') throw 0;
      const data = { 'haven.dna.v1': JSON.stringify(o.d) };
      if (o.g) data['haven.growth.v1'] = JSON.stringify(o.g);
      if (o.x) for (const k in o.x) if ((/^haven\./.test(k) || k === 'eyes.senses.v1') && typeof o.x[k] === 'string') data[k] = o.x[k];
      // a Keepsake never replaced anything it didn't carry: keep it that way (merge, nothing removed)
      return { ok: true, kind: 'keepsake', data, merge: true, sum: summarize({ ...collect(), ...data }) };
    } catch (e) { return { ok: false, reason: "That code doesn't look right. Check you copied all of it." }; }
  }
  async function read(text, pass) {
    const kind = detect(text);
    if (kind === 'passport') return open(text, pass);
    if (kind === 'keepsake') return openKeepsake(text);
    if (kind === 'backup') return openBackup(text);
    return { ok: false, reason: "That isn't an Eye Passport, a home backup or a Keepsake code." };
  }

  // What restoring would do, in words, before anything is touched.
  function plan(r) {
    const here = summarize(collect()), there = r.sum, lines = [];
    if (r.kind === 'backup') lines.push('This home backup brings back the Eye, home layout and settings it holds. Friends, Eye Dex and Play stay as they are on this phone.');
    else if (r.kind === 'keepsake') lines.push('This Keepsake brings back the Eye, its growth and its settings. Nothing else on this phone is removed.');
    if (there.eye) lines.push(`Eye in it: ${there.eye.name}.`);
    if (here.eye && there.eye && here.eye.seed !== there.eye.seed) lines.push(`It replaces ${here.eye.name}, the Eye on this phone now.`);
    if (r.kind === 'passport') {
      lines.push(`Friends: ${there.friends}${there.pending ? ` (+${there.pending} invitations)` : ''} · Eye Dex: ${there.dex} · Play games: ${there.play}.`);
      const lost = here.codes.filter((c) => !there.codes.includes(c)).length;
      if (lost) lines.push(`${lost} friendship${lost === 1 ? '' : 's'} on this phone ${lost === 1 ? "isn't" : "aren't"} in the passport and will be replaced. (An undo copy stays here for 24 hours.)`);
      if (r.header && r.header.from && r.header.from.p !== platform()) lines.push(r.header.from.p === 'android' ? 'It comes from Android: the home screen layout stays Android-only.' : 'It comes from iPhone: this phone keeps its own home screen layout.');
      lines.push("Use a passport on one phone at a time. If the old phone keeps using EYES with the same friends, their Eyes can't tell the two apart.");
      if (!root.EYES_WEB) lines.push('Your first Eye Contact (built into the Android launcher) stays with the phone it was made on. On a new phone, invite that friend again.');
    }
    return { here, there, lines };
  }

  // All or nothing, with the previous state kept for an undo.
  function apply(r) {
    if (!r || !r.ok || !r.data) return { ok: false, reason: 'Nothing to restore.' };
    const before = collect();
    const crossPlatform = r.kind === 'passport' && r.header && r.header.from && r.header.from.p !== platform();
    const removals = r.merge ? [] : Object.keys(before).filter((k) => {
      if (k in r.data) return false;
      if (r.scope && !r.scope.test(k)) return false;                 // the old backup only ever owned haven.*
      if (crossPlatform && LAUNCHER_ONLY.test(k)) return false;
      return true;
    });
    try { localStorage.setItem(UNDO, JSON.stringify({ at: Date.now(), data: before })); } catch (e) { /* no room for an undo copy: restore still safe below */ }
    try {
      removals.forEach((k) => localStorage.removeItem(k));
      for (const [k, v] of Object.entries(r.data)) localStorage.setItem(k, v);
    } catch (e) {
      rollback(before);
      return { ok: false, reason: "This phone couldn't store the whole thing, so nothing was changed." };
    }
    return { ok: true };
  }
  function rollback(before) {
    try {
      const now = collect();
      Object.keys(now).forEach((k) => { if (!(k in before)) localStorage.removeItem(k); });
      for (const [k, v] of Object.entries(before)) localStorage.setItem(k, v);
    } catch (e) {}
  }
  function undoInfo() { const u = parse(localStorage.getItem(UNDO)); return u && u.data && Date.now() - u.at < UNDO_MS ? u : null; }
  function undo() {
    const u = undoInfo(); if (!u) return { ok: false, reason: 'There is nothing to undo.' };
    const current = collect();
    try {
      Object.keys(current).forEach((k) => { if (!(k in u.data)) localStorage.removeItem(k); });
      for (const [k, v] of Object.entries(u.data)) localStorage.setItem(k, v);
    } catch (e) { rollback(current); return { ok: false, reason: "Couldn't undo on this phone, so nothing was changed." }; }
    localStorage.removeItem(UNDO);
    return { ok: true };
  }
  function expireUndo() { try { const u = parse(localStorage.getItem(UNDO)); if (u && Date.now() - u.at >= UNDO_MS) localStorage.removeItem(UNDO); } catch (e) {} }

  // ---------- The Optic: Help & backup ----------
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  async function copy(text) {
    try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(text); return true; } } catch (e) {}
    return false;
  }
  function mount() {
    const st = $('settings'); if (!st || $('passportRow')) return;
    const heading = [...st.querySelectorAll('h2.optic-group')].find((h) => h.textContent.includes('Help & backup'));
    if (!heading) return;
    // after the existing backup / keepsake rows, so the old ways stay where people know them
    let anchor = heading;
    const near = (el) => el && (el.classList.contains('tips-setting') || el.classList.contains('backup-setting') || el.classList.contains('backup-paste') || el.id === 'keepRow');
    while (near(anchor.nextElementSibling)) anchor = anchor.nextElementSibling;
    const row = document.createElement('div');
    row.className = 'setting passport-setting'; row.id = 'passportRow';
    row.innerHTML = '<span>Eye Passport<small id="passportStatus" aria-live="polite">Everything about your Eye: its DNA and growth, friends and their history, Eye Dex and Play, locked with a passphrase you choose.</small></span><span class="backup-actions"><button id="passportMake" type="button">Create</button><button id="passportRestore" type="button">Restore</button></span>';
    const box = document.createElement('div'); box.className = 'backup-paste passport-box'; box.id = 'passportBox'; box.hidden = true;
    anchor.insertAdjacentElement('afterend', row);
    row.insertAdjacentElement('afterend', box);
    const base = $('passportStatus').textContent;
    const say = (t) => { $('passportStatus').textContent = t || base; };
    $('passportMake').onclick = () => showMake(box, say);
    $('passportRestore').onclick = () => showRestore(box, say);
    if (undoInfo()) say('A restore happened recently. You can undo it from Restore for 24 hours.');
  }
  function showMake(box, say) {
    box.hidden = false;
    box.innerHTML = `<label class="passport-field">Passphrase<input id="ppPass" type="password" autocomplete="new-password" minlength="${MIN_PASS}" placeholder="At least ${MIN_PASS} characters"></label>
      <label class="passport-field">Again<input id="ppPass2" type="password" autocomplete="new-password"></label>
      <p class="passport-note">Nobody can open the passport without this passphrase, not even FRAY. Write it down somewhere safe. It holds your friendships' secrets, so share the passport only with yourself.</p>
      <span class="backup-actions"><button id="ppCancel" type="button">Cancel</button><button id="ppGo" type="button">Create passport</button></span>`;
    $('ppCancel').onclick = () => { box.hidden = true; box.innerHTML = ''; say(); };
    $('ppGo').onclick = async () => {
      const a = $('ppPass').value, b = $('ppPass2').value;
      if (a.length < MIN_PASS) return say(`Choose a passphrase of at least ${MIN_PASS} characters.`);
      if (a !== b) return say("The two passphrases don't match.");
      $('ppGo').disabled = true; say('Locking your passport…');
      try {
        const text = await create(a);
        const s = summarize(collect());
        box.innerHTML = `<textarea id="ppOut" rows="4" readonly aria-label="Eye Passport"></textarea><span class="backup-actions"><button id="ppDone" type="button">Done</button>${navigator.share ? '<button id="ppShare" type="button">Share…</button>' : ''}<button id="ppCopy" type="button">Copy</button></span>`;
        $('ppOut').value = text;
        say(`Passport ready: ${s.eye.name}, ${s.friends} friend${s.friends === 1 ? '' : 's'}, ${s.dex} in the Eye Dex. Keep it in Notes or a file only you can open.`);
        $('ppCopy').onclick = async () => { if (await copy(text)) say('Copied. Paste it somewhere only you can open.'); else { $('ppOut').select(); say("Couldn't copy automatically. Select the text and copy it."); } };
        if ($('ppShare')) $('ppShare').onclick = () => navigator.share({ text }).catch(() => {});
        $('ppDone').onclick = () => { box.hidden = true; box.innerHTML = ''; say(); };
      } catch (e) { say(e.message || "Couldn't create the passport."); $('ppGo').disabled = false; }
    };
    $('ppPass').focus();
  }
  function showRestore(box, say) {
    box.hidden = false;
    const u = undoInfo();
    box.innerHTML = `<textarea id="ppIn" rows="4" aria-label="Paste an Eye Passport, home backup or Keepsake code" placeholder="Paste an Eye Passport (EYESP1…), a home backup or a Keepsake code" autocomplete="off" spellcheck="false"></textarea>
      <label class="passport-field" id="ppPassWrap" hidden>Passphrase<input id="ppPassIn" type="password" autocomplete="current-password"></label>
      <div id="ppPlan" class="passport-plan" hidden></div>
      <span class="backup-actions"><button id="ppCancel" type="button">Cancel</button>${u ? '<button id="ppUndo" type="button">Undo last restore</button>' : ''}<button id="ppCheck" type="button">Check</button><button id="ppApply" type="button" hidden>Restore now</button></span>`;
    let ready = null;
    const area = $('ppIn');
    area.oninput = () => { ready = null; $('ppApply').hidden = true; $('ppPlan').hidden = true; $('ppPassWrap').hidden = detect(area.value) !== 'passport'; };
    $('ppCancel').onclick = () => { box.hidden = true; box.innerHTML = ''; say(); };
    if ($('ppUndo')) $('ppUndo').onclick = () => { const r = undo(); if (!r.ok) return say(r.reason); say('Undone. Reloading EYES…'); setTimeout(() => location.reload(), 600); };
    $('ppCheck').onclick = async () => {
      $('ppCheck').disabled = true; say('Checking…');
      const r = await read(area.value, $('ppPassIn').value);
      $('ppCheck').disabled = false;
      if (!r.ok) { say(r.reason); return; }
      ready = r;
      const p = plan(r);
      $('ppPlan').innerHTML = p.lines.map((l) => `<p>${esc(l)}</p>`).join('');
      $('ppPlan').hidden = false; $('ppApply').hidden = false; $('ppApply').dataset.sure = '';
      $('ppApply').textContent = 'Restore now';
      say('Checked. Nothing has changed yet.');
    };
    $('ppApply').onclick = () => {
      if (!ready) return;
      const btn = $('ppApply');
      if (!btn.dataset.sure) { btn.dataset.sure = '1'; btn.textContent = 'Tap again to restore'; setTimeout(() => { if (btn.isConnected) { btn.dataset.sure = ''; btn.textContent = 'Restore now'; } }, 4000); return; }
      const res = apply(ready);
      if (!res.ok) { say(res.reason); return; }
      say('Restored. Reloading EYES…');
      setTimeout(() => location.reload(), 600);
    };
    area.focus();
  }
  expireUndo();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(mount, 0)); else setTimeout(mount, 0);

  root.EyesPassport = { VERSION, create, detect, open, read, plan, apply, undo, undoInfo, collect, summarize, mount, _validate: validate };
})(window);

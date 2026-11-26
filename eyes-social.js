/* EYES 4.0 · Friends, the Eye Dex and Play: the screens, and the glue to the living eye.
   Shared by Android and iPhone. Loads after launcher.js (needs window.Haven, HavenEye, EyesFriends, EyesDex).
   - A friend's signal becomes a visit: their eye peeks in (HavenFriend.visit) and the launcher's full-body
     Eye Contact reaction plays, exactly like the original single link.
   - Android: the native link (if any) is listed as a friend and keeps working; its signals are counted,
     and a nudge goes to the push relay so an iPhone friend gets buzzed. Invite links that arrive while
     the native link is busy become new friends here.
   - The Optic's Eye Contact row opens Friends; Eye Dex and Play rows are added under it. */
'use strict';
(function (root) {
  const $ = (id) => document.getElementById(id);
  const isWeb = !!root.EYES_WEB;
  const F = () => root.EyesFriends, X = () => root.EyesDex;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const ago = (t) => { if (!t) return ''; const m = Math.round((Date.now() - t) / 60000); if (m < 1) return 'just now'; if (m < 60) return m + ' min ago'; const h = Math.round(m / 60); if (h < 24) return h + ' h ago'; const d = Math.round(h / 24); return d + (d === 1 ? ' day ago' : ' days ago'); };
  const day = (t) => (t ? new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric', year: new Date(t).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' }) : '');
  const nameOf = (f) => f.nick || (f.profile && f.profile.name) || (f.peer ? 'Their Eye' : 'Waiting…');
  const native = (m, ...a) => { try { if (root.Phone && typeof Phone[m] === 'function') Phone[m](...a); } catch (e) {} };
  const react = (name) => { try { Haven.debug.habit(name); } catch (e) {} };

  // ---------- caption (one quiet line on the home screen) ----------
  function caption(text, ms = 4200) {
    let el = $('eyesCaption');
    if (!el) { el = document.createElement('p'); el.id = 'eyesCaption'; el.setAttribute('aria-live', 'polite'); document.body.appendChild(el); }
    el.textContent = text; el.classList.add('show'); clearTimeout(caption.t); caption.t = setTimeout(() => el.classList.remove('show'), ms);
  }

  // ---------- sheets ----------
  let sheet = null, sheetEyes = [], raf = 0, stack = [];
  function openSheet(title, render, opts = {}) {
    if (sheet && !opts.push && !opts.preserveStack) closeSheet(true);
    if (sheet && opts.push) stack.push(sheet.dataset.view);
    if (!sheet) {
      sheet = document.createElement('section'); sheet.id = 'eyesSheet'; sheet.setAttribute('role', 'dialog');
      sheet.innerHTML = '<header><button type="button" class="es-back" aria-label="Back">‹</button><h2></h2><button type="button" class="es-close" aria-label="Close">×</button></header><div class="es-body"></div>';
      document.body.appendChild(sheet);
      sheet.querySelector('.es-close').onclick = () => closeSheet();
      sheet.querySelector('.es-back').onclick = () => back();
    }
    sheet.dataset.view = opts.view || title;
    sheet.querySelector('h2').textContent = title;
    sheet.querySelector('.es-back').style.visibility = stack.length ? 'visible' : 'hidden';
    sheetEyes = [];
    const body = sheet.querySelector('.es-body'); body.innerHTML = ''; body.scrollTop = 0;
    render(body);
    tick();
  }
  const views = {};
  function back() { if (!sheet) return false; if (stack.length) { const v = stack.pop(); (views[v] || views.friends)(true); return true; } closeSheet(); return true; }
  function closeSheet() { if (sheet) { sheet.remove(); sheet = null; } stack = []; sheetEyes = []; cancelAnimationFrame(raf); raf = 0; }
  function liveEye(canvas, dna, opts = {}) {
    const e = new HavenEye(dna, canvas); e.resize();
    if (opts.look) { e.gaze.x = opts.look; e.target = { x: opts.look, y: 0 }; e._look = opts.look; }
    sheetEyes.push(e); return e;
  }
  function stillEye(canvas, dna) {             // drawn once (Dex grid: many eyes, no battery cost)
    const e = new HavenEye(dna, canvas); e.resize(); const t = performance.now() / 1000; e.step(t, 1 / 30); e.draw(t);
  }
  function tick() {
    cancelAnimationFrame(raf);
    if (!sheet || !sheetEyes.length) { raf = 0; return; }
    const t = performance.now() / 1000;
    for (const e of sheetEyes) {
      if (e.canvas.width < 10) e.resize();
      if (e._look && Math.random() < 0.006) e.setTarget(e._look, (Math.random() - 0.5) * 0.3);
      e.step(t, 1 / 30); e.draw(t);
    }
    raf = requestAnimationFrame(tick);
  }
  // Android back / Escape closes sheets first
  if (root.Haven && Haven.back) { const orig = Haven.back.bind(Haven); Haven.back = () => back() || (play() && play().active() ? (play().close(), true) : false) || orig(); }
  addEventListener('keydown', (e) => { if (e.key === 'Escape') back(); });
  const play = () => (root.Haven && Haven.debug && Haven.debug.play ? Haven.debug.play() : null);

  // ---------- the native (Android) link as a friend ----------
  function nativeFriend() {
    if (isWeb) return null;
    const d = Haven.diagnostics ? Haven.diagnostics().link : null;
    if (!d || !d.linked) return null;
    const p = root.HavenFriend && HavenFriend.profile ? HavenFriend.profile() : null;
    return { native: true, paired: d.paired, connection: d.connection, profile: p, stats: (F().native().stats) || {}, firsts: F().native().firsts || {} };
  }

  // ---------- Friends ----------
  // 4.1: Eye Contact 2.0 (eyes-contact.js) is the Friends screen. The list below stays as a fallback.
  views.friends = function (keep) {
    if (root.EyesContact && !keep) { closeSheet(); return EyesContact.open(); }
    openSheet('Eye Contact', (b) => {
      const list = F().list(), nat = nativeFriend(), paired = list.filter((f) => f.peer).length + (nat && nat.paired ? 1 : 0);
      if (paired > 1) {
        b.insertAdjacentHTML('beforeend', `<div class="es-all"><span>Send to everyone</span>${sigButtons('all')}</div>`);
      }
      const box = document.createElement('div'); box.className = 'es-list'; b.appendChild(box);
      if (nat) box.appendChild(friendRow(nat));
      list.filter((f) => f.peer).forEach((f) => box.appendChild(friendRow(f)));
      list.filter((f) => !f.peer).forEach((f) => box.appendChild(pendingRow(f)));
      if (!nat && !list.length) b.insertAdjacentHTML('beforeend', '<p class="es-empty">No friends yet. Eye Contact links two Eyes. No chat, no feed, just signals they feel from anywhere: a pulse, a spark, calm.</p>');
      b.insertAdjacentHTML('beforeend', `<div class="es-row"><button type="button" id="esInvite" class="es-primary">Invite a friend</button><button type="button" id="esJoinOpen">I have an invite</button></div>
        <div id="esJoin" hidden><textarea id="esJoinCode" rows="2" placeholder="Paste their invite (the HL1- code or the whole message)" autocomplete="off" spellcheck="false" aria-label="Invitation"></textarea>
        <div class="es-row"><button type="button" id="esPaste">Paste</button><button type="button" id="esJoinGo" class="es-primary">Join</button></div><p class="es-err" id="esJoinErr"></p></div>`);
      $('esInvite').onclick = async () => { const f = await F().invite(); views.friends(); shareInvite(f.code); };
      $('esJoinOpen').onclick = () => { $('esJoin').hidden = false; $('esJoinCode').focus(); };
      $('esPaste').onclick = async () => { try { $('esJoinCode').value = await navigator.clipboard.readText(); } catch (e) { $('esJoinCode').focus(); } };
      $('esJoinGo').onclick = async () => { try { await F().join($('esJoinCode').value); views.friends(); caption('Waiting for their Eye to answer…'); } catch (e) { $('esJoinErr').textContent = e.message; } };
      notifyBlock(b);
      b.querySelectorAll('[data-sig]').forEach((btn) => { btn.onclick = (e) => { e.stopPropagation(); sendFrom(btn); }; });
    }, { view: 'friends', push: false });
  };
  function sigButtons(target) {
    return `<span class="es-sigs">${['pulse', 'spark', 'calm'].map((k) => `<button type="button" data-sig="${k}" data-to="${esc(target)}" aria-label="Send a ${k}"><i class="es-g-${k}"></i></button>`).join('')}</span>`;
  }
  function sendFrom(btn) {
    const k = btn.dataset.sig, to = btn.dataset.to;
    let ok = false;
    if (to === 'all') { ok = F().sendAll(k); const nat = nativeFriend(); if (nat && nat.paired) { native('linkPulse', k); ok = true; } }
    else if (to === 'native') { native('linkPulse', k); ok = true; }
    else { const f = F().list().find((x) => x.code === to); if (f) ok = F().send(f, k); }
    if (ok) { btn.classList.add('sent'); setTimeout(() => btn.classList.remove('sent'), 900); }
  }
  function statusOf(f) {
    if (f.native) return f.paired ? 'Linked (your first Eye Contact)' : 'Waiting for them…';
    const pr = F().presence(f), c = F().connection(f);
    // 4.4: "awake now" only when it's confirmed (heard in the last 90 s); otherwise when it was last seen
    if (pr.tier === 'online') return 'awake now';
    if (pr.tier === 'recent' && pr.state !== 'offline') return 'here ' + ago(pr.lastSeen);
    if (pr.state === 'offline') return (pr.why === 'closed' ? 'closed EYES ' + ago(pr.since) : 'not open right now') + (f.lastSeen ? ' · last here ' + ago(f.lastSeen) : '');
    if (c === 'offline') return 'relay unreachable, retrying';
    return f.lastSeen ? 'can\'t tell right now · last here ' + ago(f.lastSeen) : 'linked';
  }
  function friendRow(f) {
    const row = document.createElement('div'); row.className = 'es-friend' + (!f.native && F().online(f) ? ' online' : '');
    const d = f.profile && HavenDNA.friendDNA(f.profile);
    row.innerHTML = `<canvas></canvas><div class="es-who"><b>${esc(f.native ? (d ? d.name : 'Their Eye') : nameOf(f))}</b><small>${esc(statusOf(f))}</small></div>${sigButtons(f.native ? 'native' : f.code)}`;
    if (d) liveEye(row.querySelector('canvas'), d); else row.querySelector('canvas').classList.add('es-unknown');
    row.onclick = (e) => { if (!e.target.closest('button')) friendDetail(f); };
    return row;
  }
  function pendingRow(f) {
    const row = document.createElement('div'); row.className = 'es-pending';
    row.innerHTML = `<div class="es-who"><b>${f.joined ? 'Connecting…' : 'Invite waiting'}</b><small>${f.joined ? 'Waiting for their Eye to answer' : 'Send this to them. It links when their Eye opens it.'}</small></div>
      ${f.joined ? '' : `<textarea rows="2" readonly>${esc(f.code)}</textarea>`}
      <div class="es-row">${f.joined ? '' : '<button type="button" data-a="share" class="es-primary">Share invite…</button><button type="button" data-a="copy">Copy</button>'}<button type="button" data-a="cancel" class="es-quiet">Cancel</button></div>`;
    row.querySelectorAll('[data-a]').forEach((b) => { b.onclick = async () => {
      if (b.dataset.a === 'share') shareInvite(f.code);
      else if (b.dataset.a === 'copy') { try { await navigator.clipboard.writeText(inviteText(f.code)); caption('Invite copied'); } catch (e) {} }
      else { F().remove(f); views.friends(); }
    }; });
    return row;
  }
  // 4.4.1: one wording everywhere, matching the buttons (eyes-contact.js builds the same message, with the iPhone link)
  const inviteText = (code) => (root.EyesContact && EyesContact.inviteText ? EyesContact.inviteText(code) : `Let our Eyes meet.\nIn EYES: Eye Contact → I have an invite → Paste → Join.\n\n${code}`);
  function shareInvite(code) { if (navigator.share) navigator.share({ text: inviteText(code) }).catch(() => {}); else navigator.clipboard && navigator.clipboard.writeText(inviteText(code)).then(() => caption('Invite copied: send it to them'), () => {}); }

  function friendDetail(f, refreshing) {
    views['friend:' + (f.code || 'native')] = () => friendDetail(f);
    openSheet(f.native ? 'Your first Eye Contact' : nameOf(f), (b) => {
      const mine = HavenDNA.dna(), d = f.profile && HavenDNA.friendDNA(f.profile);
      b.insertAdjacentHTML('beforeend', `<div class="es-pair"><figure><canvas></canvas><figcaption>${esc(mine.name)}<small>you</small></figcaption></figure><span class="es-link">⟷</span>
        <figure><canvas></canvas><figcaption>${esc(d ? d.name : '…')}<small>${d ? esc(d.words.join(' · ')) : 'introducing itself'}</small></figcaption></figure></div>`);
      const cv = b.querySelectorAll('.es-pair canvas');
      liveEye(cv[0], mine, { look: 0.6 }); if (d) liveEye(cv[1], d, { look: -0.6 });
      b.insertAdjacentHTML('beforeend', `<p class="es-status">${esc(statusOf(f))}</p><div class="es-big-sigs">${sigButtons(f.native ? 'native' : f.code)}</div>`);
      const s = f.stats || {}, firsts = f.firsts || {};
      const facts = [
        ['Linked since', day(f.native ? F().native().since : f.pairedAt || f.addedAt)],
        ['Signals traded', `${(s.sent || 0) + (s.recv || 0)} (you sent ${s.sent || 0})`],
        ['This week', f.native ? '' : `${(s.weekOf ? (s.wsent || 0) + (s.wrecv || 0) : 0)}`],
        ['Resonances', String(s.resonances || 0)],
        ['First resonance', firsts.resonance ? day(firsts.resonance) : 'not yet'],
        ['Their Eye', d ? `${d.tier[0].toUpperCase() + d.tier.slice(1)} · ${d.pal.id} · ${d.pupil.name.toLowerCase()} pupil` : '']
      ].filter((x) => x[1]);
      b.insertAdjacentHTML('beforeend', `<dl class="es-facts">${facts.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`);
      if (!f.native && f.missed && f.missed.length) {
        b.insertAdjacentHTML('beforeend', `<div class="es-missed"><b>While you were away</b>${f.missed.slice().reverse().map((m) => `<div>${esc(m.k)} · ${esc(ago(m.t))}</div>`).join('')}</div>`);
        F().clearMissed(f);
      }
      if (!d && !f.native) {
        b.insertAdjacentHTML('beforeend', '<p class="es-note">Your friend is connected, but their Eye has not introduced itself yet. Keep EYES open on both phones for a moment.</p><div class="es-row"><button type="button" id="esRefreshProfile">Ask their Eye to try again</button></div>');
        $('esRefreshProfile').onclick = () => { F().refreshProfile(f); caption('Asking their Eye to introduce itself…'); };
      }
      if (f.native) {
        b.insertAdjacentHTML('beforeend', '<div class="es-row"><button type="button" id="esNativeManage">Manage this link</button></div>');
        $('esNativeManage').onclick = () => { closeSheet(); const o = $('linkOpen'); if (o) { o.dataset.eyesPass = '1'; o.click(); } };
      } else {
        b.insertAdjacentHTML('beforeend', '<div class="es-row"><button type="button" id="esRename">Nickname</button><button type="button" id="esRemove" class="es-danger">Remove friend</button></div>');
        $('esRename').onclick = () => { const box = document.createElement('div'); box.innerHTML = `<input id="esNick" maxlength="24" placeholder="${esc(nameOf(f))}"><div class="es-row"><button type="button" id="esNickGo" class="es-primary">Save</button></div>`; b.appendChild(box); $('esNick').focus(); $('esNickGo').onclick = () => { F().rename(f, $('esNick').value); friendDetail(f); }; };
        const rm = $('esRemove'); rm.onclick = () => { if (rm.dataset.sure) { F().remove(f); back(); return; } rm.dataset.sure = 1; rm.textContent = 'Tap again to remove'; setTimeout(() => { rm.dataset.sure = ''; rm.textContent = 'Remove friend'; }, 3000); };
      }
      b.querySelectorAll('[data-sig]').forEach((btn) => { btn.onclick = () => sendFrom(btn); });
    }, { view: 'friend:' + (f.code || 'native'), push: !refreshing, preserveStack: !!refreshing });
    if (!refreshing && !f.native && !f.profile) F().refreshProfile(f);
  }

  // ---------- notifications + connections ----------
  function notifyBlock(b, after) {
    const redo = after || (() => views.friends());
    const P = root.EyesPush; if (!P) return;
    const s = P.state();
    if (s.canReceive && s.server) {
      b.insertAdjacentHTML('beforeend', `<div class="es-setting"><span>Buzz me when they reach out<small>${s.on ? 'On. A signal from a friend shows up on your lock screen.' : 'A soft notification when a friend sends a signal and EYES is closed.'}</small></span><button type="button" id="esNotify">${s.on ? 'Turn off' : 'Turn on'}</button></div><p class="es-err" id="esNotifyErr"></p>`);
      $('esNotify').onclick = async () => { try { if (s.on) await P.disable(); else await P.enable(); redo(); } catch (e) { $('esNotifyErr').textContent = e.message; } };
    } else if (s.canReceive && !s.server && isWeb) {
      // no push relay is deployed yet: nothing to switch on, so nothing is offered
    } else if (isWeb && !s.standalone) {
      b.insertAdjacentHTML('beforeend', '<p class="es-note">Open EYES from your Home Screen to get notifications.</p>');
    }
    // 4.4.1: what to expect from signals, in plain words (eyes-friends.js: the relay keeps a signal for up to 12 h)
    b.insertAdjacentHTML('beforeend', `<p class="es-note es-delivery">${esc(DELIVERY_NOTE())}</p>`);
    if (!isWeb) {   // Android: advanced, normally untouched. The website comes built in (eyes-config.js).
      const builtIn = !!(root.EYES_CONFIG && root.EYES_CONFIG.site);
      b.insertAdjacentHTML('beforeend', `<details class="es-conn"><summary>Advanced connection settings</summary>
        <p class="es-note">EYES sets these up for you. You don't need to change anything here.</p>
        ${builtIn ? `<p class="es-note">Eye.D. card and invite links open: <span class="es-mono">${esc(X().site())}</span></p>` : `<label>EYES website (for card and invite links)<input id="esSite" placeholder="https://…" value="${esc(X().site())}" autocomplete="off" spellcheck="false"></label>`}
        <label>Notification relay (optional)<input id="esRelay" placeholder="Not set up" value="${esc(P.server())}" autocomplete="off" spellcheck="false"></label>
        <div class="es-row"><button type="button" id="esConnSave">Save</button></div><p class="es-err" id="esConnErr" role="status"></p>
        <p class="es-note">A notification relay isn't available yet, so leave this empty. Without one, signals still reach friends the next time they open EYES.</p></details>`);
      $('esConnSave').onclick = () => {
        try {
          P.setServer($('esRelay').value);
          if (!builtIn) { const s2 = $('esSite').value.trim(); if (s2 && !/^https:\/\//.test(s2)) throw new Error('The website starts with https://'); s2 ? localStorage.setItem('eyes.site', s2) : localStorage.removeItem('eyes.site'); }
          $('esConnErr').textContent = 'Saved.';
        } catch (e) { $('esConnErr').textContent = e.message; }
      };
    }
  }
  // Shared by the Eye Contact screens: honest about the relay's 12-hour window and the missing iPhone push alerts.
  const DELIVERY_NOTE = () => 'Signals can wait up to 12 hours for a friend who isn\u2019t in EYES, and arrive when they open it. Delivery isn\u2019t guaranteed, and iPhone alerts while EYES is closed aren\u2019t available yet.';

  // ---------- Eye Dex ----------
  views.dex = function () {
    openSheet('Eye Dex', (b) => {
      const c = X().checklist(), list = X().list();
      b.insertAdjacentHTML('beforeend', `<div class="es-tabs"><button type="button" data-tab="eyes" class="on">Eyes · ${list.length}</button><button type="button" data-tab="traits">Traits · ${c.got}/${c.total}</button><button type="button" data-tab="card">My card</button></div><div id="esTab"></div>`);
      const tabs = b.querySelectorAll('.es-tabs button'), host = $('esTab');
      const show = (tab) => { tabs.forEach((t) => t.classList.toggle('on', t.dataset.tab === tab)); host.innerHTML = ''; sheetEyes = []; ({ eyes: dexEyes, traits: dexTraits, card: dexCard })[tab](host); tick(); };
      tabs.forEach((t) => { t.onclick = () => show(t.dataset.tab); });
      show(views.dex.tab || 'eyes'); views.dex.tab = null;
    }, { view: 'dex' });
  };
  function dexEyes(host) {
    const list = X().list();
    if (!list.length) host.insertAdjacentHTML('beforeend', '<p class="es-empty">Every Eye you meet lands here: friends you link with, and anyone you swap Eye.D. cards with. Swap cards under <b>My card</b>.</p>');
    const grid = document.createElement('div'); grid.className = 'es-grid'; host.appendChild(grid);
    list.forEach((e) => {
      const cell = document.createElement('button'); cell.type = 'button'; cell.className = 'es-cell';
      cell.innerHTML = `<canvas></canvas><b>${esc(e.dna.name)}</b><small class="t-${e.dna.tier}">${esc(e.dna.tier)}</small>`;
      grid.appendChild(cell); requestAnimationFrame(() => stillEye(cell.querySelector('canvas'), e.dna));
      cell.onclick = () => dexDetail(e);
    });
  }
  function dexDetail(e) {
    views['dex:' + e.p.seed] = () => dexDetail(e);
    openSheet(e.dna.name, (b) => {
      const d = e.dna;
      b.insertAdjacentHTML('beforeend', `<div class="es-hero"><canvas></canvas></div><p class="es-words">${esc(d.words.join(' · '))}</p>`);
      liveEye(b.querySelector('.es-hero canvas'), d);
      const st = HavenDNA.STAGES[d.stage || 0].name + (d.branch ? ' · ' + HavenDNA.BRANCHES[d.branch].name : '');
      const facts = [['Rarity', d.tier[0].toUpperCase() + d.tier.slice(1)], ['Color', d.pal.id], ['Pattern', d.pattern.name], ['Pupil', d.pupil.name], ['Rare traits', (d.rare || []).map((t) => t.name).join(', ') || 'none'], ['Stage', st],
        ['Met', `${day(e.met)} · ${e.how === 'linked' ? 'Eye Contact' : 'swapped cards'}`], ['Origin', HavenDNA.lib.originLine(d, e.p.born) || '']].filter((x) => x[1]);
      b.insertAdjacentHTML('beforeend', `<dl class="es-facts">${facts.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`);
      if (e.how !== 'linked') {
        b.insertAdjacentHTML('beforeend', '<div class="es-row"><button type="button" id="esDexRm" class="es-danger">Remove from Dex</button></div>');
        const rm = $('esDexRm'); rm.onclick = () => { if (rm.dataset.sure) { X().remove(e.p.seed); back(); return; } rm.dataset.sure = 1; rm.textContent = 'Tap again to remove'; };
      }
    }, { view: 'dex:' + e.p.seed, push: true });
  }
  function dexTraits(host) {
    const c = X().checklist();
    host.insertAdjacentHTML('beforeend', `<div class="es-progress"><i></i></div><p class="es-sub">${c.got} of ${c.total} traits seen across ${c.eyes} Eye${c.eyes === 1 ? '' : 's'} (yours included).</p>`);
    host.querySelector('.es-progress i').style.width = Math.round((c.got / c.total) * 100) + '%';
    c.groups.forEach((g) => {
      host.insertAdjacentHTML('beforeend', `<h3 class="es-h">${esc(g.title)} <small>${g.items.filter((i) => i.seen).length}/${g.items.length}</small></h3><div class="es-chips">${g.items.map((i) => `<span class="${i.seen ? 'seen' : ''} r${i.rarity}">${i.seen ? esc(i.name) : i.rarity >= 2 ? '???' : esc(i.name)}</span>`).join('')}</div>`);
    });
  }
  function dexCard(host) {
    const card = X().myCard(), link = X().cardLink(card), mine = HavenDNA.dna();
    host.insertAdjacentHTML('beforeend', `<p class="es-sub">Show this to someone with EYES, or send it. Their Eye joins your Dex when you add theirs.</p>
      <div class="es-card"><canvas class="es-qr"></canvas><div><b>${esc(mine.name)}</b><small>${esc(mine.tier)} · ${esc(mine.words.join(' · '))}</small></div></div>
      <div class="es-row"><button type="button" id="esCardShare" class="es-primary">Share my card…</button><button type="button" id="esCardCopy">Copy</button></div>
      <h3 class="es-h">Add someone's card</h3><textarea id="esCardIn" rows="2" placeholder="Paste their card (EYE1.… or the link)" autocomplete="off" spellcheck="false"></textarea>
      <div class="es-row"><button type="button" id="esCardPaste">Paste</button><button type="button" id="esCardAdd" class="es-primary">Add to Dex</button></div><p class="es-err" id="esCardErr"></p>`);
    try { EyesQR.paint(host.querySelector('.es-qr'), link, { size: 220, fg: '#0b1216', bg: '#e8f4f5' }); } catch (e) {}
    const text = `Here's my Eye from EYES: ${mine.name}. Add it to your Eye Dex:\n${link}`;
    $('esCardShare').onclick = () => { if (navigator.share) navigator.share({ text }).catch(() => {}); else $('esCardCopy').onclick(); };
    $('esCardCopy').onclick = async () => { try { await navigator.clipboard.writeText(text); caption('Card copied'); } catch (e) {} };
    $('esCardPaste').onclick = async () => { try { $('esCardIn').value = await navigator.clipboard.readText(); } catch (e) { $('esCardIn').focus(); } };
    $('esCardAdd').onclick = () => addCard($('esCardIn').value, (m) => { $('esCardErr').textContent = m; });
  }
  function addCard(text, err) {
    const p = X().readCard(text);
    if (!p) return err && err("That doesn't look like an Eye.D. card");
    if (HavenDNA.has() && HavenDNA.profile().seed === p.seed) return err && err("That's your own Eye");
    const had = X().has(p.seed), e = X().add(p, 'card');
    if (!e) return err && err('Could not add that card');
    const d = HavenDNA.friendDNA(p);
    caption(had ? `${d.name} is already in your Dex` : `${d.name} joined your Eye Dex`);
    if (!had) { try { HavenFriend.visit(p, 6000); Haven.receive({ type: 'havenLink', event: 'incoming', kind: 'spark', _eyes: 1 }); } catch (er) {} }
    views.dex.tab = 'eyes'; views.dex();
    return true;
  }

  // ---------- Play ----------
  views.play = function (sheetOnly) {
    // 4.6.6: Play lives on the Ability Satellite now; The Optic's row opens that same Play. The old sheet stays as a fallback.
    if (!sheetOnly && root.EyesPlaytime) { closeSheet(); if (EyesPlaytime.open('optic')) return; }
    openSheet('Play', (b) => {
      const r = play() ? play().record() : { wins: 0, losses: 0, best: 0 };
      b.insertAdjacentHTML('beforeend', `<button type="button" class="es-game" id="esLight"><b>Chase the light</b><span>Drag a little light around and flick it. Your Eye can't help itself.</span></button>
        <button type="button" class="es-game" id="esStare"><b>Staring contest</b><span>Hold your finger on its eye. Whoever blinks first loses.${r.wins + r.losses ? ` You ${r.wins} · it ${r.losses}.` : ''}</span></button>`);
      $('esLight').onclick = () => { closeSheet(); setTimeout(() => play() && play().startLight(), 120); };
      $('esStare').onclick = () => { closeSheet(); setTimeout(() => play() && play().startStare(), 120); };
    }, { view: 'play' });
  };

  // ---------- The Optic rows ----------
  function mountOptic() {
    const link = $('linkOpen'); if (!link || $('dexOpen')) return;
    const label = link.querySelector('span'); if (label && label.firstChild) label.firstChild.textContent = 'Eye Contact';
    const status = $('linkSettingsStatus'); if (status) status.textContent = 'Eye Contact with the Eyes you know';
    // the Friends screen replaces the single-link sheet (still reachable for the native link)
    link.addEventListener('click', (e) => { if (link.dataset.eyesPass) { delete link.dataset.eyesPass; return; } e.stopImmediatePropagation(); e.preventDefault(); views.friends(); }, true);
    const mk = (id, title, small, fn) => { const b = document.createElement('button'); b.id = id; b.type = 'button'; b.className = 'setting'; b.innerHTML = `<span>${title}<small>${small}</small></span><span aria-hidden="true">›</span>`; b.onclick = fn; return b; };
    const dex = mk('dexOpen', 'Eye Dex', 'Every Eye you’ve met, and the traits you’ve seen', () => views.dex());
    const pl = mk('playOpen', 'Play', 'Staring contest · firefly · catch · peekaboo · company', () => views.play());
    link.insertAdjacentElement('afterend', dex); dex.insertAdjacentElement('afterend', pl);
    mountExtras();
  }

  // ---------- 4.4.1 · Share EYES and Report a problem (The Optic) ----------
  // Share EYES sends only the public download page. Never an invite, an Eye.D. card or anything about this Eye.
  const GET_URL = 'https://lilrichie96-hub.github.io/EYES_iPhone/get/';
  // 4.4.1: where problem reports go (chosen by the developer for the tester period)
  const SUPPORT_EMAIL = 'lilrichie96@gmail.com';
  const SHARE_EYES_TEXT = `Meet EYES — a little life inside your phone. Get your own Eye: ${GET_URL}`;
  // Android: a native share sheet only if this build's bridge has one (Phone.shareText, not in 4.4.1's native code).
  // iPhone: the Web Share API. Otherwise: copy.
  const nativeShare = () => !!(root.Phone && typeof Phone.shareText === 'function');
  const canShare = () => nativeShare() || !!navigator.share;
  async function copyText(text) {
    try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(text); return true; } } catch (e) {}
    return false;
  }
  async function shareOut(text, files) {
    if (nativeShare() && !(files && files.length)) { try { Phone.shareText(text); return 'shared'; } catch (e) {} }
    if (navigator.share) {
      const data = { text };
      if (files && files.length && navigator.canShare && navigator.canShare({ files })) data.files = files;
      try { await navigator.share(data); return 'shared'; } catch (e) { if (e && e.name === 'AbortError') return 'cancelled'; }
    }
    return (await copyText(text)) ? 'copied' : 'manual';
  }
  views.shareEyes = function () {
    openSheet('Share EYES', (b) => {
      b.insertAdjacentHTML('beforeend', `<p class="es-sub">Send someone the EYES download page so they can get an Eye of their own. This shares only the public link, never your Eye, your Eye.D. card or an Eye Contact invite.</p>
        <textarea id="esShareText" class="es-plain" rows="3" readonly aria-label="Message to share">${esc(SHARE_EYES_TEXT)}</textarea>
        <div class="es-row">${canShare() ? '<button type="button" id="esShareGo" class="es-primary">Share…</button>' : ''}<button type="button" id="esShareCopy"${canShare() ? '' : ' class="es-primary"'}>Copy link</button></div>
        <p class="es-err" id="esShareMsg" role="status"></p>`);
      const msg = (t) => { $('esShareMsg').textContent = t; };
      const sel = () => { const t = $('esShareText'); t.focus(); t.select(); };
      if ($('esShareGo')) $('esShareGo').onclick = async () => { const r = await shareOut(SHARE_EYES_TEXT); if (r === 'copied') msg('Copied. Paste it anywhere.'); else if (r === 'manual') { msg('Select the text above and copy it.'); sel(); } };
      $('esShareCopy').onclick = async () => { if (await copyText(GET_URL)) msg('Link copied. Paste it anywhere.'); else { msg('Select the text above and copy it.'); sel(); } };
    }, { view: 'shareEyes' });
  };

  // A report is only what the person writes plus a few plain facts they can see and switch off.
  // Never: notifications, invites, Eye.D. cards, passports, friends, names or logs.
  function deviceFacts() {
    const ua = navigator.userAgent || '', facts = [];
    const app = root.EYES_APP || {};
    const shown = (document.querySelector('.version') || {}).textContent || '';
    facts.push(['App', (app.version ? 'EYES ' + app.version : shown.trim() || 'EYES') + (app.build ? ` (Build ${app.build})` : '')]);
    const and = ua.match(/Android\s([\d.]+)(?:;\s*([^;)]+?))?(?:\sBuild\/|\)|;)/);
    const ios = ua.match(/(?:iPhone|iPad|CPU) OS (\d+(?:_\d+)*)/);
    if (!isWeb) facts.push(['Platform', 'Android app']);
    else facts.push(['Platform', 'iPhone web app' + ((matchMedia('(display-mode: standalone)').matches || navigator.standalone) ? ' (Home Screen)' : ' (in the browser)')]);
    if (and) { facts.push(['Android', and[1]]); const m = (and[2] || '').trim(); if (m && !/^(K|wv|Linux|U)$/.test(m)) facts.push(['Device', m]); }
    else if (ios) facts.push(['iOS', ios[1].replace(/_/g, '.')]);
    const ch = ua.match(/Chrome\/([\d.]+)/), sf = ua.match(/Version\/([\d.]+).*Safari/);
    if (ch) facts.push([isWeb ? 'Browser' : 'WebView', 'Chrome ' + ch[1].split('.')[0]]); else if (sf) facts.push(['Browser', 'Safari ' + sf[1]]);
    facts.push(['Screen', `${screen.width}×${screen.height} @${(devicePixelRatio || 1).toFixed(2).replace(/\.?0+$/, '')}x`]);
    return facts;
  }
  function reportText(what, withFacts) {
    const lines = ['EYES problem report', '', (what || '').trim() || '(no description)'];
    if (withFacts) { lines.push(''); deviceFacts().forEach(([k, v]) => lines.push(`${k}: ${v}`)); }
    lines.push('', `Sent ${new Date().toISOString().slice(0, 10)}`);
    return lines.join('\n');
  }
  views.report = function () {
    openSheet('Report a problem', (b) => {
      const pickFiles = isWeb && !!(navigator.canShare && root.File) && (() => { try { return navigator.canShare({ files: [new File([''], 'x.png', { type: 'image/png' })] }); } catch (e) { return false; } })();
      b.insertAdjacentHTML('beforeend', `<p class="es-sub">Tell us what isn't working. EYES puts your words together with the details below, and you send it yourself. Nothing is sent automatically.</p>
        <textarea id="esRepWhat" class="es-plain" rows="5" maxlength="2000" placeholder="What happened, and what were you doing just before?" aria-label="What happened"></textarea>
        <label class="es-check"><input type="checkbox" id="esRepFacts" checked> Include app and device details</label>
        <dl class="es-facts es-repfacts" id="esRepFactsList">${deviceFacts().map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
        ${pickFiles ? '<label class="es-check es-file">Screenshot (optional)<input type="file" id="esRepShot" accept="image/*"></label>' : '<p class="es-note">To include a screenshot, attach it yourself in the app you send this with.</p>'}
        <div class="es-row">${isWeb ? `<a id="esRepMail" class="es-btn es-primary" role="button" href="mailto:${SUPPORT_EMAIL}">Email report</a>` : ''}${canShare() ? '<button type="button" id="esRepShare">Share report…</button>' : ''}<button type="button" id="esRepCopy"${isWeb || canShare() ? '' : ' class="es-primary"'}>Copy report</button></div>
        <p class="es-err" id="esRepMsg" role="status"></p>
        <p class="es-note es-sendto">${isWeb ? 'Reports go to' : 'Copy the report, then paste it into an email to'} <span class="es-mono">${SUPPORT_EMAIL}</span></p>
        <div class="es-row"><button type="button" id="esRepAddr" class="es-quiet">Copy email address</button></div>
        <p class="es-note">A report never includes your notifications, invites, Eye.D. card, Eye Passport or friends.</p>`);
      const facts = $('esRepFacts'), list = $('esRepFactsList'), msg = (t) => { $('esRepMsg').textContent = t; };
      facts.onchange = () => { list.hidden = !facts.checked; };
      const text = () => reportText($('esRepWhat').value, facts.checked);
      const ready = () => { if ($('esRepWhat').value.trim()) return true; msg('Add a few words about what happened first.'); $('esRepWhat').focus(); return false; };
      if ($('esRepShare')) $('esRepShare').onclick = async () => {
        if (!ready()) return;
        const shot = $('esRepShot') && $('esRepShot').files && $('esRepShot').files[0];
        const r = await shareOut(text(), shot ? [shot] : null);
        if (r === 'copied') msg(`Report copied. Paste it into an email to ${SUPPORT_EMAIL}.`); else if (r === 'manual') msg("Couldn't copy automatically. Select the text and copy it."); else if (r === 'shared') msg('Thanks. That helps.');
      };
      // iPhone: Mail opens with the report filled in. (Not on Android: the 4.4.1 WebView has no verified mailto handling.)
      if ($('esRepMail')) $('esRepMail').onclick = (e) => {
        if (!ready()) { e.preventDefault(); return; }
        const shot = $('esRepShot') && $('esRepShot').files && $('esRepShot').files[0];
        $('esRepMail').href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('EYES problem report')}&body=${encodeURIComponent(text())}`;
        msg(shot ? 'Opening Mail. To include your screenshot, use Share report and choose Mail instead.' : 'Opening Mail…');
      };
      $('esRepAddr').onclick = async () => { msg((await copyText(SUPPORT_EMAIL)) ? 'Email address copied.' : `The address is ${SUPPORT_EMAIL}`); };
      $('esRepCopy').onclick = async () => {
        if (!ready()) return;
        if (await copyText(text())) msg(`Report copied. Paste it into an email to ${SUPPORT_EMAIL}.`);
        else { const t = $('esRepWhat'); t.value = text(); t.focus(); t.select(); msg('Select the text and copy it.'); }
      };
    }, { view: 'report' });
  };
  function mountExtras() {
    if ($('shareEyesOpen')) return;
    const mk = (id, title, small, fn) => { const b = document.createElement('button'); b.id = id; b.type = 'button'; b.className = 'setting'; b.innerHTML = `<span>${title}<small>${small}</small></span><span class="row-go" aria-hidden="true"></span>`; b.onclick = fn; return b; };
    const head = document.createElement('h2'); head.className = 'optic-group'; head.textContent = 'Share & feedback';
    const share = mk('shareEyesOpen', 'Share EYES', 'Send someone the download page', () => views.shareEyes());
    const rep = mk('reportOpen', 'Report a problem', 'Tell us what isn’t working', () => views.report());
    const colophon = document.querySelector('#settings .optic-colophon');
    if (colophon) { colophon.before(head, share, rep); return; }
    const after = $('playOpen') || $('dexOpen'); if (after) after.after(share, rep);
  }

  // ---------- glue: friends → the living eye ----------
  function visit(f, ms) { if (f && f.profile && root.HavenFriend) HavenFriend.visit(f.profile, ms || 9000); }
  function boot() {
    const Fr = F(); if (!Fr) return;
    Fr.on('incoming', (f, kind) => { visit(f); Haven.receive({ type: 'havenLink', event: 'incoming', kind, _eyes: 1 }); if (sheet && sheet.dataset.view === 'friends') views.friends(true); });
    Fr.on('outgoing', (f, kind) => { visit(f); Haven.receive({ type: 'havenLink', event: 'outgoing', kind, _eyes: 1 }); });
    const contact = () => !!(root.EyesContact && EyesContact.isOpen());
    Fr.on('paired', (f) => { if (!contact()) caption('Eye Contact made'); react('link-hello'); if (sheet && sheet.dataset.view === 'friends') views.friends(true); });
    Fr.on('profile', (f, first) => {
      if (first) { visit(f, 6000); react('link-hello'); if (!contact()) caption(`${f.profile.name || 'Their Eye'} is looking back`); }
      if (sheet && sheet.dataset.view === 'friends') views.friends(true);
      else if (sheet && sheet.dataset.view === 'friend:' + (f.code || 'native')) friendDetail(f, true);
    });
    Fr.on('here', (f) => { if (document.visibilityState === 'visible' && f.profile && !(sheet) && !contact() && !(root.EyesVisits && EyesVisits.active())) { visit(f, 5000); react('peek'); caption(`${nameOf(f)} is here`, 3000); } });
    Fr.on('missed', () => setTimeout(awayReport, 900));
    Fr.on('change', () => { if (sheet && sheet.dataset.view === 'friends') { clearTimeout(boot.t); boot.t = setTimeout(() => sheet && sheet.dataset.view === 'friends' && views.friends(true), 300); } });
    Fr.restore().then(() => setTimeout(awayReport, 2600));
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') setTimeout(awayReport, 2200); });
  }
  const reported = {};
  function awayReport() {
    if (document.visibilityState !== 'visible' || !HavenDNA.has()) return;
    if (root.EyesContact && EyesContact.isOpen()) return;          // the Meeting Space replays them itself
    if (root.EyesVisits) return;                                   // 4.4: their Eye comes by instead (eyes-visits.js)
    const fresh = (f) => (f.missed || []).filter((m) => m.t > (reported[f.code] || 0));
    const withMissed = F().list().filter((f) => fresh(f).length);
    if (!withMissed.length) return;
    const f = withMissed[0], n = withMissed.reduce((a, x) => a + fresh(x).length, 0), last = fresh(f).slice(-1)[0];
    caption(n === 1 ? `${nameOf(f)} sent a ${last.k} · ${ago(last.t)}` : `${n} signals while you were away`);
    visit(f); Haven.receive({ type: 'havenLink', event: 'incoming', kind: last.k, _eyes: 1 });
    withMissed.forEach((x) => { reported[x.code] = Math.max(...x.missed.map((m) => m.t)); });   // still listed on their page until it's opened
  }

  // ---------- Android: the native link's signals, its push mailbox, invites ----------
  if (!isWeb && root.Haven) {
    const orig = Haven.receive.bind(Haven);
    let wantCode = false;
    Haven.receive = (data) => {
      if (data && data.type === 'havenLink' && !data._eyes) {
        if (data.event === 'code' && wantCode) { wantCode = false; setNativeCode(data.code); return true; }
        if (data.event === 'incoming') F().countNative('recv', data.kind);
        if (root.EyesContact && ['incoming', 'outgoing', 'error'].includes(data.event)) EyesContact.nativeEvent(data.event, data.kind);
        if (data.event === 'status' || data.event === 'paired' || data.event === 'profile') setTimeout(() => { try { dispatchEvent(new CustomEvent('haven:friend')); } catch (e) {} }, 50);
        if (data.event === 'outgoing') { F().countNative('sent', data.kind); if (root.EYES_NATIVE_MAILBOX && root.EyesPush) EyesPush.nudge(root.EYES_NATIVE_MAILBOX, '0'.repeat(32), data.kind); }
        if (data.event === 'status' && data.linked && !root.EYES_NATIVE_CODE) { wantCode = true; native('linkShowCode'); }
        if (data.event === 'paired' && root.EYES_NATIVE_CODE) setNativeCode(root.EYES_NATIVE_CODE);
        // 4.2.2: the native link ended: its upgraded companion rests too (the friendship history stays)
        if (data.event === 'status' && !data.linked && root.EYES_NATIVE_CODE) { root.EYES_NATIVE_CODE = null; root.EYES_NATIVE_MAILBOX = null; F().upgradeNative(null); }
        if (data.event === 'invite') {                     // a friend's invite link while the native link is taken: a new friend
          const d = Haven.diagnostics().link;
          if (F().findCode(data.code)) { F().join(data.code).then((nf) => { if (root.EyesContact) EyesContact.joining(nf.code); else { views.friends(); caption('Connecting with your new friend…'); } }, (e) => caption(e.message)); return true; }
        }
      }
      return orig(data);
    };
    async function setNativeCode(code) {
      if (!/^HL1-[A-Za-z0-9_-]{43}$/.test(code || '')) return;
      root.EYES_NATIVE_CODE = code;
      const raw = Uint8Array.from(atob(code.slice(4).replace(/-/g, '+').replace(/_/g, '/') + '='), (c) => c.charCodeAt(0));
      const pre = new TextEncoder().encode('EYES-PUSH-1'), buf = new Uint8Array(pre.length + raw.length); buf.set(pre); buf.set(raw, pre.length);
      const h = new Uint8Array(await crypto.subtle.digest('SHA-256', buf));
      root.EYES_NATIVE_MAILBOX = Array.from(h.slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('');
      // 4.2.2: a secure upgrade path for the original link, derived from the secret both phones already share
      const d = Haven.diagnostics().link;
      if (d && d.linked) {
        try {
          if (await F().upgradeNative(code)) native('linkUnlink');
        } catch (e) { caption('Your earlier link is still on this phone. You can make a new Firebase invitation in Eye Contact.'); }
      }
    }
    setTimeout(() => { const d = Haven.diagnostics().link; if (d && d.linked && !root.EYES_NATIVE_CODE) { wantCode = true; native('linkShowCode'); } }, 2500);
  }

  // ---------- go ----------
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { mountOptic(); boot(); }); else { mountOptic(); boot(); }
  root.EyesSocial = { friends: () => views.friends(), dex: () => views.dex(), play: () => views.play(), addCard, close: closeSheet, caption, notifyBlock,
    shareEyes: () => views.shareEyes(), report: () => views.report(), deliveryNote: () => DELIVERY_NOTE(), _report: { reportText, deviceFacts, SHARE_EYES_TEXT, GET_URL, SUPPORT_EMAIL },
    list: () => { closeSheet(); views.friends(true); } };
})(window);


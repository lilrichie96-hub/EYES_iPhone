'use strict';
// HAVEN LINK: a nonverbal two-eye connection. No text messages, social graph,
// microphone, contacts, location, analytics, or background network listener.
// Native HavenLink holds the pairing secret and performs all encrypted transport.
window.createHavenLinkUI = function ({
  $,
  native,
  core,
  iris,
  now,
  openPanel,
  getPanel,
  draw,
  schedule
}) {
  const state = {
    linked: false,
    paired: false,
    connection: 'off',
    lastEvent: null,
    lastKind: null,
    received: 0,
    sent: 0
  };
  let code = '',
    gesture = null,
    unpairUntil = 0;
  const valid = ['pulse', 'spark', 'calm'];
  // A pairing code can arrive inside a whole message ("join me! HL1-…"); find it wherever it is.
  const CODE = /HL1-[A-Za-z0-9_-]{43}/;
  const findCode = (text) => (String(text || '').match(CODE) || [null])[0];
  const canShare = () => typeof window.Phone?.linkShareCode === 'function';
  const $feedback = $('linkFeedback');
  function feedback(message) {
    $feedback.textContent = window.EyesBrand ? EyesBrand.text(message) : message;
  }
  function statusText() {
    if (!state.linked) return 'No Eye Contact yet';
    if (!state.paired)
      return state.connection === 'offline'
        ? 'Waiting for Eye Contact · Relay unavailable'
        : 'Waiting for Eye Contact';
    if (state.connection === 'online') return 'Eye Contact established';
    if (state.connection === 'connecting') return 'Eye Contact · Reconnecting';
    if (state.connection === 'sleeping') return 'Eye Contact · Resting';
    return 'Eye Contact · Network unavailable';
  }
  function render() {
    $('linkSettingsStatus').textContent = state.linked
      ? state.paired
        ? 'Established with a friend’s Eye'
        : 'Waiting for Eye Contact'
      : 'A private signal between two Eyes';
    $('linkConnection').textContent = statusText();
    // Drives the two-eye glyph in the sheet head: apart, waiting, or looking at each other.
    $('linkSheet').dataset.contact = state.linked ? (state.paired ? 'made' : 'waiting') : 'none';
    $('linkUnpaired').hidden = state.linked;
    $('linkConnected').hidden = !state.linked;
    for (const id of ['linkSendPulse', 'linkSendSpark', 'linkSendCalm'])
      $(id).disabled = !state.paired;
  }
  function reactSignal(kind, direction) {
    const t = now();
    const incoming = direction === 'incoming';
    const name =
      kind === 'resonance'
        ? 'link-resonance'
        : kind === 'spark'
          ? incoming
            ? 'link-spark-in'
            : 'link-spark-out'
          : kind === 'calm'
            ? incoming
              ? 'link-calm-in'
              : 'link-calm-out'
            : incoming
              ? 'link-receive'
              : 'link-send';
    // Never steal an urgent phone call/alarm animation.
    if (core.mode !== 'alert' || t >= core.until) {
      // He notices first: a glance toward the friend's side, just before the signal arrives.
      if (incoming) core.aim(-0.55, -0.7, t, 240);
      core.react(name, t);
    }
    state.lastEvent = direction;
    state.lastKind = kind;
    if (incoming) state.received++;
    else state.sent++;
    if (!core.motion) draw(t);
    schedule();
  }
  function handle(data) {
    if (data.type !== 'havenLink') return false;
    if (data.event === 'status') {
      state.linked = !!data.linked;
      state.paired = !!data.paired;
      state.connection = String(data.connection || 'off');
      if (window.HavenFriend) HavenFriend.setLinked(state.linked && state.paired, native);
      if (!state.linked) {
        code = '';
        $('linkCodeWrap').hidden = true;
      }
      render();
    } else if (data.event === 'code') {
      if (typeof data.code === 'string' && /^HL1-[A-Za-z0-9_-]{43}$/.test(data.code)) {
        code = data.code;
        $('linkCode').value = code;
        $('linkCodeWrap').hidden = false;
        $('linkShareCode').hidden = !canShare();
        feedback(
          canShare()
            ? 'Tap Send invite. Your friend taps the link to make Eye Contact.'
            : 'Copy this code and send it to your friend. They paste it under I have an invite.'
        );
      }
    } else if (data.event === 'profile') {
      // Their HAVEN's DNA arrived: from now on their real eye appears here.
      if (window.HavenFriend) HavenFriend.receive(data.profile);
    } else if (data.event === 'paired') {
      if (window.HavenFriend) HavenFriend.setLinked(true, native);
      feedback('Eye Contact established. They recognize each other.');
      core.react('link-hello', now());
      core.aim(-0.55, -0.7, now() + 300, 260);
      schedule();
    } else if (data.event === 'outgoing') {
      if (valid.includes(data.kind)) reactSignal(data.kind, 'outgoing');
    } else if (data.event === 'incoming') {
      if ([...valid, 'resonance'].includes(data.kind)) reactSignal(data.kind, 'incoming');
    } else if (data.event === 'invite') {
      // Opened from a friend's invite link: everything is filled in, one tap to connect.
      const found = findCode(data.code);
      if (found && !state.linked) {
        openPanel('linkSheet');
        $('linkJoinForm').hidden = false;
        $('linkJoinCode').value = found;
        feedback('Your friend invited you. Tap Connect eyes.');
        $('linkJoin').focus();
      } else if (state.linked)
        feedback('Already in Eye Contact. End it first to connect with someone else.');
    } else if (data.event === 'copied') {
      feedback('Pairing secret copied. Send it only to your friend.');
    } else if (data.event === 'error') {
      feedback(String(data.message || 'Eye Contact is unavailable').slice(0, 120));
    }
    return true;
  }
  function pulse(kind) {
    if (!state.linked || !state.paired || !valid.includes(kind)) return false;
    native('linkPulse', kind);
    return true;
  }
  $('linkOpen').onclick = () => {
    openPanel('linkSheet');
    native('linkStatus');
  };
  $('linkClose').onclick = () => openPanel('settings');
  $('linkCreate').onclick = () => {
    $('linkJoinForm').hidden = true;
    feedback('Making your private invite…');
    native('linkCreate');
  };
  $('linkJoinToggle').onclick = () => {
    $('linkJoinForm').hidden = !$('linkJoinForm').hidden;
    if (!$('linkJoinForm').hidden) $('linkJoinCode').focus();
  };
  $('linkJoin').onclick = () => {
    const value = findCode($('linkJoinCode').value);
    if (!value) {
      feedback("That doesn't contain an invite. Paste the whole message from your friend.");
      return;
    }
    feedback('Making Eye Contact…');
    native('linkJoin', value);
    $('linkJoinCode').value = '';
  };
  $('linkJoinCode').addEventListener('input', () => {
    const found = findCode($('linkJoinCode').value);
    if (found && found !== $('linkJoinCode').value) $('linkJoinCode').value = found;
    if (found) feedback('Found the invite. Tap Connect eyes.');
  });
  $('linkPaste').onclick = async () => {
    try {
      const found = findCode(await navigator.clipboard.readText());
      if (found) {
        $('linkJoinCode').value = found;
        feedback('Found the invite. Tap Connect eyes.');
        return;
      }
      feedback("Your clipboard doesn't have an invite in it.");
    } catch (e) {
      $('linkJoinCode').focus();
      feedback('Long-press the box and choose Paste.');
    }
  };
  $('linkShareCode').onclick = () => native('linkShareCode');
  $('linkJoinCode').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      $('linkJoin').click();
    }
  });
  $('linkRevealCode').onclick = () => native('linkShowCode');
  $('linkCopyCode').onclick = () => native('linkCopyCode');
  $('linkHideCode').onclick = () => {
    $('linkCodeWrap').hidden = true;
    code = '';
    $('linkCode').value = '';
  };
  $('linkUnlink').onclick = () => {
    const t = performance.now();
    if (t > unpairUntil) {
      unpairUntil = t + 4500;
      $('linkUnlink').textContent = 'Tap again to end';
      setTimeout(() => {
        if (performance.now() >= unpairUntil) $('linkUnlink').textContent = 'End Eye Contact';
      }, 4650);
      return;
    }
    unpairUntil = 0;
    $('linkUnlink').textContent = 'End Eye Contact';
    native('linkUnlink');
    feedback('Eye Contact ended.');
  };
  for (const [id, kind] of [
    ['linkSendPulse', 'pulse'],
    ['linkSendSpark', 'spark'],
    ['linkSendCalm', 'calm']
  ]) {
    $(id).onclick = () => pulse(kind);
  }
  // A *deliberate* two-finger hold over the pupil; never piggyback on an
  // unrelated two-finger swipe, zoom gesture, music-control hold or folder drag.
  function cancelGesture() {
    if (gesture) {
      clearTimeout(gesture.timer);
      gesture = null;
    }
  }
  function isOnEye(touch) {
    const size = Math.min(innerWidth * 0.235, 101, innerHeight * 0.125);
    const dx = (touch.clientX - innerWidth * 0.5) / Math.max(1, size * 1.19);
    const dy = (touch.clientY - innerHeight * 0.49) / Math.max(1, size * 1.23);
    return dx * dx + dy * dy <= 1;
  }
  document.addEventListener(
    'touchstart',
    (e) => {
      if (!state.paired || getPanel() || !e.touches || e.touches.length !== 2) return;
      const points = [...e.touches];
      if (!points.every(isOnEye)) return;
      cancelGesture();
      iris.cancel();
      gesture = {
        start: points.map((t) => ({ id: t.identifier, x: t.clientX, y: t.clientY })),
        timer: null,
        fired: false
      };
      const held = gesture;
      held.timer = setTimeout(() => {
        if (gesture !== held) return;
        held.fired = true;
        pulse('pulse');
      }, 650);
    },
    { passive: true, capture: true }
  );
  document.addEventListener(
    'touchmove',
    (e) => {
      if (!gesture) return;
      if (e.touches.length !== 2) {
        cancelGesture();
        return;
      }
      for (const t of e.touches) {
        const first = gesture.start.find((p) => p.id === t.identifier);
        if (!first || Math.hypot(t.clientX - first.x, t.clientY - first.y) > 19) {
          cancelGesture();
          return;
        }
      }
    },
    { passive: true, capture: true }
  );
  document.addEventListener('touchend', cancelGesture, { passive: true, capture: true });
  document.addEventListener('touchcancel', cancelGesture, { passive: true, capture: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) cancelGesture();
  });
  render();
  return { handle, pulse, cancelGesture, state, render, diagnostics: () => ({ ...state }) };
};

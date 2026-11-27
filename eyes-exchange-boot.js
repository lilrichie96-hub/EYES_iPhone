/* EYES 4.9 · Eye Exchange, page-start half. Loads BEFORE haven-dna.js (after eyes-legacy.js on Android).

   A traded Eye arrives by rewriting the creature keys every module already reads (haven.dna.v1,
   haven.growth.v1, haven.personality.v1) on a fresh page, so no running module can write the old Eye's
   state into the new Eye's keys. The running page (eyes-exchange.js) writes a journal only after the
   server has confirmed the exchange; this file finishes it at the next page start. Every step can be
   repeated, so a crash or a closed app at any point finishes correctly next time.

   - Android: eyes-legacy.js owns the creature keys and finishes the journal itself (op 'exchange'), so the
     collection keeps every Eye you raised. This file does nothing there.
   - iPhone (no Legacy): this file applies fray.exchange.journal.v1.

   The Eye's habits with its old person (eyes.mind.v1) are that person's, so they never travel: they are kept
   on this phone (in case the Eye ever comes home) and the arriving Eye starts learning its new home. */
'use strict';
(function (root) {
  // the page that starts after an exchange stays dark until the arrival begins (no flash of an empty home)
  try { if (root.sessionStorage && sessionStorage.getItem('eyes.exchange.arrive')) document.documentElement.classList.add('xx-arriving'); } catch (e) {}
  if (root.EyesLegacy) return;
  const JOURNAL = 'fray.exchange.journal.v1', STORE = 'eyes.exchange.v1';
  const LIVE = ['haven.growth.v1', 'haven.personality.v1', 'haven.dna.v1'];
  let LS = null; try { LS = root.localStorage; } catch (e) {}
  if (!LS) return;
  const get = (k) => { try { return LS.getItem(k); } catch (e) { return null; } };
  const parse = (v) => { try { return JSON.parse(v); } catch (e) { return null; } };
  const raw = get(JOURNAL); if (raw == null) return;
  const j = parse(raw);
  const result = { op: 'exchange', ok: false };
  try {
    const d = j && j.inSnap && parse(j.inSnap['haven.dna.v1']);
    if (!j || j.op !== 'exchange' || !d || !Number.isFinite(Number(d.seed))) { LS.removeItem(JOURNAL); result.why = 'unreadable'; }
    else {
      if (!j.phase) {                                              // 1: keep the leaving Eye's habits with its person
        const st = parse(get(STORE)) || {};
        const mind = get('eyes.mind.v1');
        if (mind && j.out) { st.minds = st.minds && typeof st.minds === 'object' ? st.minds : {}; st.minds[j.out] = mind; const ks = Object.keys(st.minds); while (ks.length > 3) delete st.minds[ks.shift()]; }
        LS.setItem(STORE, JSON.stringify(st));
        j.phase = 1; LS.setItem(JOURNAL, JSON.stringify(j));
      }
      if (j.phase === 1) {                                         // 2: the arriving Eye's own keys
        const st = parse(get(STORE)) || {};
        const mind = st.minds && st.minds[j.to];                   // it lived here before: its habits with you come back
        for (const k of LIVE) { if (typeof j.inSnap[k] === 'string') LS.setItem(k, j.inSnap[k]); else LS.removeItem(k); }
        if (mind) LS.setItem('eyes.mind.v1', mind); else LS.removeItem('eyes.mind.v1');
        LS.removeItem(JOURNAL);
        result.ok = true; result.to = j.to; result.tid = j.tid;
      }
    }
  } catch (e) { result.why = 'storage: ' + (e && e.message); }       // the journal stays; next start finishes it
  root.EyesExchangeBoot = result;
})(window);

/* EYES 5.0 · Rename your Eye.
   The nickname is display information, not identity. Changing it never touches the Eye's seed (its permanent id),
   DNA, temperament, appearance, growth, memories, journal, friends, histories, Passport or exchange records: only
   the name stored with the Eye (haven.dna.v1 → name) changes, through the existing HavenDNA.rename().

   Where you do it: The Optic → Eye.D. → the small pencil beside its name (Save / Cancel).
   What follows on its own, through the mechanisms that already exist:
     - every screen that shows the Eye reads its name live (home, Eye Contact, Meeting Space, Hangouts, duels,
       the Eye Dex card, Passport summaries)
     - HavenDNA announces 'haven:dna'; Eye Contact (eyes-friends.js) re-sends the profile to every friend, and a
       profile that couldn't be delivered (offline) is re-sent when the connection returns
     - Android: the My Eyes record (eyes-legacy.js) is refreshed straight away
     - exchanges carry the name current when an offer is made; the write-once exchange history keeps the name it
       was recorded with. While an exchange is in progress, renaming waits until it ends (no offer can change
       under a confirmation that has already been given).
   Validation: the existing limit (14 characters, as every phone and friend already enforces it), trimmed, inner
   spaces collapsed, no empty names, no control or invisible direction characters, no < > & " (other phones strip
   those). Every international letter, accent, script and emoji that fits is kept. Shown only as text. */
'use strict';
(function (root) {
  const MAX = 14;
  // control characters, zero-width and bidirectional controls, BOM
  const HIDDEN = /[\u0000-\u001F\u007F-\u009F\u00AD\u061C\u180E\u200B-\u200F\u2028-\u202E\u2060-\u206F\uFEFF]/;
  function validate(input) {
    let s = String(input == null ? '' : input);
    try { s = s.normalize('NFC'); } catch (e) {}
    if (HIDDEN.test(s.replace(/[\t\n\r]/g, ' '))) return { ok: false, error: 'That name has hidden characters in it. Type it again.' };
    s = s.replace(/[\t\n\r]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!s) return { ok: false, error: 'Your Eye needs a name.' };
    if (/[<>&"]/.test(s)) return { ok: false, error: 'Names can’t use < > & or ".' };
    if (s.length > MAX) return { ok: false, error: `Up to ${MAX} characters.` };
    // never leave half of an emoji at the end
    if (/[\uD800-\uDBFF]$/.test(s)) return { ok: false, error: 'That name doesn’t fit. Try a shorter one.' };
    return { ok: true, name: s };
  }
  function blocked() {
    try { if (root.EyesExchange && EyesExchange.busy && EyesExchange.busy()) return 'An exchange is in progress. You can rename your Eye once it’s finished.'; } catch (e) {}
    try { if (root.HavenAwakening && HavenAwakening.open && !document.getElementById('awaken')?.classList.contains('cardOnly')) return 'Finish waking your Eye first.'; } catch (e) {}
    return '';
  }
  // the one way the name changes: identity, DNA and everything else stay exactly as they are
  function apply(input) {
    const D = root.HavenDNA;
    if (!D || !D.has || !D.has()) return { ok: false, error: 'There is no Eye to rename yet.' };
    const v = validate(input);
    if (!v.ok) return v;
    const why = blocked();
    if (why) return { ok: false, error: why };
    const before = D.summary ? D.summary() : null;
    if (before && before.name === v.name) return { ok: true, name: v.name, unchanged: true };
    D.rename(v.name);
    const after = D.summary ? D.summary() : null;
    if (!after || after.name !== v.name || (before && after.seed !== before.seed)) return { ok: false, error: 'The name couldn’t be saved. Try again.' };
    try { if (root.EyesLegacy && EyesLegacy.checkpoint) EyesLegacy.checkpoint(); } catch (e) {}
    try { root.dispatchEvent(new CustomEvent('eyes:renamed', { detail: { name: v.name, previous: before ? before.name : null } })); } catch (e) {}
    return { ok: true, name: v.name, previous: before ? before.name : null };
  }

  // ---------- the pencil on the Eye.D. card ----------
  const $ = (id) => document.getElementById(id);
  // these controls handle their own events; nothing behind the card (the home screen's gestures) hears them
  const OWN = ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'touchstart', 'touchmove', 'touchend', 'mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu', 'keydown', 'keyup', 'wheel'];
  function keepOwn(node) { for (const t of OWN) node.addEventListener(t, (e) => e.stopPropagation(), t.startsWith('touch') || t === 'wheel' ? { passive: true } : false); }
  function close() {
    const ed = $('bNameEditor'), nm = $('bName'), pen = $('bNameEdit');
    if (ed) ed.remove();
    if (nm) nm.hidden = false;
    if (pen) { pen.hidden = false; }
  }
  function open() {
    const nm = $('bName'), pen = $('bNameEdit');
    if (!nm || $('bNameEditor')) return;
    const why = blocked();
    const ed = document.createElement('div');
    ed.id = 'bNameEditor'; ed.className = 'bname-editor'; ed.setAttribute('role', 'group'); ed.setAttribute('aria-label', 'Rename your Eye');
    ed.setAttribute('data-aw-own', '');
    keepOwn(ed);
    const input = document.createElement('input');
    input.type = 'text'; input.maxLength = MAX; input.autocomplete = 'off'; input.spellcheck = false; input.enterKeyHint = 'done';
    input.setAttribute('aria-label', 'Your Eye’s name');
    try { input.value = root.HavenDNA.summary().name || ''; } catch (e) { input.value = nm.textContent || ''; }
    const msg = document.createElement('p');
    msg.className = 'bname-msg'; msg.setAttribute('role', 'alert');
    const row = document.createElement('div'); row.className = 'bname-row';
    const save = document.createElement('button'); save.type = 'button'; save.className = 'bname-save'; save.textContent = 'Save';
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'ghost bname-cancel'; cancel.textContent = 'Cancel';
    row.append(cancel, save);
    ed.append(input, msg, row);
    nm.hidden = true; if (pen) pen.hidden = true;
    nm.insertAdjacentElement('afterend', ed);
    const done = () => {
      const r = apply(input.value);
      if (!r.ok) { msg.textContent = r.error; input.focus(); return; }
      nm.textContent = r.name;                          // text only, never markup
      close();
      if (pen) pen.focus({ preventScroll: true });
    };
    save.addEventListener('click', (e) => { e.preventDefault(); done(); });
    cancel.addEventListener('click', (e) => { e.preventDefault(); close(); if (pen) pen.focus({ preventScroll: true }); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); done(); }
      else if (e.key === 'Escape') { e.preventDefault(); close(); }
    });
    input.addEventListener('input', () => { if (msg.textContent) msg.textContent = ''; });
    if (why) { msg.textContent = why; save.disabled = true; input.disabled = true; }
    else setTimeout(() => { input.focus(); input.select(); }, 30);
  }
  function decorate() {
    const nm = $('bName'), box = $('awaken');
    if (!nm || !box) return;
    close();
    let pen = $('bNameEdit');
    const viewOnly = box.classList.contains('cardOnly');
    if (!viewOnly) { if (pen) pen.hidden = true; return; }   // the birth already has its own Rename
    if (!pen) {
      pen = document.createElement('button');
      pen.id = 'bNameEdit'; pen.type = 'button'; pen.className = 'bname-edit';
      pen.setAttribute('data-aw-own', '');
      keepOwn(pen);
      pen.setAttribute('aria-label', 'Rename your Eye');
      pen.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4ZM13.5 6.5l4 4"/></svg>';
      pen.addEventListener('click', (e) => { e.preventDefault(); open(); });
      nm.insertAdjacentElement('afterend', pen);
    }
    pen.hidden = false;
  }
  function hook() {
    const A = root.HavenAwakening;
    if (!A || A.__renameHooked || typeof A.showSaved !== 'function') return false;
    const orig = A.showSaved;
    A.showSaved = function (...args) { const r = orig.apply(this, args); try { decorate(); } catch (e) {} return r; };
    A.__renameHooked = true;
    return true;
  }
  if (!hook()) addEventListener('DOMContentLoaded', hook, { once: true });
  // the card closes: leave nothing half-edited behind
  addEventListener('haven:dna', () => { const nm = $('bName'); try { if (nm && !$('bNameEditor')) nm.textContent = root.HavenDNA.summary().name; } catch (e) {} });

  root.EyesRename = { validate, apply, open, close, MAX };
})(typeof window === 'undefined' ? globalThis : window);

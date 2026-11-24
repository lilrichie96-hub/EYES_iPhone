# EYES for iPhone · 2.5.0 · Living Abilities

This release adds browser-safe versions of four Android ability concepts in a new ability satellite (✦): **Pocket Dimension** (notes, links, photo keepsakes in IndexedDB, explicit JSON backup/restore), **Pocket Arcade** (a lightweight touch-based underground crystal game), **Weather Organ** (real Open-Meteo weather by city or opt-in location), and **Vision** (permission-based live camera, photo capture, and QR scanning when Safari exposes BarcodeDetector). It also respects Eye Contact relay Retry-After responses to reduce request flooding.

The iPhone versions are adapted experiences, not byte-identical Android modules. iOS web apps cannot observe system battery/charging state, control other apps' music or notifications, become the default home launcher, or receive Android-style incoming share intents. Pocket stays local to the Home Screen app unless exported. Back up keepsakes before clearing website data. Camera access stops when Vision closes or EYES is backgrounded.

**Existing users:** no reinstall, no new Eye, no friendship re-pairing. The 2.5.0 service-worker cache updates when the web app opens online; close/reopen once if an older screen remains. Keep the original app icon and origin; user storage keys for existing identity/contacts remain unchanged.

---

# EYES for iPhone · 2.4.0 · Distant Connections

New in 2.4.0: Distant Visits (a friend's Eye comes by when you return) and Mirror (in the Meeting Space). New files: `eyes-visits.js`, `eyes-mirror.js`, `eyes-mirror.css`; cache is `eyes-web-2.4.0`. Storage keys unchanged; `eyes.visits.v1` is added. Keep the live `eyes-config.js` when uploading.

## 2.3.0 · A Mind of Its Own

New in 2.3.0:
- **A Mind of Its Own**: gentle, local, opt-out learning across days; favorite idle gestures, a more familiar greeting, an anticipatory lean toward a pet, playful curiosity and occasional wary wake-ups.
- **Choreography**: new memory-aware poses use existing priority arbitration, gaze-first attention and smooth blends without overriding notifications or music.
- **Privacy**: no accounts, logs, chores, daily streaks, or tracking; The Optic can pause or erase the habits; encrypted Eye Passport includes them.
- **No change** to Eye Contact, Duel, DNA, installs, or skins.

New in 2.2.2:
- **Eye Passport** (The Optic → Help & backup, and on the welcome screen): an encrypted backup of the whole Eye,
  including friends and their history, Eye Dex and Play. Keepsake codes still work.
- **Honest senses**: no more fake 100% battery. The Eye follows its personality and the time of day.
- **Eye Contact**: Awake now / Not open / Can't tell. Faster reconnection, 90 s challenges between updated Eyes,
  and no one-sided "wins" from silence.
- **Battles with an Android friend's original Eye Contact** once their phone runs 4.2.2 (secure upgrade, no new invite).
- **Fairer Peekaboo** for shy Eyes (only between updated Eyes; older Eyes keep the original rules).

## Updating the site (Patch)
Upload all files over the repo (keep `.nojekyll`, `icons/`, and the live `eyes-config.js`). New in 2.3.0: `eyes-mind.js`; cache is `eyes-web-2.3.0`. Storage keys are unchanged, so every Eye and pairing survives.

---

# EYES for iPhone · 2.2.1 · Battle Lite

New in 2.2.1: **Eye Duel**. Challenge a friend's Eye from the Meeting Space (Battle button). They get a card to
Stare back or decline, then the two real Eyes have a quick turn-based duel (Glare / Blink / Charge / one
temperament special). It has synthesized sound (duel only, with a mute button). Nothing is saved and nothing about either Eye changes. Full notes are in the handoff zip.

## Updating the site (Patch)
Upload all files over the repo (keep `.nojekyll`, `icons/`, and the live `eyes-config.js` if it was customised).
New files: `eyes-duel.js`, `eyes-duel.css`. The cache name is `eyes-web-2.2.1`, so phones pick it up on their next
launch with signal. Existing storage keys are unchanged (the only new one is `eyes.duel.sound`), so every Eye and pairing survives.

---


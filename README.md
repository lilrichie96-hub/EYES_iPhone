# EYES for iPhone 2.5.0 — Original Android 4.4.9 abilities

This update uses the **actual Android 4.4.9 ability modules** and their existing animations, not substitute web games or simplified UI. The original Ability Wheel, Vision iris opening, Tunnelbug Pocket Arcade gameplay/pixel renderer/audio, Pocket Dimension swallowing and storage, Weather Organ atmosphere, and illustrated clock/temperament polish were ported into the existing iPhone living Eye and DNA renderer.

Browser-specific bridges replace only hardware/OS integrations: camera via permission-gated `getUserMedia`, real QR detection from the original decoder, real weather from Open-Meteo and opt-in location/city selection, Pocket files via an explicit browser file picker and Safari-compatible IndexedDB byte storage, plus export/restore. iPhone web apps cannot read battery charge/other apps' music, become the home launcher, or receive Android system-wide share intents.

**Existing users:** Same Home Screen icon, Eye DNA, Eye Contact friends and local storage. No reinstall or new Eye is required. The 2.5.0 PWA service worker updates on reopening online; close/reopen once if an older screen remains. Export Pocket backups for important keepsakes. This release also adds 429 relay cooldown handling.

**Quality gate:** Chromium and WebKit automated tests verify original Tunnelbug active play, original Pocket animated UI/photo import/storage/reload and actual backup/restore, Weather/Vision original lenses, eye identity persistence, and no overlapping dock; screenshots are produced as GitHub Actions artifacts. Real-device camera/geolocation and Safari/Home Screen behavior still require manual acceptance testing.

Public `/get/` marketing/download page intentionally remains unchanged until the planned website redesign.

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


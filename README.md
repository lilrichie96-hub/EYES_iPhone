# EYES for iPhone · 2.2.2 · The Foundation Patch

New in 2.2.2:
- **Eye Passport** (The Optic → Help & backup, and on the welcome screen): an encrypted backup of the whole Eye,
  including friends and their history, Eye Dex and Play. Keepsake codes still work.
- **Honest senses**: no more fake 100% battery. The Eye follows its personality and the time of day.
- **Eye Contact**: Awake now / Not open / Can't tell. Faster reconnection, 90 s challenges between updated Eyes,
  and no one-sided "wins" from silence.
- **Battles with an Android friend's original Eye Contact** once their phone runs 4.2.2 (secure upgrade, no new invite).
- **Fairer Peekaboo** for shy Eyes (only between updated Eyes; older Eyes keep the original rules).

## Updating the site (Patch)
Upload all files over the repo (keep `.nojekyll`, `icons/`, and the live `eyes-config.js`). The new file is
`eyes-passport.js`. The cache name is `eyes-web-2.2.2`. Storage keys are unchanged, so every Eye and pairing survives.

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


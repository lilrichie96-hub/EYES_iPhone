# EYES for iPhone · 2.2.1 · Battle Lite

New in 2.2.1: **Eye Duel**. Challenge a friend's Eye from the Meeting Space (Battle button). They get a card to
Stare back or decline, then the two real Eyes have a quick turn-based duel (Glare / Blink / Charge / one
temperament special). It has synthesized sound (duel only, with a mute button). Nothing is saved and nothing about either Eye changes. Full notes are in the handoff zip.

## Updating the site (Patch)
Upload all files over the repo (keep `.nojekyll`, `icons/`, and the live `eyes-config.js` if it was customised).
New files: `eyes-duel.js`, `eyes-duel.css`. The cache name is `eyes-web-2.2.1`, so phones pick it up on their next
launch with signal. Existing storage keys are unchanged (the only new one is `eyes.duel.sound`), so every Eye and pairing survives.

---


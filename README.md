# EYES for iPhone · v1.1.1

**The real EYES, minus the launcher.** This is the same page that runs inside the Android app (EYES 3.2),
with the Android bridge answered in the browser. So her Eye has the same body, moods, sleep, dreams,
quirks, greetings, eyelid and iris detail, skins, Eye.D. card, growth, evolution and full-body Eye Contact
reactions as an Android EYES. Only the launcher parts (apps, dock, folders, notifications, music, battery)
are switched off.

New in 1.1 (and in Android 3.2): **Senses** in The Optic
- **Tilt to look**: tip the phone and its gaze rolls toward the low side (iPhone asks once for motion access).
- **Bedside**: left still and flat at night (or alone late at night), it falls asleep and the screen dims
  around it. Touch it or pick the phone up to wake it. Optional: keep the screen on while it sleeps.
- **Their eye nearby**: in Eye Contact, their Eye rests faintly in its corner, brighter right after a signal.
Also in 1.1.1: **one eye renderer** everywhere (birth, home, Eye.D., Eye Contact, their peeking eye)
are the very same picture, shared with Android 3.2 (`eye-render.js`).
Also: a **Keepsake code** (The Optic → Help & backup) that restores the Eye, its growth and settings.

## Updating the site (Patch)
Upload **all** these files over the old ones in the GitHub repo (keep `icons/` and `.nojekyll`).
1.0's `eyes-app.js` and `eyes-boot.js` are no longer used; delete them or leave them, either is fine.
Phones pick it up on their next launch with signal.

**Her Eye survives the update**: same storage keys (`haven.dna.v1`, `haven.growth.v1`) and the same Eye
Contact link (`eyes.link.v1`), so she stays paired. Her 1.0 copy of your Eye carries over too.

## First-time setup (unchanged)
Safari → link → Share → Add to Home Screen → open EYES from the Home Screen → Wake your Eye.
Eye Contact: The Optic (top-right) → Eye Contact → I have an invite / Make an invite.

## Files
The Android 3.2 web assets (`index.html`, `launcher.js`, `presence.js`, `personality.js`, …) plus:
`eyes-web-shim.js` (window.Phone in the browser) · `eyes-link.js` (Eye Contact protocol, verified against
Android's Java crypto) · `eyes-web-shell.js` (install/welcome, keepsake, trims The Optic) · `eyes-web.css` ·
`sw.js` · `manifest.webmanifest` · `icons/`. `eyes-senses.js` is shared with Android 3.2.
Android-only files (app-management, iris, home-gestures…) are present because launcher.js loads them; on
iPhone they have nothing to show.

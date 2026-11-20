# EYES for iPhone · 2.1.0 · Eye Contact 2.0

The real EYES page (shared with Android 4.1.0) as a Home Screen web app on GitHub Pages.

New in 2.1.0: **Eye Contact 2.0**
- the Living Constellation (your Eye with your friends' real Eyes around it);
- the Meeting Space (two Eyes, personality-driven);
- new Pulse/Spark/Calm with tap or drag;
- honest delivery ("felt it" only when their phone confirms);
- new invitations with QR, Share, Copy and live pairing steps;
- `#join=` invite links that never join in Safari's separate storage.

See the release notes in the handoff zip.

## Updating the site (Patch)
Upload all files over the repo (keep `.nojekyll`, `icons/`, and the live `eyes-config.js` if it was customised).
The cache name is `eyes-web-2.1.0`, so phones pick it up on their next launch with signal. Storage keys are unchanged
(`haven.dna.v1`, `haven.growth.v1`, `eyes.friends.v1`, `eyes.dex.v1`, …), so every Eye and every pairing survives.

## First-time setup (unchanged)
Safari → link → Share → Add to Home Screen → open EYES from the Home Screen → Wake your Eye.
Eye Contact: dock → Friends → Invite / Join.

## Files
Shared with Android 4.1.0: `index.html` (+ iPhone head/screens), `launcher.js`, `eyes-friends.js` (protocol),
`eyes-social.js`, `eyes-contact.js/.css` (Eye Contact 2.0), `eye-render.js`, `haven-dna.js`, etc.
iPhone only:
- `eyes-web-shim.js`;
- `eyes-web-shell.js`: install, welcome, keepsake, card and invite links;
- `eyes-web.css`, `sw.js`, `manifest.webmanifest`, `icons/`.

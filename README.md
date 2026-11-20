# EYES for iPhone (web app) · v1.0.0

The eye without the launcher, for iPhones. Plain static files: no build step, no server code.
Same genes, births, growth, evolution and Eye.D. cards as the Android app (shares `haven-dna.js` /
`awakening.js`), and **Eye Contact works with Android EYES/HAVEN** (same HL1 codes, same encrypted relay).

## For Patch: hosting on GitHub Pages (about 5 minutes)
1. On GitHub, create a new **public** repository, e.g. `eyes`.
2. Upload **everything in this folder** to the root of the repo (keep the `icons/` folder and the hidden
   `.nojekyll` file). The web uploader works: "Add file → Upload files", drag the folder contents in, commit.
3. Repo **Settings → Pages** → Source: **Deploy from a branch**, Branch: **main**, folder **/ (root)** → Save.
4. Wait a minute; the site appears at `https://<github-username>.github.io/eyes/` (shown on the Pages screen).
   It must be HTTPS (GitHub Pages always is).
5. Send that link to whoever is getting an eye.

Updating later: upload the changed files over the old ones. Bump `CACHE` in `sw.js` when you do, so phones
pick up the new version (they also update by themselves on the next launch with signal).

## For her: getting the eye
1. Open the link **in Safari** on the iPhone.
2. Share button → **Add to Home Screen** → Add.
3. Open **EYES from the Home Screen** (not Safari) and tap **Wake your eye**. The eye lives in the Home
   Screen app; Safari keeps separate storage, which is why the page asks to be installed first.
4. Tap **··· → Keepsake** and save the code in Notes. It restores the eye if the app is ever removed
   ("I have a keepsake code" on the first screen).

## Eye Contact with an Android EYES
- On the Android: Eye Contact → create an invite → send her the message (or she makes one and sends it to you).
- On the iPhone: Eye Contact → **I have an invite** → paste → Connect. The green dot means linked.
- Pulse / spark / calm buttons appear once linked. A pulse answered within 9 s becomes **resonance**.
- Joining a new code replaces whatever link that phone had before (one link per eye, as on Android).
- iPhones can't run things in the background: signals play when EYES is open. Signals that arrive while it's
  closed (up to 12 h) show as "while you were away".
- Android 3.0 shows a 3.1/iPhone eye without its birth nudge (colour/temperament lean); 3.1 shows it exactly.

## What's not here (iOS limits)
No launcher, widgets, lock screen, or haptics. No push notifications yet.

## Files
`index.html` shell · `eyes-app.js` home, sheets, signal effects, keepsake · `eyes-link.js` Eye Contact protocol ·
`haven-dna.js`, `awakening.js`, `awakening.css` shared with Android 3.1 (awakening has two tiny hooks:
`EYES_HOLD_BIRTH` and `EYES_HOME_TARGET`) · `sw.js` offline cache · `manifest.webmanifest`, `icons/`.

## Eye Contact protocol (decoded from the Android app's native HavenLink)
- Code `HL1-` + base64url(32 random bytes) = the shared AES-256 key.
- Topic on https://ntfy.sh: `haven_link_` + hex(SHA-256(ascii "HAVEN-LINK-TOPIC-1" ‖ key)) first 22 bytes.
- Message body: `HL1.` + base64url(iv[12] ‖ AES-GCM ciphertext+tag[16]) of JSON
  `{v:1, s:<sender id>, k:<pulse|spark|calm|resonance|hello|profile>, t:<ms>, n:<16-char nonce>, p?:<profile json ≤1024 B>}`.
- Subscribe: `GET /<topic>/json?since=<last id | 30m>`; publish: `POST /<topic>` (priority min, no Firebase).
- Pairing: the joiner posts `hello`; the first other sender heard becomes the peer and gets `hello` back.
  Receivers drop: >12 h old, own id, non-peer after pairing, repeated nonce, profile before pairing;
  signals >10 min old don't play live.

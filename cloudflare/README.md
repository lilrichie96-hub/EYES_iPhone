# EYES 4.0 — optional iPhone push notifications

The EYES 4.0 iPhone website is already live. This page describes **only** the additional Cloudflare Worker needed for notifications **while the Home Screen app is closed**. You do not need it for Friends, Eye Dex, Play, or normal Eye Contact while EYES is open.

## Cloudflare setup

1. In your own [Cloudflare dashboard](https://dash.cloudflare.com/), go to **Workers & Pages → Create → Worker**. Call it `eyes-push`. Deploy the default Worker.
2. Open **Edit code**, replace the default code with [worker.js](./worker.js), then deploy again.
3. Under **Storage & Databases → KV**, create a namespace named `EYES_KV`. In the new Worker's **Settings → Bindings**, add a KV binding whose variable name is exactly `EYES_KV`, and select the namespace.
4. Open the Worker's `https://eyes-push.<your-subdomain>.workers.dev/` URL **privately**. Before secrets are set, this generates a new pair of VAPID keys. Copy the keys from the **same page load**. Do not share them.
5. In **Settings → Variables and Secrets**, set:
   - `VAPID_PUBLIC` — generated base64url public key (secret)
   - `VAPID_PRIVATE_JWK` — generated matching JWK JSON private key (**secret**)
   - `VAPID_SUBJECT` — `mailto:` plus an email address you control (text)
6. Deploy again. Reopen the Worker's root URL. It should return `{"eyes":"push relay","ready":true}`. The `/vapid` endpoint should return a public key.

## Connect the existing apps

For the iPhone website, edit [eyes-config.js](../eyes-config.js) in the EYES_iPhone repository. Keep `site` exactly as-is; change only `pushServer` to the new `https://eyes-push.<your-subdomain>.workers.dev` URL. The next Pages deployment will give users that configuration on the existing link.

On Android EYES 4.0, open **The Optic → Friends → Connections** and enter the same Worker URL and the website URL `https://lilrichie96-hub.github.io/EYES_iPhone/`.

On an iPhone running **iOS 16.4 or later**, open EYES from the **Home Screen icon**, grant notification permission when the app requests it, then test a pulse from a linked Android friend while EYES is closed. Notifications cannot be delivered without the Worker/VAPID/KV configuration.

## Privacy and limitations

The relay does not need names or the underlying Eye Contact messages. It receives a secret-derived mailbox identifier and a signal type. Its source is [worker.js](./worker.js). iPhones can receive web push while their Home Screen EYES app is closed; Android's native app does not use this web push mechanism.

Keep VAPID private keys inside Cloudflare secret variables; do not commit them to GitHub or paste them into chat. If keys are replaced after subscriptions are created, phones may need to re-register.

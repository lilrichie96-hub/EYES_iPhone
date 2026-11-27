/* EYES website settings — the only file Patch needs to edit before publishing.
   Nothing here is secret. The page reads it once; it writes nothing to the browser
   (no cookies, no localStorage), so it can't touch the EYES iPhone app's data. */
window.EYES_SITE = {
  // Android download. Paste the URL of the verified, signed APK here.
  // Keep the SAME URL the current /get/ page uses, so existing links and bookmarks keep working.
  // While this is empty, the Android buttons jump to the install section and say the download is being prepared.
  apkUrl: './EYES_4.9.0_build126_SIGNED.apk',
  apkVersion: '5.0.0 (build 129)',
  apkSha256: 'b40020c359cbb3114209eb4b6f6a52bbd151e7a96724b6196f0b37302a8e7123',            // optional: shown under the download button when filled in

  // The EYES iPhone app (the repository root, NOT this /get/ page).
  iphoneUrl: 'https://lilrichie96-hub.github.io/EYES_iPhone/',
  iphoneVersion: '3.0.0',

  // Problem reports. Leave empty to hide the line.
  supportEmail: 'lilrichie96@gmail.com',

  // Features that can be hidden before launch without editing the page.
  //   'show'    → shown normally
  //   'testing' → shown with a "Testing" badge and a short caution
  //   'hide'    → removed from the page (nav links, sections, FAQ answers)
  features: {
    exchange: 'show'        // Eye Exchange: 'show' (default, per Richie: include every feature), 'testing' adds a badge + caution, 'hide' removes it
  }
};

import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // Permanent once published. Reverse-DNS id for the MPRC research group's app
  // (used identically on Google Play and the App Store).
  appId: 'dk.mprc.treatmentcompanion',
  appName: 'Treatment Companion',

  // A tiny offline fallback lives in www/ (shown only while connecting / when
  // offline). The real UI is loaded from server.url below.
  webDir: 'www',

  server: {
    // The live web app. While developing the native shell you can point this at
    // a local dev server (e.g. http://192.168.x.x:3000 with cleartext: true) or
    // a staging URL, then switch back to production for the store build.
    url: 'https://treatment-companion.vercel.app',
    androidScheme: 'https',
    iosScheme: 'https',
    cleartext: false
  }
};

export default config;

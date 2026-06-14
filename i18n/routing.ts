import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['en', 'da', 'sv', 'nb'],
  defaultLocale: 'en',
  // 'as-needed' keeps the URL clean for the default locale.
  // English: /  Danish: /da
  localePrefix: 'as-needed',
  // Disable automatic locale detection from the Accept-Language header.
  // We want URL paths to be deterministic so testing on Danish-language
  // phones still lets you visit `/` to see English.
  localeDetection: false
});

export type AppLocale = (typeof routing.locales)[number];
